"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const BUSINESS_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/setup", label: "Setup" },
];

export default function Nav() {
  const path = usePathname();

  if (path === "/login") return null;
  if (path.startsWith("/share/")) return null;
  if (path === "/capture") return null;

  const onFamily = path.startsWith("/family");

  return (
    <nav className="flex items-center gap-1 px-4 sm:px-8 pt-5 pb-2 max-w-6xl mx-auto">
      {/* Business-mode pills — hidden when on family pages */}
      {!onFamily && BUSINESS_LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={
              active
                ? "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border bg-primary text-background border-primary"
                : "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border border-white/10 text-muted hover:border-white/20 hover:text-foreground transition-all"
            }
          >
            {l.label}
          </Link>
        );
      })}

      {/* Family-mode label */}
      {onFamily && (
        <span className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border bg-primary text-background border-primary">
          Family
        </span>
      )}

      {/* Toggle — far right */}
      <Link
        href={onFamily ? "/" : "/family"}
        className="ml-auto text-[10px] font-bold uppercase tracking-widest text-muted/50 hover:text-foreground border border-white/10 hover:border-white/20 rounded-lg px-2.5 py-1.5 transition-all"
      >
        {onFamily ? "← Business" : "Family →"}
      </Link>
    </nav>
  );
}
