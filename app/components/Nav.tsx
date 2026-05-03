"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/receipts", label: "Receipts" },
  { href: "/capture", label: "Capture" },
  { href: "/deadlines", label: "Deadlines" },
  { href: "/setup", label: "Setup" },
  { href: "/documents", label: "Documents" },
];

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="flex gap-1 flex-wrap px-4 sm:px-8 pt-5 pb-2 max-w-6xl mx-auto">
      {LINKS.map((l) => {
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
    </nav>
  );
}
