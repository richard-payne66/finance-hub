import { api as faApi, isConnected as faConnected } from "@/app/lib/freeagent";
import { loadAuditLog, summarise } from "@/app/lib/audit-log";

// Monthly "you're fine" digest. Computed here (not in the route) so the
// /digest PAGE can call it directly server-side — fetching its own API URL
// goes through the auth middleware with no session cookie and 500s.

type FaTxn = { amount: string; dated_on: string };

export type DigestData = {
  period: { from: string; to: string; label: string };
  money_in: number;
  money_out: number;
  net: number;
  txn_count: number;
  auto_categorised: number;
  reviewed_personal: number;
  one_liner: string;
  things_to_do: string[];
  things_going_well: string[];
  generated_at: string;
};

const GBP = (n: number) => `£${Math.abs(Math.round(n)).toLocaleString("en-GB")}`;

function periodLabel(_from: Date, to: Date): string {
  return to.toLocaleString("en-GB", { month: "long", year: "numeric" });
}

export async function getDigest(monthsBack: number): Promise<DigestData> {
  monthsBack = Math.max(0, monthsBack || 0);

  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const periodStart = new Date(target.getFullYear(), target.getMonth(), 1);
  const periodEnd = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59);
  const periodStartISO = periodStart.toISOString().slice(0, 10);
  const periodEndISO = periodEnd.toISOString().slice(0, 10);

  let money_in = 0, money_out = 0, txn_count = 0;

  // FreeAgent failures shouldn't sink the page — degrade to the audit-log view.
  try {
    if (await faConnected()) {
      const banks = await faApi<{ bank_accounts: Array<{ url: string; is_personal: boolean; status: string; is_primary?: boolean }> }>("/bank_accounts");
      const primary = banks.bank_accounts.find((b) => !b.is_personal && b.status === "active" && b.is_primary);
      if (primary) {
        for (let page = 1; page <= 6; page++) {
          const r = await faApi<{ bank_transactions: FaTxn[] }>(
            `/bank_transactions?bank_account=${encodeURIComponent(primary.url)}&per_page=50&page=${page}`
          );
          const txns = r.bank_transactions ?? [];
          let inPeriod = 0;
          for (const t of txns) {
            const d = t.dated_on;
            if (d < periodStartISO || d > periodEndISO) continue;
            inPeriod++;
            const amt = parseFloat(t.amount);
            if (amt > 0) money_in += amt; else money_out += Math.abs(amt);
          }
          txn_count += inPeriod;
          if (txns.length < 50 || (txns[txns.length - 1]?.dated_on ?? "9999") < periodStartISO) break;
        }
      }
    }
  } catch {
    // ignore — figures stay at 0, page still renders
  }

  const log = await loadAuditLog().catch(() => []);
  const inWindow = log.filter((e) => {
    const d = e.created_at.slice(0, 10);
    return d >= periodStartISO && d <= periodEndISO;
  });
  const auto_categorised = inWindow.filter((e) => e.action === "auto_applied").length;
  const reviewed_personal = inWindow.filter((e) => e.action === "skipped_personal").length;
  const queued = inWindow.filter((e) => e.action === "queued_for_review").length;

  const net = money_in - money_out;
  const positive = net >= 0;

  const one_liner = txn_count === 0
    ? `${periodLabel(periodStart, periodEnd)} was very quiet — nothing landed in the bank.`
    : positive
      ? `In ${periodLabel(periodStart, periodEnd)}, you earned ${GBP(money_in)}, spent ${GBP(money_out)}, and ${GBP(net)} stayed in the business.`
      : `In ${periodLabel(periodStart, periodEnd)}, you earned ${GBP(money_in)} and spent ${GBP(money_out)} — that's ${GBP(net)} more out than in.`;

  const things_to_do: string[] = [];
  if (queued > 0) things_to_do.push(`Review ${queued} categorisation${queued !== 1 ? "s" : ""} that need a human eye (2 min).`);

  const things_going_well: string[] = [];
  if (auto_categorised > 0) things_going_well.push(`${auto_categorised} transaction${auto_categorised !== 1 ? "s were" : " was"} categorised automatically.`);
  if (reviewed_personal > 0) things_going_well.push(`${reviewed_personal} personal-looking spend${reviewed_personal !== 1 ? "s" : ""} correctly kept out of the books.`);
  const recentSummary = summarise(log, 30);
  if (recentSummary.auto_applied >= 10) things_going_well.push("Your AI bookkeeper is keeping pace — no backlog building up.");

  return {
    period: { from: periodStartISO, to: periodEndISO, label: periodLabel(periodStart, periodEnd) },
    money_in, money_out, net, txn_count, auto_categorised, reviewed_personal,
    one_liner, things_to_do, things_going_well,
    generated_at: new Date().toISOString(),
  };
}
