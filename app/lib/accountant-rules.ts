// Hard-coded pattern rules from accountant guidance (Sukh Kooner / AccKent, June 2026).
// These match common bank transaction descriptions to the correct FreeAgent
// category NAME, before Claude is consulted.  We match by category description
// substring because FA category URLs are opaque and change between accounts.
//
// Source document: "FreeAgent Bookkeeping Notes.docx"

export type AccountantHint = {
  /** Substring to match against FaCategory.description (case-insensitive) */
  category_name_fragment: string;
  /** Human-readable reason shown in the review queue */
  reason: string;
  /** 0..1 — how certain we are (≥0.85 qualifies for auto-approve under £350) */
  confidence: number;
};

export function getAccountantHint(description: string): AccountantHint | null {
  const d = description.toLowerCase();

  // ── HMRC payments ────────────────────────────────────────────────────────
  // Must be most-specific first so "HMRC VAT" doesn't fall through to PAYE.
  if (d.includes("hmrc") || d.includes("h m revenue") || d.includes("hm revenue")) {

    if (/(corp\b|corporation|ct\b|ct600|ct reference|company tax)/.test(d)) {
      return {
        category_name_fragment: "Corporation Tax",
        reason: "HMRC Corporation Tax payment — accountant guidance",
        confidence: 0.95,
      };
    }

    if (d.includes("vat")) {
      return {
        category_name_fragment: "VAT",
        reason: "HMRC VAT payment — accountant guidance",
        confidence: 0.97,
      };
    }

    if (/paye|\bni\b|national insurance|employer.s ni|employers ni/.test(d)) {
      return {
        category_name_fragment: "PAYE/NI",
        reason: "HMRC PAYE / NI payment — accountant guidance",
        confidence: 0.95,
      };
    }

    if ((d.includes("self") && d.includes("assess")) || /\bsa\d{3}\b/.test(d)) {
      // Self-Assessment paid from business account = treat as dividend draw
      return {
        category_name_fragment: "Dividend",
        reason: "Self-Assessment from business account — categorise as Dividend per accountant (personal expense drawn as dividend)",
        confidence: 0.82,
      };
    }

    // Generic HMRC — likely tax but type unclear; surface with moderate confidence
    return {
      category_name_fragment: "Corporation Tax",
      reason: "HMRC payment — likely tax. Check: Corp Tax / VAT / PAYE/NI?",
      confidence: 0.45,
    };
  }

  // ── Pension contributions to Vanguard ─────────────────────────────────────
  if (d.includes("vanguard")) {
    return {
      category_name_fragment: "Pension (Personal",
      reason: "Vanguard pension contribution — accountant guidance",
      confidence: 0.97,
    };
  }

  // ── Director dividend payments ────────────────────────────────────────────
  if (d.includes("dividend")) {
    return {
      category_name_fragment: "Dividend",
      reason: "Director dividend payment — accountant guidance",
      confidence: 0.95,
    };
  }

  // ── Director salary / bonuses ─────────────────────────────────────────────
  if (/salary|net salary|wages/.test(d)) {
    return {
      category_name_fragment: "Net Salary",
      reason: "Director salary payment — accountant guidance",
      confidence: 0.92,
    };
  }

  // ── Expense reimbursement to director ─────────────────────────────────────
  if (d.includes("expense") && (d.includes("reimburse") || d.includes("repay"))) {
    return {
      category_name_fragment: "Expense Payment",
      reason: "Director expense reimbursement — accountant guidance",
      confidence: 0.88,
    };
  }

  return null;
}

// ── Reference table ───────────────────────────────────────────────────────────
// Full guidance from Sukh — shown on the /setup page and /how-it-works.
export const ACCOUNTANT_GUIDE: {
  heading: string;
  category: string;
  notes?: string;
}[] = [
  {
    heading: "Dividends paid to yourself",
    category: "Money Paid to User > Dividend",
  },
  {
    heading: "Your salary",
    category: "Money Paid to User > Net Salary and Bonuses",
  },
  {
    heading: "Corporation Tax to HMRC",
    category: "Payment > Corporation Tax",
  },
  {
    heading: "VAT to HMRC",
    category: "Payment > VAT",
    notes: "You have a direct debit — great.",
  },
  {
    heading: "PAYE / NI to HMRC",
    category: "Payment > PAYE/NI",
    notes: "Ensure direct debit is set up in Business Gateway.",
  },
  {
    heading: "Self-Assessment to HMRC (from business account)",
    category: "Money Paid to User > Dividend",
    notes: "SA is a personal expense. If paid from the business account, categorise as a dividend draw.",
  },
  {
    heading: "Pension contributions to Vanguard",
    category: "Payment > Pension (Personal / Stakeholder)",
  },
  {
    heading: "Transfers to personal account (dividend / salary)",
    category: "Money Paid to User > Dividend or Net Salary and Bonuses",
    notes: "Only dividend or salary. If reimbursing a logged expense, use Expense Payment instead.",
  },
  {
    heading: "Director expense reimbursement",
    category: "Money Paid to User > Expense Payment",
    notes: "Log the expense first, then reimburse. Or just categorise the bank transfer as the original expense type.",
  },
  {
    heading: "Transfer between Monzo pots / between bank accounts",
    category: "Transfer from/to Another Account > [select the correct account]",
    notes: "FreeAgent usually auto-categorises the other side — double-check it did.",
  },
  {
    heading: "Business expenses on personal card",
    category: "Log as expense + reimburse, OR categorise the bank transfer as the expense type",
  },
];
