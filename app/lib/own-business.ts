// "Is this receipt actually one of MY OWN invoices?"
//
// Gmail's from: filter catches outgoing invoices sent direct from
// @richard-payne.com, but FreeAgent (and Stripe, GoCardless, etc.)
// send invoice notification emails on Richard's behalf from their own
// SMTP infrastructure. Those slip past the from: exclusion and end up
// being extracted by Claude — with Richard's own company as the
// "supplier".
//
// This second-line filter compares Claude's extracted supplier name
// against a known list of Richard's own business identities. If it
// matches, the receipt is *not* an expense — it's revenue we shouldn't
// be importing on the expenses side at all.
//
// Configurable via env var OWN_BUSINESS_NAMES (comma-separated). The
// defaults cover Richard Payne LTD in every casing/wording I've seen
// on his FA-issued invoices.

const DEFAULT_OWN_NAMES = [
  "Richard Payne Ltd",
  "Richard Payne LTD",
  "Richard Payne Limited",
  "Richard Payne",
  "RP Ltd",
];

function loadOwnNames(): string[] {
  const env = process.env.OWN_BUSINESS_NAMES;
  const list = env ? env.split(",").map((s) => s.trim()).filter(Boolean) : DEFAULT_OWN_NAMES;
  return list.map(normalise);
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'']/g, "")        // strip punctuation
    .replace(/\s+/g, " ")          // collapse whitespace
    .replace(/\b(limited|ltd)\b/g, "ltd") // unify ltd / limited
    .trim();
}

let _own: string[] | null = null;
function ownList(): string[] {
  if (_own == null) _own = loadOwnNames();
  return _own;
}

// Returns true when the supplier string clearly identifies one of
// Richard's own business identities (so the "receipt" is actually one
// of his outgoing invoices being notified to him by FA / Stripe / etc).
export function isOwnBusiness(supplier: string | null | undefined): boolean {
  if (!supplier) return false;
  const n = normalise(supplier);
  return ownList().some((own) => n === own || n.startsWith(own + " ") || n.endsWith(" " + own));
}
