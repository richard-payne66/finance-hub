// Saved direct links to the HMRC + Companies House pages Richard actually uses.
// Static gov.uk landing pages (each has a "Pay now" / sign-in button), so these
// URLs are stable and won't 404. No data fetching needed.

type LinkItem = { label: string; href: string; note?: string };

const PAY: LinkItem[] = [
  { label: "Pay Self Assessment", href: "https://www.gov.uk/pay-self-assessment-tax-bill", note: "Payments on account" },
  { label: "Pay Corporation Tax", href: "https://www.gov.uk/pay-corporation-tax" },
  { label: "Pay VAT", href: "https://www.gov.uk/pay-vat", note: "On Direct Debit" },
  { label: "Pay employers' PAYE", href: "https://www.gov.uk/pay-paye-tax" },
];

const MANAGE: LinkItem[] = [
  { label: "Business Tax Account", href: "https://www.tax.service.gov.uk/business-account", note: "See what's owed / paid" },
  { label: "Personal Tax Account", href: "https://www.tax.service.gov.uk/personal-account" },
  { label: "Companies House", href: "https://www.gov.uk/file-your-confirmation-statement", note: "Confirmation statement" },
];

function LinkButton({ item }: { item: LinkItem }) {
  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-background border border-white/8 hover:border-white/25 transition-colors"
    >
      <span className="text-[12px] font-bold text-foreground/90 leading-tight">{item.label} ↗</span>
      {item.note && <span className="text-[10px] text-muted/50 leading-tight">{item.note}</span>}
    </a>
  );
}

export default function HMRCLinksCard() {
  return (
    <div className="mb-6 bg-surface border border-white/8 rounded-2xl p-5">
      <p className="text-[9px] font-bold uppercase tracking-widest text-muted/50 mb-3">
        🏦 HMRC &amp; Companies House · quick links
      </p>
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 mb-2">Pay</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {PAY.map((i) => <LinkButton key={i.href} item={i} />)}
      </div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50 mb-2">View / manage</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {MANAGE.map((i) => <LinkButton key={i.href} item={i} />)}
      </div>
    </div>
  );
}
