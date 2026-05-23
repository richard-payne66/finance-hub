import { NextResponse } from "next/server";
import { db } from "@/app/lib/db";
import { errorResponse } from "@/app/lib/api-helpers";
import type { OptimisationFlags, OptimisationFlag } from "@/app/api/optimisation-flags/route";
import type { DdFlags } from "@/app/api/dd-flags/route";

// A curated list of plain-English optimisations for a sole-director Ltd.
// Each item has an estimated annual saving. We show the user the ones
// they HAVEN'T marked as done, sorted by saving descending.

export type Tip = {
  id: OptimisationFlag | "dd_vat" | "dd_corp_tax" | "dd_paye" | "categorise_queue";
  title: string;
  why: string;
  estimated_saving: number;          // £/yr
  difficulty: "easy" | "medium" | "needs_accountant";
  action_url?: string;               // external link if relevant
  internal_link?: string;            // internal route if there's a UI for it
  status: "todo" | "done" | "in_progress";
};

export type OptimisationsResponse = {
  total_potential_saving: number;    // sum of estimated_saving for todo items
  done_count: number;
  todo_count: number;
  tips: Tip[];
};

async function loadKvJson<T>(key: string): Promise<T | null> {
  const { data } = await db().from("kv").select("value").eq("key", key).maybeSingle();
  if (!data) return null;
  try { return JSON.parse(data.value) as T; } catch { return null; }
}

export async function GET() {
  try {
    const optFlags = (await loadKvJson<OptimisationFlags>("optimisation_flags")) ?? {};
    const ddFlags = (await loadKvJson<DdFlags>("dd_flags")) ?? {};

    // Categorisation queue size (signals "money-leaks-as-uncategorised-spend")
    const auditLog = (await loadKvJson<Array<{ action: string }>>("auto_categorisations_log")) ?? [];
    const queuedCount = auditLog.filter((e) => e.action === "queued_for_review").length;

    const tips: Tip[] = [
      {
        id: "salary_at_12570",
        title: "Switch salary to £12,570/year",
        why:
          "If you're on minimum wage, you're paying NI you don't need to. £12,570 = the personal allowance — zero tax, zero NI, still earns state pension credit. Saves ~£500/year.",
        estimated_saving: 500,
        difficulty: "needs_accountant",
        action_url: "https://www.gov.uk/national-insurance-rates-letters",
        status: optFlags.salary_at_12570 ? "done" : "todo",
      },
      {
        id: "pension_company",
        title: "Employer pension contribution from the company",
        why:
          "The company pays into your pension pre-tax — reduces your Corporation Tax bill AND grows your retirement pot. Even £200/month is £456/year off your tax bill (19% CT relief).",
        estimated_saving: 1200,
        difficulty: "medium",
        action_url: "https://www.nestpensions.org.uk/",
        status: optFlags.pension_company ? "done" : "todo",
      },
      {
        id: "dividends_vouchered",
        title: "Document every dividend with a voucher",
        why:
          "Without dated dividend vouchers HMRC can re-class withdrawals as director's loan — potentially £1000s in s455 charges + extra tax. Quick win, zero cost.",
        estimated_saving: 1500,
        difficulty: "easy",
        status: optFlags.dividends_vouchered ? "done" : "todo",
      },
      {
        id: "home_office_claim",
        title: "Claim £6/week home office allowance",
        why:
          "Flat-rate £312/year, no receipts needed. Reduces Corporation Tax by ~£59. If you work from home even occasionally, take it.",
        estimated_saving: 59,
        difficulty: "easy",
        status: optFlags.home_office_claim ? "done" : "todo",
      },
      {
        id: "trivial_benefits",
        title: "£300/year tax-free 'trivial benefits' to yourself",
        why:
          "As a director you can give yourself up to 6× £50 gifts per year (max £300) — tax-free, NI-free, no P11D needed. Save the receipts and put through the company.",
        estimated_saving: 100,
        difficulty: "easy",
        status: optFlags.trivial_benefits ? "done" : "todo",
      },
      {
        id: "mileage_claim",
        title: "Claim 45p/mile for business car trips",
        why:
          "Site visits, client meetings — track them and the company pays you tax-free mileage. £50-200/year for most directors who occasionally drive for work.",
        estimated_saving: 100,
        difficulty: "easy",
        status: optFlags.mileage_claim ? "done" : "todo",
      },
      {
        id: "dd_vat",
        title: "Set up Direct Debit for VAT",
        why:
          "Late VAT = automatic surcharge (2-15% of the bill). DD removes that risk completely. Takes 60 seconds at HMRC.",
        estimated_saving: 200,
        difficulty: "easy",
        internal_link: "/settings/dd",
        action_url: "https://www.gov.uk/pay-vat/direct-debit",
        status: ddFlags.vat ? "done" : "todo",
      },
      {
        id: "dd_corp_tax",
        title: "Set up Direct Debit for Corporation Tax",
        why:
          "Late CT triggers daily interest (currently 8%) + £100-200 penalties. Set the DD when you file each year.",
        estimated_saving: 150,
        difficulty: "easy",
        internal_link: "/settings/dd",
        action_url: "https://www.gov.uk/pay-corporation-tax/direct-debit",
        status: ddFlags.corp_tax ? "done" : "todo",
      },
      {
        id: "dd_paye",
        title: "Set up Variable DD for PAYE & NI",
        why:
          "HMRC withdraws the exact PAYE amount each month — no manual payment, no risk of being late.",
        estimated_saving: 100,
        difficulty: "easy",
        internal_link: "/settings/dd",
        action_url: "https://www.gov.uk/pay-paye-tax/direct-debit",
        status: ddFlags.paye ? "done" : "todo",
      },
      {
        id: "categorise_queue",
        title: `Categorise ${queuedCount} transactions awaiting review`,
        why:
          "Every uncategorised expense is potentially a deduction you're missing. The AI has suggestions ready — just confirm or override.",
        estimated_saving: Math.round(queuedCount * 5), // ballpark: £5 tax saved per categorised txn
        difficulty: "easy",
        internal_link: "/review",
        status: queuedCount === 0 ? "done" : "in_progress",
      },
    ];

    // Sort: todo first by saving desc, in_progress next, done last
    tips.sort((a, b) => {
      const order: Record<Tip["status"], number> = { todo: 0, in_progress: 1, done: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return b.estimated_saving - a.estimated_saving;
    });

    const todoTips = tips.filter((t) => t.status === "todo");
    const total_potential_saving = todoTips.reduce((s, t) => s + t.estimated_saving, 0);

    return NextResponse.json<OptimisationsResponse>({
      total_potential_saving,
      done_count: tips.filter((t) => t.status === "done").length,
      todo_count: tips.filter((t) => t.status === "todo").length,
      tips,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
