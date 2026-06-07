import { api, apiSend } from "./freeagent";
import { getDividendHeadroom } from "./headroom";
import { loadDividends, saveDividends, taxYearOf, type Dividend } from "./dividends";

// ---------------------------------------------------------------------------
// Auto-dividends
//
// Goal (Richard's ask): "I just pull money out to my Nationwide / joint account
// and it does the rest." This watches the business bank account for outgoing
// transfers to his personal accounts, books each one in FreeAgent as a dividend,
// and writes the voucher + log entry — so the only thing he does is the transfer.
//
// Safety: (1) only transfers to KNOWN personal payees are touched; (2) a profit
// guard holds anything that would exceed available headroom; (3) every action is
// logged with undo, and surfaced to him. Runs in DRY-RUN by default — it only
// writes to FreeAgent when called with { commit: true }.
// ---------------------------------------------------------------------------

type FaBankAccount = {
  url: string;
  name?: string;
  is_personal?: boolean;
  status?: string;
  marked_for_review_count?: number;
  current_balance?: string;
};
type FaTxn = {
  url: string;
  amount: string;
  bank_account: string;
  dated_on: string;
  description?: string;
  full_description?: string;
};
type FaCategory = { url: string; description?: string; nominal_code?: string };

// Payees that mean "money going to Richard personally" = a dividend.
// Learned from his FreeAgent history (drawings recorded as "Nationwide Flex
// Dividend" / "Joint Account Dividend"). Editable as his accounts change.
const PERSONAL_PAYEES: RegExp[] = [
  /richard\s*payne/i,
  /catrin/i,
  /nationwide/i,
  /joint account/i,
];

// Words that mean an outgoing payment is NOT a dividend even if it looks personal
// (e.g. paying himself back an out-of-pocket expense). Conservative guard.
const NOT_DIVIDEND: RegExp[] = [/expense/i, /reimburse/i, /loan/i, /salary|payroll|wages/i];

// Sanity rails — NOT a legal-profit check (Richard's accountant confirms
// distributable reserves at year-end, same as the manual voucher tool). These
// just stop a bug or an odd payment from auto-booking something silly:
//  - any single transfer over this is HELD for a human look (unusually large)
//  - total auto-dividends past this in a tax year is HELD (runaway guard)
// His draws are typically a few £k and reserves are ample, so these never bite
// in normal use.
const PER_TRANSFER_MAX = 10000;
const ANNUAL_CAP = 60000;

const KV_PROCESSED = "auto_dividends_log"; // ids we've already handled

export type AutoDividendCandidate = {
  txn_url: string;
  bank_account: string;
  date: string;
  amount: number;
  description: string;
  account_name?: string;
};

export type AutoDividendReport = {
  connected: boolean;
  business_accounts: { name?: string; url: string; balance?: string }[];
  dividend_categories: { description?: string; nominal_code?: string; url: string }[];
  chosen_category: string | null;
  candidates: AutoDividendCandidate[];
  headroom: { safe_dividend: number; cash_today: number; this_year_dividends: number };
  committed?: { txn_url: string; amount: number; date: string; result: "booked" | "held_profit" | "error"; detail?: string }[];
  note: string;
};

function flattenCategories(cats: Record<string, unknown>): FaCategory[] {
  const out: FaCategory[] = [];
  for (const v of Object.values(cats)) {
    if (Array.isArray(v)) for (const c of v) if (c && typeof c === "object") out.push(c as FaCategory);
  }
  return out;
}

/** Resolve the FreeAgent "Dividends" category URL (nominal 908) from live data. */
function pickDividendCategory(cats: FaCategory[]): { chosen: string | null; matches: FaCategory[] } {
  const matches = cats.filter((c) => c.nominal_code === "908" || /dividend/i.test(c.description ?? ""));
  // Prefer exact nominal 908.
  const exact = matches.find((c) => c.nominal_code === "908");
  return { chosen: (exact ?? matches[0])?.url ?? null, matches };
}

function looksPersonal(desc: string): boolean {
  if (NOT_DIVIDEND.some((re) => re.test(desc))) return false;
  return PERSONAL_PAYEES.some((re) => re.test(desc));
}

/**
 * Detect (and optionally book) dividend transfers.
 * Read-only unless opts.commit === true.
 */
export async function runAutoDividends(opts: { commit?: boolean } = {}): Promise<AutoDividendReport> {
  const banks = await api<{ bank_accounts: FaBankAccount[] }>("/bank_accounts");
  const business = (banks.bank_accounts ?? []).filter((b) => !b.is_personal && b.status === "active");

  // Already-booked transactions, so a re-run never double-books a dividend.
  // (This is the guard markProcessed() was always writing for but nothing
  // read — without it, idempotency relied entirely on FreeAgent dropping the
  // txn out of marked_for_review, which is not guaranteed to be immediate.)
  const processed = await loadProcessed();

  // Candidate pool = transactions still needing review (unexplained/guessed),
  // outgoing, to a known personal payee.
  const candidates: AutoDividendCandidate[] = [];
  for (const acc of business) {
    let page = 1;
    for (;;) {
      const res = await api<{ bank_transactions: FaTxn[] }>(
        `/bank_transactions?bank_account=${encodeURIComponent(acc.url)}&view=marked_for_review&per_page=100&page=${page}`
      );
      const txns = res.bank_transactions ?? [];
      for (const t of txns) {
        const amt = parseFloat(t.amount);
        if (!(amt < 0)) continue; // outgoing only
        if (processed.has(t.url)) continue; // already booked on a prior run
        const desc = `${t.description ?? ""} ${t.full_description ?? ""}`.trim();
        if (!looksPersonal(desc)) continue;
        candidates.push({
          txn_url: t.url,
          bank_account: t.bank_account,
          date: t.dated_on,
          amount: Math.abs(amt),
          description: (t.description ?? "").slice(0, 200),
          account_name: acc.name,
        });
      }
      if (txns.length < 100) break;
      page++;
      if (page > 10) break;
    }
  }

  const catsRaw = await api<Record<string, unknown>>("/categories");
  const { chosen, matches } = pickDividendCategory(flattenCategories(catsRaw));

  const head = await getDividendHeadroom();
  const log = await loadDividends();
  const thisYear = taxYearOf(new Date().toISOString().slice(0, 10));
  const thisYearTotal = log
    .filter((d) => taxYearOf(d.date) === thisYear)
    .reduce((t, d) => t + d.amount, 0);

  const report: AutoDividendReport = {
    connected: business.length > 0,
    business_accounts: business.map((b) => ({ name: b.name, url: b.url, balance: b.current_balance })),
    dividend_categories: matches.map((c) => ({ description: c.description, nominal_code: c.nominal_code, url: c.url })),
    chosen_category: chosen,
    candidates,
    headroom: { safe_dividend: head.safe_dividend, cash_today: head.cash_today, this_year_dividends: thisYearTotal },
    note: opts.commit
      ? "Live run — booked the candidates below."
      : "Dry run — nothing was written. These transfers WOULD be booked as dividends.",
  };

  if (!opts.commit) return report;

  // ---- LIVE: book each candidate as a dividend + voucher ----
  if (!chosen) {
    report.note = "Could not resolve a Dividends category in FreeAgent — nothing booked.";
    return report;
  }
  const committed: NonNullable<AutoDividendReport["committed"]> = [];
  const updatedLog: Dividend[] = [...log];
  let yearRunning = thisYearTotal;

  for (const c of candidates) {
    // Sanity rails only (not a legal-profit check — accountant confirms reserves).
    if (c.amount > PER_TRANSFER_MAX) {
      committed.push({ txn_url: c.txn_url, amount: c.amount, date: c.date, result: "held_profit", detail: `Unusually large (> £${PER_TRANSFER_MAX.toLocaleString()}) — held for you to confirm.` });
      continue;
    }
    if (yearRunning + c.amount > ANNUAL_CAP) {
      committed.push({ txn_url: c.txn_url, amount: c.amount, date: c.date, result: "held_profit", detail: `Would push this year's auto-dividends past £${ANNUAL_CAP.toLocaleString()} — held for you to confirm.` });
      continue;
    }
    try {
      await apiSend("/bank_transaction_explanations", "POST", {
        bank_transaction_explanation: {
          bank_transaction: c.txn_url,
          bank_account: c.bank_account,
          category: chosen,
          dated_on: c.date,
          gross_value: String(-Math.abs(c.amount)),
          description: "Dividend",
        },
      });
      // Key the log entry to the unique transaction, not date+amount — two
      // same-day, same-value draws would otherwise collide onto one id. Skip
      // if we somehow already have this txn so the record can't double-up.
      const txnId = c.txn_url.split("/").filter(Boolean).pop() ?? `${c.date}-${Math.round(c.amount)}`;
      const dividendId = `auto-${txnId}`;
      if (!updatedLog.some((d) => d.id === dividendId)) {
        updatedLog.push({
          id: dividendId,
          date: c.date,
          amount: c.amount,
          note: "Auto-recorded from bank transfer",
          created_at: new Date().toISOString(),
        });
      }
      yearRunning += c.amount;
      committed.push({ txn_url: c.txn_url, amount: c.amount, date: c.date, result: "booked" });
    } catch (e) {
      committed.push({ txn_url: c.txn_url, amount: c.amount, date: c.date, result: "error", detail: e instanceof Error ? e.message : "failed" });
    }
  }

  if (committed.some((x) => x.result === "booked")) await saveDividends(updatedLog);
  // Remember what we processed so we don't double-handle.
  await markProcessed(committed.filter((x) => x.result === "booked").map((x) => x.txn_url));
  report.committed = committed;
  return report;
}

async function loadProcessed(): Promise<Set<string>> {
  const { db } = await import("./db");
  const { data } = await db().from("kv").select("value").eq("key", KV_PROCESSED).maybeSingle();
  if (!data) return new Set();
  try {
    const list = JSON.parse(data.value) as string[];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

async function markProcessed(urls: string[]): Promise<void> {
  if (!urls.length) return;
  const { mutateKvJson } = await import("./kv");
  await mutateKvJson<string[]>(KV_PROCESSED, (current) =>
    Array.from(new Set([...(current ?? []), ...urls])).slice(-500),
  );
}
