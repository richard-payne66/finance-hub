"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, Cell, LabelList,
} from "recharts";
import type {
  FamilyAccount, FamilyExpense, FamilyIncome, FamilyLiability, FamilyGoal,
  FamilySnapshot, FamilyDocument, ChecklistItem,
  AccountType, AccountOwner, TaxWrapper, ExpenseFrequency, IncomeType,
  LiabilityType, GoalCategory,
} from "@/app/lib/family";

// ── Formatting ───────────────────────────────────────────────────────────────
const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp = (n: number) => GBP.format(isFinite(n) ? Math.round(n) : 0);
function gbpShort(n: number) {
  if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(1)}m`;
  if (Math.abs(n) >= 1_000) return `£${(n / 1000).toFixed(0)}k`;
  return `£${Math.round(n)}`;
}
function toMonthly(amount: number, freq: ExpenseFrequency): number {
  if (freq === "weekly") return (amount * 52) / 12;
  if (freq === "quarterly") return amount / 3;
  if (freq === "annual") return amount / 12;
  return amount;
}
function futureValue(balance: number, monthly: number, annualPct: number, years: number): number {
  const r = annualPct / 100 / 12;
  const m = years * 12;
  if (r === 0) return balance + monthly * m;
  return balance * Math.pow(1 + r, m) + monthly * ((Math.pow(1 + r, m) - 1) / r);
}
function mortgageStats(balance: number, monthly: number, annualRate: number) {
  if (balance <= 0 || monthly <= 0) return null;
  const r = annualRate / 100 / 12;
  if (r <= 0) { const months = Math.ceil(balance / monthly); return { months, totalInterest: 0, monthlyInterest: 0, monthlyCapital: monthly }; }
  const monthlyInterest = balance * r;
  const monthlyCapital = monthly - monthlyInterest;
  if (monthlyCapital <= 0) return null;
  const months = Math.ceil(-Math.log(1 - (balance * r) / monthly) / Math.log(1 + r));
  return { months, totalInterest: monthly * months - balance, monthlyInterest, monthlyCapital };
}
function overpaymentStats(balance: number, monthly: number, annualRate: number, extra: number) {
  const base = mortgageStats(balance, monthly, annualRate);
  const next = mortgageStats(balance, monthly + extra, annualRate);
  if (!base || !next) return null;
  return { monthsSaved: base.months - next.months, interestSaved: base.totalInterest - next.totalInterest };
}

// ── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_GROWTH: Record<AccountType, number> = { cash: 1, savings: 2.5, investment: 5, pension: 5, other: 3 };
const ISA_ALLOWANCE = 20000;
const TAX_YEAR_END = "5 Apr 2027";

const ACCOUNT_TYPES: { key: AccountType; label: string }[] = [
  { key: "savings", label: "Savings" }, { key: "investment", label: "Investments" },
  { key: "pension", label: "Pensions" }, { key: "cash", label: "Cash" }, { key: "other", label: "Other" },
];
const TAX_WRAPPERS: { key: TaxWrapper; label: string }[] = [
  { key: "isa", label: "ISA" }, { key: "lisa", label: "LISA" }, { key: "pension", label: "Pension" },
  { key: "sipp", label: "SIPP" }, { key: "gia", label: "GIA" }, { key: "cash", label: "Cash" }, { key: "other", label: "Other" },
];
const OWNERS: { key: AccountOwner; label: string }[] = [
  { key: "rich", label: "Rich" }, { key: "cat", label: "Cat" }, { key: "joint", label: "Joint" },
];
const FREQS: ExpenseFrequency[] = ["weekly", "monthly", "quarterly", "annual"];
const INCOME_TYPES: { key: IncomeType; label: string }[] = [
  { key: "salary", label: "Salary" }, { key: "dividend", label: "Dividend" },
  { key: "rental", label: "Rental" }, { key: "benefit", label: "Benefit" }, { key: "other", label: "Other" },
];
const LIABILITY_TYPES: { key: LiabilityType; label: string }[] = [
  { key: "mortgage", label: "Mortgage" }, { key: "loan", label: "Personal loan" },
  { key: "credit_card", label: "Credit card" }, { key: "car_finance", label: "Car finance" }, { key: "other", label: "Other" },
];
const GOAL_CATS: { key: GoalCategory; label: string }[] = [
  { key: "house", label: "House" }, { key: "savings", label: "Savings" }, { key: "car", label: "Car" },
  { key: "holiday", label: "Holiday" }, { key: "retirement", label: "Retirement" }, { key: "education", label: "Education" }, { key: "other", label: "Other" },
];
const CATEGORY_LABELS: Record<string, string> = {
  joint: "Joint household", kids: "Kids", cat_personal: "Cat personal",
  rich_personal: "Rich personal", joint_fun: "Joint fun",
};
const catLabel = (c: string) => CATEGORY_LABELS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, " "));
const CAT_COLOURS: Record<string, string> = {
  joint: "#E6FF00", kids: "#60a5fa", cat_personal: "#f472b6", rich_personal: "#a78bfa", joint_fun: "#34d399",
};
const catColour = (c: string) => CAT_COLOURS[c] ?? "#888";
const inp = "w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/40 transition-colors";
const SECTION_KEYS = ["income", "out", "accounts", "liabilities", "goals", "planner", "docs"] as const;

// ── Section component ─────────────────────────────────────────────────────────
function Section({ title, subtitle, open, onToggle, badge, warn, children, showDragHandle }: {
  title: string; subtitle?: string; open: boolean; onToggle: () => void;
  badge?: string; warn?: boolean; children: React.ReactNode; showDragHandle?: boolean;
}) {
  return (
    <div className={`bg-surface border rounded-2xl overflow-hidden ${warn ? "border-warning/35" : "border-white/8"}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors text-left">
        <div className="flex items-center gap-2 min-w-0">
          {showDragHandle && <span className="text-muted/20 hover:text-muted/45 select-none cursor-grab text-base leading-none shrink-0" title="Drag to reorder">⠿</span>}
          <div className="flex items-baseline gap-2 min-w-0">
            <span className={`text-[10px] font-bold uppercase tracking-widest shrink-0 ${warn ? "text-warning" : "text-muted/50"}`}>{title}</span>
            {subtitle && <span className="text-sm font-bold text-foreground truncate">{subtitle}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 ml-3 shrink-0">
          {badge && <span className="text-[10px] text-success font-bold">{badge}</span>}
          {warn && <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />}
          <span className="text-muted/30 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>
      {open && <div className="px-5 pb-5 border-t border-white/6">{children}</div>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FamilyPage() {
  const [accounts, setAccounts] = useState<FamilyAccount[]>([]);
  const [expenses, setExpenses] = useState<FamilyExpense[]>([]);
  const [income, setIncome] = useState<FamilyIncome[]>([]);
  const [liabilities, setLiabilities] = useState<FamilyLiability[]>([]);
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [snapshots, setSnapshots] = useState<FamilySnapshot[]>([]);
  const [docs, setDocs] = useState<FamilyDocument[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [setupNeeded, setSetupNeeded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [snapshotting, setSnapshotting] = useState(false);
  const [projYears, setProjYears] = useState(20);
  const [bigSpend, setBigSpend] = useState(150000);
  const [overpayExtra, setOverpayExtra] = useState(200);
  const [cutIds, setCutIds] = useState<Set<string>>(new Set());
  const toggleCut = (id: string) => setCutIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [sec, setSec] = useState({ income: true, out: true, accounts: true, liabilities: true, goals: true, planner: false, docs: false });
  const tog = (k: keyof typeof sec) => setSec(p => ({ ...p, [k]: !p[k] }));
  const [secOrder, setSecOrder] = useState<string[]>([...SECTION_KEYS]);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Record<string, { summary: string; accounts: Record<string, unknown>[]; expenses: Record<string, unknown>[] }>>({});
  const [uploadKind, setUploadKind] = useState("other");
  const [checklistInput, setChecklistInput] = useState("");

  useEffect(() => {
    setMounted(true);
    try {
      const saved = JSON.parse(localStorage.getItem("family-sec-order") ?? "null");
      if (Array.isArray(saved) && saved.length === SECTION_KEYS.length) setSecOrder(saved);
    } catch {}
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [a, e, inc, lib, g, sn, d, c] = await Promise.all([
        fetch("/api/family/accounts").then(r => r.json()),
        fetch("/api/family/expenses").then(r => r.json()),
        fetch("/api/family/income").then(r => r.json()),
        fetch("/api/family/liabilities").then(r => r.json()),
        fetch("/api/family/goals").then(r => r.json()),
        fetch("/api/family/snapshots").then(r => r.json()),
        fetch("/api/family/documents").then(r => r.json()),
        fetch("/api/family/checklist").then(r => r.json()),
      ]);
      if (a.setupNeeded || e.setupNeeded) setSetupNeeded(true);
      setAccounts(a.accounts ?? []);
      setExpenses(e.expenses ?? []);
      setIncome(inc.income ?? []);
      setLiabilities(lib.liabilities ?? []);
      setGoals(g.goals ?? []);
      setSnapshots(sn.snapshots ?? []);
      setDocs(d.documents ?? []);
      setChecklist(c.items ?? []);
    } catch { /**/ } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived ──
  const monthlyIncome = useMemo(() => income.filter(i => i.active).reduce((s, i) => s + toMonthly(i.amount, i.frequency), 0), [income]);
  const monthlyOut = useMemo(() => expenses.filter(e => e.active).reduce((s, e) => s + toMonthly(e.amount, e.frequency), 0), [expenses]);
  const monthlySurplus = monthlyIncome - monthlyOut;
  const savingsRate = monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : 0;
  const totalAssets = useMemo(() => accounts.reduce((s, a) => s + a.balance, 0), [accounts]);
  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + l.balance, 0), [liabilities]);
  const netWorth = totalAssets - totalLiabilities;
  const liquidSavings = useMemo(() => accounts.filter(a => a.type === "savings" || a.type === "cash").reduce((s, a) => s + a.balance, 0), [accounts]);
  const emergencyMonths = monthlyOut > 0 ? liquidSavings / monthlyOut : 0;
  const savedMonthly = useMemo(() => expenses.filter(e => cutIds.has(e.id)).reduce((s, e) => s + toMonthly(e.amount, e.frequency), 0), [expenses, cutIds]);

  const isaByOwner = useMemo(() => {
    const m: Record<string, number> = { rich: 0, cat: 0 };
    accounts.filter(a => a.taxWrapper === "isa" || a.taxWrapper === "lisa").forEach(a => {
      const k = a.owner === "joint" ? "rich" : a.owner;
      m[k] = (m[k] ?? 0) + a.taxYearContribution;
    });
    return m;
  }, [accounts]);

  const staleAccounts = useMemo(() => accounts.filter(a => {
    if (!a.asOfDate) return false;
    return Math.floor((Date.now() - new Date(a.asOfDate).getTime()) / 86_400_000) > 60;
  }), [accounts]);

  const alerts = useMemo(() => {
    const list: { level: "danger" | "warning" | "info"; msg: string }[] = [];
    liabilities.forEach(l => {
      if (!l.rateExpiryDate) return;
      const days = Math.floor((new Date(l.rateExpiryDate).getTime() - Date.now()) / 86_400_000);
      if (days < 180) list.push({ level: days < 60 ? "danger" : "warning", msg: `${l.name} rate expires ${days < 0 ? `${Math.abs(days)}d ago` : `in ${days} days`}` });
    });
    if (monthlyOut > 0 && emergencyMonths < 3) list.push({ level: "warning", msg: `Emergency fund covers ${emergencyMonths.toFixed(1)} months — aim for 3+` });
    staleAccounts.forEach(a => {
      const days = Math.floor((Date.now() - new Date(a.asOfDate!).getTime()) / 86_400_000);
      list.push({ level: "info", msg: `${a.name} balance is ${days} days old` });
    });
    const isaLeft = (ISA_ALLOWANCE - (isaByOwner["rich"] ?? 0)) + (ISA_ALLOWANCE - (isaByOwner["cat"] ?? 0));
    if (monthlyIncome > 0 && isaLeft > 2000) list.push({ level: "info", msg: `${gbp(isaLeft)} combined ISA allowance unused — resets ${TAX_YEAR_END}` });
    return list;
  }, [liabilities, emergencyMonths, monthlyOut, monthlyIncome, staleAccounts, isaByOwner]);

  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.filter(e => e.active).forEach(e => { map[e.category] = (map[e.category] ?? 0) + toMonthly(e.amount, e.frequency); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const expenseCategories = useMemo(() => {
    const set = new Set<string>(["joint", "kids", "cat_personal", "rich_personal", "joint_fun"]);
    expenses.forEach(e => set.add(e.category));
    return Array.from(set);
  }, [expenses]);

  const expenseChartData = useMemo(() =>
    [...expenses].filter(e => e.active && e.amount > 0)
      .map(e => ({ id: e.id, name: e.name, monthly: toMonthly(e.amount, e.frequency), category: e.category, cut: cutIds.has(e.id) }))
      .sort((a, b) => b.monthly - a.monthly).slice(0, 15),
    [expenses, cutIds]
  );

  const projData = useMemo(() => {
    if (accounts.length === 0) {
      // No accounts yet — show illustrative: what £bigSpend would grow to if invested at 5%
      return Array.from({ length: projYears + 1 }, (_, y) => ({
        label: y === 0 ? "Now" : `+${y}y`,
        baseline: Math.round(futureValue(bigSpend, 0, 5, y)),
        withSpend: 0,
      }));
    }
    const totalNow = accounts.reduce((s, a) => s + a.balance, 0);
    return Array.from({ length: projYears + 1 }, (_, y) => {
      let baseline = 0, withSpend = 0;
      for (const a of accounts) {
        const rate = a.growthRate ?? DEFAULT_GROWTH[a.type];
        baseline += futureValue(a.balance, a.monthlyContribution, rate, y);
        const share = totalNow > 0 ? a.balance / totalNow : 0;
        withSpend += futureValue(Math.max(0, a.balance - bigSpend * share), a.monthlyContribution, rate, y);
      }
      return { label: y === 0 ? "Now" : `+${y}y`, baseline: Math.round(baseline), withSpend: Math.round(withSpend) };
    });
  }, [accounts, projYears, bigSpend]);

  const nwChartData = useMemo(() => [
    ...snapshots.map(s => ({ label: s.snapshotDate.slice(0, 7), netWorth: s.netWorth, proj: undefined as number | undefined })),
    ...Array.from({ length: Math.min(projYears, 20) + 1 }, (_, i) => {
      let v = 0;
      for (const a of accounts) v += futureValue(a.balance, a.monthlyContribution, a.growthRate ?? DEFAULT_GROWTH[a.type], i);
      return { label: i === 0 ? "Now" : `+${i}y`, netWorth: undefined as number | undefined, proj: Math.round(v - totalLiabilities + monthlySurplus * 12 * i * 0.25) };
    }),
  ], [snapshots, accounts, projYears, totalLiabilities, monthlySurplus]);

  const mortgage = liabilities.find(l => l.type === "mortgage") ?? null;
  const mortStats = mortgage?.interestRate ? mortgageStats(mortgage.balance, mortgage.monthlyPayment, mortgage.interestRate) : null;
  const overpayResult = mortgage?.interestRate && overpayExtra > 0 ? overpaymentStats(mortgage.balance, mortgage.monthlyPayment, mortgage.interestRate, overpayExtra) : null;
  const oppCost = (projData[projData.length - 1]?.baseline ?? 0) - (projData[projData.length - 1]?.withSpend ?? 0);
  const monthsToSave = savedMonthly > 0 ? Math.ceil(bigSpend / savedMonthly) : null;

  function moveSection(from: string, to: string) {
    setSecOrder(prev => {
      const next = [...prev];
      const fi = next.indexOf(from), ti = next.indexOf(to);
      if (fi === -1 || ti === -1) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      try { localStorage.setItem("family-sec-order", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // ── CRUD helpers (fire-and-forget optimistic) ──
  const api = (url: string, method: string, body?: unknown) =>
    fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

  async function addIncome(owner: AccountOwner) {
    const d = await api("/api/family/income", "POST", { name: "New income", amount: 0, frequency: "monthly", owner, type: "salary" }).then(r => r.json());
    if (d.income) setIncome(p => [...p, d.income]);
  }
  const patchIncome = (id: string, partial: Record<string, unknown>) => { setIncome(p => p.map(i => i.id === id ? { ...i, ...partial } : i)); api(`/api/family/income/${id}`, "PATCH", partial); };
  const rmIncome = (id: string) => { setIncome(p => p.filter(i => i.id !== id)); api(`/api/family/income/${id}`, "DELETE"); };

  async function addLiability(type: LiabilityType) {
    const d = await api("/api/family/liabilities", "POST", { name: type === "mortgage" ? "Mortgage" : "New liability", type, balance: 0, monthlyPayment: 0 }).then(r => r.json());
    if (d.liability) setLiabilities(p => [...p, d.liability]);
  }
  const patchLiability = (id: string, partial: Record<string, unknown>) => { setLiabilities(p => p.map(l => l.id === id ? { ...l, ...partial } : l)); api(`/api/family/liabilities/${id}`, "PATCH", partial); };
  const rmLiability = async (id: string) => { if (!confirm("Remove?")) return; setLiabilities(p => p.filter(l => l.id !== id)); api(`/api/family/liabilities/${id}`, "DELETE"); };

  async function addGoal(cat: GoalCategory) {
    const d = await api("/api/family/goals", "POST", { name: "New goal", targetAmount: 10000, currentAmount: 0, category: cat }).then(r => r.json());
    if (d.goal) setGoals(p => [...p, d.goal]);
  }
  const patchGoal = (id: string, partial: Record<string, unknown>) => { setGoals(p => p.map(g => g.id === id ? { ...g, ...partial } : g)); api(`/api/family/goals/${id}`, "PATCH", partial); };
  const rmGoal = (id: string) => { setGoals(p => p.filter(g => g.id !== id)); api(`/api/family/goals/${id}`, "DELETE"); };

  async function addAccount(type: AccountType) {
    const d = await api("/api/family/accounts", "POST", { name: "New account", type, owner: "joint", balance: 0 }).then(r => r.json());
    if (d.account) setAccounts(p => [...p, d.account]);
  }
  const patchAccount = (id: string, partial: Record<string, unknown>) => { setAccounts(p => p.map(a => a.id === id ? { ...a, ...partial } : a)); api(`/api/family/accounts/${id}`, "PATCH", partial); };
  const rmAccount = async (id: string) => { if (!confirm("Delete account?")) return; setAccounts(p => p.filter(a => a.id !== id)); api(`/api/family/accounts/${id}`, "DELETE"); };

  async function addExpense(cat: string) {
    const d = await api("/api/family/expenses", "POST", { name: "New expense", amount: 0, frequency: "monthly", category: cat }).then(r => r.json());
    if (d.expense) setExpenses(p => [...p, d.expense]);
  }
  const patchExpense = (id: string, partial: Record<string, unknown>) => { setExpenses(p => p.map(e => e.id === id ? { ...e, ...partial } : e)); api(`/api/family/expenses/${id}`, "PATCH", partial); };
  const rmExpense = (id: string) => { setExpenses(p => p.filter(e => e.id !== id)); api(`/api/family/expenses/${id}`, "DELETE"); };

  async function takeSnapshot() {
    setSnapshotting(true);
    try {
      const d = await api("/api/family/snapshots", "POST", { totalAssets, totalLiabilities, netWorth, monthlyIncome, monthlyOutgoings: monthlyOut, monthlySurplus }).then(r => r.json());
      if (d.snapshot) setSnapshots(p => [...p, d.snapshot]);
    } finally { setSnapshotting(false); }
  }

  async function seedExpenses() {
    setSeeding(true);
    try {
      const d = await fetch("/api/family/seed", { method: "POST" }).then(r => r.json());
      if (d.expenses?.length) setExpenses(d.expenses);
    } finally { setSeeding(false); }
  }

  async function handleFiles(files: FileList | File[]) {
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const result = await upload(`family/${Date.now()}-${f.name}`, f, { access: "public", handleUploadUrl: "/api/family/upload", contentType: f.type || "application/octet-stream" });
        const d = await api("/api/family/documents", "POST", { name: f.name, fileUrl: result.url, contentType: f.type, kind: uploadKind }).then(r => r.json());
        if (d.document) setDocs(p => [d.document, ...p]);
      }
    } catch (e) { console.error(e); } finally { setUploading(false); }
  }
  async function extractDoc(docId: string) {
    setExtractingId(docId);
    try {
      const d = await api("/api/family/extract", "POST", { documentId: docId }).then(r => r.json());
      if (d.ok) {
        setSuggestions(p => ({ ...p, [docId]: { summary: d.extracted.summary, accounts: d.extracted.accounts ?? [], expenses: d.extracted.expenses ?? [] } }));
        setDocs(p => p.map(doc => doc.id === docId ? { ...doc, status: "extracted" } : doc));
      }
    } finally { setExtractingId(null); }
  }
  const rmDoc = async (id: string) => {
    if (!confirm("Remove?")) return;
    setDocs(p => p.filter(d => d.id !== id));
    setSuggestions(p => { const n = { ...p }; delete n[id]; return n; });
    api(`/api/family/documents/${id}`, "DELETE");
  };
  async function acceptDocAccount(docId: string, s: Record<string, unknown>) {
    const d = await api("/api/family/accounts", "POST", { name: String(s.name ?? "Account"), type: String(s.type ?? "savings"), owner: String(s.owner ?? "joint"), balance: Number(s.balance) || 0, documentId: docId }).then(r => r.json());
    if (d.account) { setAccounts(p => [...p, d.account]); setSuggestions(p => { const c = p[docId]; return c ? { ...p, [docId]: { ...c, accounts: c.accounts.filter(x => x !== s) } } : p; }); }
  }
  async function acceptDocExpense(docId: string, s: Record<string, unknown>) {
    const d = await api("/api/family/expenses", "POST", { name: String(s.name ?? "Expense"), amount: Number(s.amount) || 0, frequency: String(s.frequency ?? "monthly"), category: String(s.category ?? "joint") }).then(r => r.json());
    if (d.expense) { setExpenses(p => [...p, d.expense]); setSuggestions(p => { const c = p[docId]; return c ? { ...p, [docId]: { ...c, expenses: c.expenses.filter(x => x !== s) } } : p; }); }
  }
  async function addChecklistItem() {
    const name = checklistInput.trim(); if (!name) return;
    setChecklistInput("");
    const d = await api("/api/family/checklist", "POST", { name }).then(r => r.json());
    if (d.item) setChecklist(p => [...p, d.item]);
  }
  const toggleChecklist = (id: string, done: boolean) => { setChecklist(p => p.map(c => c.id === id ? { ...c, done } : c)); api(`/api/family/checklist/${id}`, "PATCH", { done }); };
  const rmChecklist = (id: string) => { setChecklist(p => p.filter(c => c.id !== id)); api(`/api/family/checklist/${id}`, "DELETE"); };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen px-4 sm:px-8 py-6 max-w-3xl mx-auto">
      <header className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Family finances</h1>
          <p className="text-xs text-muted/45 mt-0.5">Richard &amp; Catrin — full household picture</p>
        </div>
        <button onClick={takeSnapshot} disabled={snapshotting || accounts.length === 0}
          className="text-[10px] font-bold uppercase tracking-widest text-muted/40 hover:text-primary border border-white/8 hover:border-primary/25 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-25 shrink-0">
          {snapshotting ? "Saving…" : "📸 Snapshot"}
        </button>
      </header>

      {setupNeeded && (
        <div className="mb-4 bg-warning/10 border border-warning/30 rounded-2xl p-4 text-sm">
          <p className="font-bold text-warning uppercase tracking-widest text-[11px] mb-1">Setup needed</p>
          Run <code className="text-xs bg-black/40 px-1 rounded">family-schema.sql</code> then <code className="text-xs bg-black/40 px-1 rounded">family-schema-v2.sql</code> in Supabase SQL editor, then refresh.
        </div>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-4 flex flex-col gap-1.5">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 border text-xs ${a.level === "danger" ? "bg-danger/8 border-danger/25 text-danger" : a.level === "warning" ? "bg-warning/8 border-warning/25 text-warning" : "bg-white/[0.025] border-white/8 text-muted/55"}`}>
              <span>{a.level === "danger" ? "⚠️" : a.level === "warning" ? "⚡" : "ℹ️"}</span>
              {a.msg}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-4">{[1,2,3].map(i => <div key={i} className="h-24 rounded-2xl bg-surface/40 border border-white/5 animate-pulse" />)}</div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── OVERVIEW ── */}
          <div className="bg-surface border border-white/8 rounded-2xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted/35 mb-0.5">Net worth</p>
                <p className={`text-2xl font-black tracking-tight leading-none ${netWorth >= 0 ? "text-primary" : "text-secondary"}`}>{gbp(netWorth)}</p>
                {totalLiabilities > 0 && <p className="text-[10px] text-muted/30 mt-0.5">{gbp(totalAssets)} − {gbp(totalLiabilities)}</p>}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted/35 mb-0.5">Monthly surplus</p>
                <p className={`text-2xl font-black tracking-tight leading-none ${monthlySurplus > 0 ? "text-foreground" : monthlySurplus < 0 ? "text-secondary" : "text-muted/30"}`}>
                  {monthlyIncome > 0 ? gbp(monthlySurplus) : "—"}
                </p>
                {monthlyIncome > 0 && <p className="text-[10px] text-muted/30 mt-0.5">{gbp(monthlyIncome)} in · {gbp(monthlyOut)} out</p>}
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted/35 mb-0.5">Savings rate</p>
                <p className={`text-2xl font-black tracking-tight leading-none ${savingsRate >= 20 ? "text-success" : savingsRate > 0 ? "text-foreground" : "text-muted/25"}`}>
                  {monthlyIncome > 0 ? `${savingsRate.toFixed(0)}%` : "—"}
                </p>
                <p className="text-[10px] text-muted/30 mt-0.5">of gross income</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-muted/35 mb-0.5">Emergency fund</p>
                <p className={`text-2xl font-black tracking-tight leading-none ${emergencyMonths >= 3 ? "text-success" : emergencyMonths > 0 ? "text-warning" : "text-muted/25"}`}>
                  {liquidSavings > 0 ? `${emergencyMonths.toFixed(1)}mo` : "—"}
                </p>
                {liquidSavings > 0 && <p className="text-[10px] text-muted/30 mt-0.5">{gbp(liquidSavings)} liquid</p>}
              </div>
            </div>
            {categoryTotals.length > 0 && (
              <div className="flex flex-col gap-1.5 pt-3 border-t border-white/6">
                {categoryTotals.map(([cat, monthly]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="text-[10px] w-28 text-muted/35 shrink-0 truncate">{catLabel(cat)}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/[0.05] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${monthlyOut > 0 ? (monthly / monthlyOut) * 100 : 0}%`, background: catColour(cat) }} />
                    </div>
                    <span className="text-[10px] text-muted/35 w-16 text-right shrink-0">{gbp(monthly)}/mo</span>
                  </div>
                ))}
              </div>
            )}
            {expenses.length === 0 && (
              <button onClick={seedExpenses} disabled={seeding} className="mt-4 w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors">
                {seeding ? "Importing…" : "Import outgoings from sheet →"}
              </button>
            )}
          </div>

          {/* ── NET WORTH CHART ── */}
          {mounted && (snapshots.length > 1 || accounts.length > 0) && (
            <div className="bg-surface border border-white/8 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted/40">Wealth trajectory</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted/30">{projYears}y</span>
                  <input type="range" min={5} max={40} value={projYears} onChange={e => setProjYears(+e.target.value)} className="w-20 accent-[#E6FF00]" />
                </div>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={nwChartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gNW" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#E6FF00" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="#E6FF00" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.05)" />
                    <YAxis tickFormatter={gbpShort} tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.05)" width={44} />
                    <Tooltip formatter={(v: unknown) => gbp(Number(v))} contentStyle={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#666" }} />
                    {snapshots.length > 1 && <Area type="monotone" dataKey="netWorth" name="Actual" stroke="#E6FF00" strokeWidth={2} fill="url(#gNW)" dot={{ fill: "#E6FF00", r: 3 }} connectNulls={false} />}
                    <Area type="monotone" dataKey="proj" name="Projected" stroke="#E6FF00" strokeWidth={1.5} strokeDasharray="5 4" fill="none" dot={false} connectNulls={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {snapshots.length < 2 && <p className="text-[10px] text-muted/25 mt-1">Hit Snapshot monthly to build the actual history line.</p>}
            </div>
          )}

          {/* ── INCOME ── */}
          <div style={{ order: secOrder.indexOf("income") + 2 }} draggable onDragStart={() => setDragKey("income")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "income") moveSection(dragKey, "income"); setDragKey(null); }} className={dragKey === "income" ? "opacity-40" : ""}>
          <Section title="Income" subtitle={monthlyIncome > 0 ? `${gbp(monthlyIncome)}/mo · ${gbp(monthlyIncome * 12)}/yr` : "Add income sources"} open={sec.income} onToggle={() => tog("income")} showDragHandle>
            <div className="pt-4 flex flex-col gap-2">
              {income.map(i => (
                <div key={i.id} className="bg-background/50 border border-white/6 rounded-xl p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input defaultValue={i.name} onBlur={e => e.target.value !== i.name && patchIncome(i.id, { name: e.target.value })} style={{ fontSize: "16px" }} className="flex-1 bg-transparent outline-none text-sm font-bold" />
                    <span className="text-xs text-muted/40 shrink-0">{gbp(toMonthly(i.amount, i.frequency))}/mo</span>
                    <button onClick={() => rmIncome(i.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Amount £</span><input type="number" defaultValue={i.amount} onBlur={e => patchIncome(i.id, { amount: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                    <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Frequency</span><select value={i.frequency} onChange={e => patchIncome(i.id, { frequency: e.target.value })} style={{ fontSize: "16px" }} className={inp}>{FREQS.map(f => <option key={f} value={f}>{f}</option>)}</select></label>
                    <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Type</span><select value={i.type} onChange={e => patchIncome(i.id, { type: e.target.value })} style={{ fontSize: "16px" }} className={inp}>{INCOME_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
                    <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Owner</span><select value={i.owner} onChange={e => patchIncome(i.id, { owner: e.target.value })} style={{ fontSize: "16px" }} className={inp}>{OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
                  </div>
                </div>
              ))}
              {income.length === 0 && <p className="text-[11px] text-muted/25 italic py-2">No income sources yet. Add salary, dividends, rental etc. — needed to calculate your monthly surplus and savings rate.</p>}
              <div className="flex gap-2 pt-1">
                {OWNERS.map(o => <button key={o.key} onClick={() => addIncome(o.key)} className="text-[10px] font-bold uppercase tracking-widest text-primary/50 hover:text-primary border border-primary/20 rounded-lg px-3 py-1.5 transition-colors">+ {o.label}</button>)}
              </div>
            </div>
          </Section>

          </div>

          {/* ── OUTGOINGS ── */}
          <div style={{ order: secOrder.indexOf("out") + 2 }} draggable onDragStart={() => setDragKey("out")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "out") moveSection(dragKey, "out"); setDragKey(null); }} className={dragKey === "out" ? "opacity-40" : ""}>
          <Section title="Outgoings" subtitle={monthlyOut > 0 ? `${gbp(monthlyOut)}/mo · ${gbp(monthlyOut * 12)}/yr` : ""} open={sec.out} onToggle={() => tog("out")} badge={cutIds.size > 0 ? `Cut saves ${gbp(savedMonthly * 12)}/yr` : undefined} showDragHandle>
            <div className="pt-4">
              {expenses.length === 0 && <button onClick={seedExpenses} disabled={seeding} className="mb-4 w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 disabled:opacity-50 transition-colors">{seeding ? "Importing…" : "Import from outgoings sheet →"}</button>}
              {mounted && expenseChartData.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted/30 mb-2">Biggest costs — click to mark as &ldquo;cut&rdquo;</p>
                  <ResponsiveContainer width="100%" height={expenseChartData.length * 26 + 8}>
                    <BarChart data={expenseChartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }} barSize={10}>
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: unknown) => [`${gbp(Number(v))}/mo · ${gbp(Number(v) * 12)}/yr`, ""]} contentStyle={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }} itemStyle={{ color: "#aaa" }} labelStyle={{ display: "none" }} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
                      <Bar dataKey="monthly" radius={[0, 4, 4, 0]} onClick={(d: { id?: string }) => d.id && toggleCut(d.id)} style={{ cursor: "pointer" }}>
                        {expenseChartData.map(e => <Cell key={e.id} fill={e.cut ? "rgba(255,255,255,0.06)" : catColour(e.category)} fillOpacity={e.cut ? 0.5 : 0.75} />)}
                        <LabelList dataKey="monthly" position="right" formatter={(v: unknown) => gbp(Number(v))} style={{ fill: "#666", fontSize: 10 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {cutIds.size > 0 && (
                <div className="mb-4 rounded-xl border border-success/20 bg-success/5 px-4 py-3 flex items-baseline gap-3">
                  <span className="text-xl font-black text-success">{gbp(savedMonthly * 12)}</span>
                  <span className="text-xs text-muted/45">saved/year cutting {cutIds.size} item{cutIds.size > 1 ? "s" : ""} · {gbp(savedMonthly)}/mo</span>
                  <button onClick={() => setCutIds(new Set())} className="ml-auto text-[10px] text-muted/30 hover:text-muted/60">Clear</button>
                </div>
              )}
              <div className="flex flex-col gap-4">
                {expenseCategories.map(cat => {
                  const list = expenses.filter(e => e.category === cat);
                  const catMo = list.filter(e => e.active).reduce((s, e) => s + toMonthly(e.amount, e.frequency), 0);
                  if (list.length === 0 && !Object.keys(CATEGORY_LABELS).includes(cat)) return null;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: catColour(cat) }}>
                          {catLabel(cat)}{catMo > 0 && <span className="text-muted/30 font-normal normal-case tracking-normal ml-2">{gbp(catMo)}/mo</span>}
                        </span>
                        <button onClick={() => addExpense(cat)} className="text-[10px] font-bold uppercase tracking-widest text-primary/45 hover:text-primary transition-colors">+ Add</button>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {list.filter(e => e.amount > 0 || true).map(e => {
                          const cut = cutIds.has(e.id);
                          return (
                            <div key={e.id} className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${cut ? "opacity-35 bg-transparent" : "bg-background/40 border border-white/6"}`}>
                              <button onClick={() => toggleCut(e.id)} className={`w-3.5 h-3.5 rounded border flex-shrink-0 transition-colors ${cut ? "border-success/50 bg-success/20" : "border-white/15 hover:border-white/30"}`} />
                              <input defaultValue={e.name} onBlur={ev => ev.target.value !== e.name && patchExpense(e.id, { name: ev.target.value })} style={{ fontSize: "16px" }} className="flex-1 bg-transparent outline-none text-xs text-foreground/70" />
                              {e.amount === 0 && <span className="text-[9px] text-warning/50 shrink-0">fill in</span>}
                              <input type="number" defaultValue={e.amount} onBlur={ev => patchExpense(e.id, { amount: parseFloat(ev.target.value) || 0 })} style={{ fontSize: "16px" }} className="w-20 bg-background border border-white/10 rounded-lg px-2 py-1 text-xs text-right outline-none focus:border-primary/40" />
                              <select value={e.frequency} onChange={ev => patchExpense(e.id, { frequency: ev.target.value })} style={{ fontSize: "16px" }} className="bg-background border border-white/10 rounded-lg px-2 py-1 text-[11px] outline-none">{FREQS.map(f => <option key={f} value={f}>{f}</option>)}</select>
                              <button onClick={() => rmExpense(e.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                            </div>
                          );
                        })}
                        {list.length === 0 && <p className="text-[11px] text-muted/20 italic">None</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          </div>

          {/* ── SAVINGS & INVESTMENTS ── */}
          <div style={{ order: secOrder.indexOf("accounts") + 2 }} draggable onDragStart={() => setDragKey("accounts")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "accounts") moveSection(dragKey, "accounts"); setDragKey(null); }} className={dragKey === "accounts" ? "opacity-40" : ""}>
          <Section title="Savings &amp; investments" subtitle={totalAssets > 0 ? gbp(totalAssets) : "Add accounts"} open={sec.accounts} onToggle={() => tog("accounts")} showDragHandle>
            <div className="pt-4">
              {/* ISA tracker */}
              {accounts.some(a => a.taxWrapper === "isa" || a.taxWrapper === "lisa") && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {(["rich", "cat"] as AccountOwner[]).map(owner => {
                    const used = ISA_ALLOWANCE - (owner === "rich" ? ISA_ALLOWANCE - (isaByOwner["rich"] ?? 0) : ISA_ALLOWANCE - (isaByOwner["cat"] ?? 0));
                    const remaining = ISA_ALLOWANCE - used;
                    return (
                      <div key={owner} className="bg-background/50 border border-white/8 rounded-xl p-3">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-muted/35 mb-1">{owner === "rich" ? "Rich" : "Cat"} ISA 2026/27</p>
                        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (used / ISA_ALLOWANCE) * 100)}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted/35">
                          <span>{gbp(used)} used</span>
                          <span className="text-primary font-bold">{gbp(remaining)} left</span>
                        </div>
                        <p className="text-[9px] text-muted/20 mt-0.5">Resets {TAX_YEAR_END}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Projection */}
              {mounted && accounts.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted/30">Investment projection</p>
                    <p className="text-[10px] text-muted/35">+{projYears}y → <span className="text-primary font-bold">{gbp(projData[projData.length - 1]?.baseline ?? 0)}</span></p>
                  </div>
                  <div className="h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={projData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                        <defs><linearGradient id="gInv" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E6FF00" stopOpacity={0.2} /><stop offset="100%" stopColor="#E6FF00" stopOpacity={0} /></linearGradient></defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.04)" />
                        <YAxis tickFormatter={gbpShort} tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.04)" width={44} />
                        <Tooltip formatter={(v: unknown) => gbp(Number(v))} contentStyle={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#666" }} />
                        <Area type="monotone" dataKey="baseline" name="Projected" stroke="#E6FF00" strokeWidth={2} fill="url(#gInv)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <input type="range" min={1} max={40} value={projYears} onChange={e => setProjYears(+e.target.value)} className="w-full accent-[#E6FF00] mt-1" />
                </div>
              )}
              {/* Account list */}
              <div className="flex flex-col gap-5">
                {ACCOUNT_TYPES.map(({ key, label: tLabel }) => {
                  const list = accounts.filter(a => a.type === key);
                  const total = list.reduce((s, a) => s + a.balance, 0);
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/35">{tLabel}{total > 0 && <span className="text-muted/25 font-normal normal-case tracking-normal ml-2">{gbp(total)}</span>}</span>
                        <button onClick={() => addAccount(key)} className="text-[10px] font-bold uppercase tracking-widest text-primary/45 hover:text-primary transition-colors">+ Add</button>
                      </div>
                      <div className="flex flex-col gap-2">
                        {list.map(a => {
                          const isStale = a.asOfDate ? Math.floor((Date.now() - new Date(a.asOfDate).getTime()) / 86_400_000) > 60 : false;
                          return (
                            <div key={a.id} className={`bg-background/40 border rounded-xl p-3 flex flex-col gap-2 ${isStale ? "border-warning/20" : "border-white/6"}`}>
                              <div className="flex items-center gap-2">
                                <input defaultValue={a.name} onBlur={e => e.target.value !== a.name && patchAccount(a.id, { name: e.target.value })} style={{ fontSize: "16px" }} className="flex-1 bg-transparent outline-none text-sm font-bold" />
                                {isStale && <span className="text-[9px] text-warning uppercase tracking-widest">stale</span>}
                                <button onClick={() => rmAccount(a.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Balance £</span><input type="number" defaultValue={a.balance} onBlur={e => patchAccount(a.id, { balance: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                                <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Monthly £</span><input type="number" defaultValue={a.monthlyContribution} onBlur={e => patchAccount(a.id, { monthlyContribution: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                                <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Wrapper</span><select value={a.taxWrapper} onChange={e => patchAccount(a.id, { taxWrapper: e.target.value })} style={{ fontSize: "16px" }} className={inp}>{TAX_WRAPPERS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}</select></label>
                                <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Owner</span><select value={a.owner} onChange={e => patchAccount(a.id, { owner: e.target.value })} style={{ fontSize: "16px" }} className={inp}>{OWNERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>
                              </div>
                              <div className="flex gap-2">
                                {(a.taxWrapper === "isa" || a.taxWrapper === "lisa") && (
                                  <label className="flex flex-col gap-0.5 flex-1"><span className="text-[9px] uppercase tracking-widest text-muted/30">Paid in this year £</span><input type="number" defaultValue={a.taxYearContribution} onBlur={e => patchAccount(a.id, { taxYearContribution: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                                )}
                                {a.type === "pension" && (
                                  <label className="flex flex-col gap-0.5 flex-1"><span className="text-[9px] uppercase tracking-widest text-muted/30">Access age</span><input type="number" defaultValue={a.accessibleFromAge ?? ""} placeholder="57" onBlur={e => patchAccount(a.id, { accessibleFromAge: e.target.value ? +e.target.value : null })} style={{ fontSize: "16px" }} className={inp} /></label>
                                )}
                                <label className="flex flex-col gap-0.5 flex-1"><span className="text-[9px] uppercase tracking-widest text-muted/30">As of date</span><input type="date" defaultValue={a.asOfDate ?? ""} onBlur={e => patchAccount(a.id, { asOfDate: e.target.value || null })} style={{ fontSize: "16px" }} className={`${inp} ${isStale ? "border-warning/30" : ""}`} /></label>
                              </div>
                              <input defaultValue={a.institution ?? ""} placeholder="Institution (optional)" onBlur={e => patchAccount(a.id, { institution: e.target.value || null })} style={{ fontSize: "16px" }} className="bg-transparent outline-none text-xs text-muted/30 placeholder:text-muted/15" />
                            </div>
                          );
                        })}
                        {list.length === 0 && <p className="text-[11px] text-muted/20 italic">None</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          </div>

          {/* ── LIABILITIES ── */}
          <div style={{ order: secOrder.indexOf("liabilities") + 2 }} draggable onDragStart={() => setDragKey("liabilities")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "liabilities") moveSection(dragKey, "liabilities"); setDragKey(null); }} className={dragKey === "liabilities" ? "opacity-40" : ""}>
          <Section title="Liabilities" subtitle={totalLiabilities > 0 ? `${gbp(totalLiabilities)} outstanding` : "Mortgage, loans"} open={sec.liabilities} onToggle={() => tog("liabilities")} warn={alerts.some(a => a.msg.includes("rate expires"))} showDragHandle>
            <div className="pt-4 flex flex-col gap-4">
              {liabilities.map(l => {
                const stats = l.interestRate ? mortgageStats(l.balance, l.monthlyPayment, l.interestRate) : null;
                const daysToExpiry = l.rateExpiryDate ? Math.floor((new Date(l.rateExpiryDate).getTime() - Date.now()) / 86_400_000) : null;
                return (
                  <div key={l.id} className={`bg-background/50 border rounded-2xl p-4 flex flex-col gap-3 ${daysToExpiry !== null && daysToExpiry < 180 ? "border-warning/25" : "border-white/6"}`}>
                    <div className="flex items-center gap-2">
                      <input defaultValue={l.name} onBlur={e => e.target.value !== l.name && patchLiability(l.id, { name: e.target.value })} style={{ fontSize: "16px" }} className="flex-1 bg-transparent outline-none text-sm font-bold" />
                      <button onClick={() => rmLiability(l.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Balance £</span><input type="number" defaultValue={l.balance} onBlur={e => patchLiability(l.id, { balance: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Monthly £</span><input type="number" defaultValue={l.monthlyPayment} onBlur={e => patchLiability(l.id, { monthlyPayment: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Rate %</span><input type="number" step="0.01" defaultValue={l.interestRate ?? ""} placeholder="e.g. 4.5" onBlur={e => patchLiability(l.id, { interestRate: e.target.value ? parseFloat(e.target.value) : null })} style={{ fontSize: "16px" }} className={inp} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Type</span><select value={l.rateType ?? "fixed"} onChange={e => patchLiability(l.id, { rateType: e.target.value })} style={{ fontSize: "16px" }} className={inp}><option value="fixed">Fixed</option><option value="tracker">Tracker</option><option value="variable">Variable</option></select></label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Rate expiry date</span><input type="date" defaultValue={l.rateExpiryDate ?? ""} onBlur={e => patchLiability(l.id, { rateExpiryDate: e.target.value || null })} style={{ fontSize: "16px" }} className={`${inp} ${daysToExpiry !== null && daysToExpiry < 180 ? "border-warning/40" : ""}`} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Months remaining</span><input type="number" defaultValue={l.termRemainingMonths ?? ""} placeholder="e.g. 264" onBlur={e => patchLiability(l.id, { termRemainingMonths: e.target.value ? +e.target.value : null })} style={{ fontSize: "16px" }} className={inp} /></label>
                    </div>
                    {daysToExpiry !== null && daysToExpiry < 180 && (
                      <div className={`rounded-xl px-3 py-2 text-xs border ${daysToExpiry < 0 ? "bg-danger/8 border-danger/25 text-danger" : "bg-warning/8 border-warning/25 text-warning"}`}>
                        {daysToExpiry < 0 ? `Rate expired ${Math.abs(daysToExpiry)} days ago — remortgage urgently` : `Rate expires in ${daysToExpiry} days — start shopping now`}
                      </div>
                    )}
                    {stats && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5">
                        <div><p className="text-[9px] uppercase tracking-widest text-muted/30">Monthly interest</p><p className="text-sm font-black text-secondary">{gbp(stats.monthlyInterest)}</p></div>
                        <div><p className="text-[9px] uppercase tracking-widest text-muted/30">Monthly capital</p><p className="text-sm font-black text-success">{gbp(stats.monthlyCapital)}</p></div>
                        <div><p className="text-[9px] uppercase tracking-widest text-muted/30">Total interest left</p><p className="text-sm font-black text-secondary">{gbp(stats.totalInterest)}</p></div>
                      </div>
                    )}
                    {l.type === "mortgage" && stats && (
                      <div className="pt-2 border-t border-white/5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted/30 mb-2">Overpayment calculator</p>
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-[10px] text-muted/35 shrink-0">Extra /mo:</span>
                          <input type="range" min={0} max={2000} step={50} value={overpayExtra} onChange={e => setOverpayExtra(+e.target.value)} className="flex-1 accent-[#E6FF00]" />
                          <span className="text-sm font-bold text-primary w-14 text-right">{gbp(overpayExtra)}</span>
                        </div>
                        {overpayResult && (
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-success/5 border border-success/15 rounded-xl px-3 py-2.5">
                              <p className="text-[9px] uppercase tracking-widest text-success/55">Months saved</p>
                              <p className="text-xl font-black text-success">{overpayResult.monthsSaved}</p>
                              <p className="text-[10px] text-muted/30">{(overpayResult.monthsSaved / 12).toFixed(1)} years</p>
                            </div>
                            <div className="bg-success/5 border border-success/15 rounded-xl px-3 py-2.5">
                              <p className="text-[9px] uppercase tracking-widest text-success/55">Interest saved</p>
                              <p className="text-xl font-black text-success">{gbp(overpayResult.interestSaved)}</p>
                              <p className="text-[10px] text-muted/30">total over term</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {liabilities.length === 0 && <p className="text-[11px] text-muted/25 italic pb-2">Add your mortgage to see your true net worth, rate expiry alerts, and overpayment analysis.</p>}
              <div className="flex flex-wrap gap-2">
                {LIABILITY_TYPES.map(t => <button key={t.key} onClick={() => addLiability(t.key)} className="text-[10px] font-bold uppercase tracking-widest text-primary/45 hover:text-primary border border-primary/20 rounded-lg px-3 py-1.5 transition-colors">+ {t.label}</button>)}
              </div>
            </div>
          </Section>

          </div>

          {/* ── GOALS ── */}
          <div style={{ order: secOrder.indexOf("goals") + 2 }} draggable onDragStart={() => setDragKey("goals")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "goals") moveSection(dragKey, "goals"); setDragKey(null); }} className={dragKey === "goals" ? "opacity-40" : ""}>
          <Section title="Goals" subtitle={goals.length > 0 ? `${goals.length} goal${goals.length !== 1 ? "s" : ""}` : "Set targets"} open={sec.goals} onToggle={() => tog("goals")} showDragHandle>
            <div className="pt-4 flex flex-col gap-3">
              {goals.map(g => {
                const pct = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
                const remaining = Math.max(0, g.targetAmount - g.currentAmount);
                const monthsLeft = g.targetDate ? Math.max(0, Math.floor((new Date(g.targetDate).getTime() - Date.now()) / (86_400_000 * 30))) : null;
                const monthlyNeeded = monthsLeft && monthsLeft > 0 ? remaining / monthsLeft : null;
                const onTrack = monthlySurplus > 0 && monthlyNeeded !== null && monthlyNeeded <= monthlySurplus;
                return (
                  <div key={g.id} className="bg-background/50 border border-white/6 rounded-xl p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input defaultValue={g.name} onBlur={e => e.target.value !== g.name && patchGoal(g.id, { name: e.target.value })} style={{ fontSize: "16px" }} className="flex-1 bg-transparent outline-none text-sm font-bold" />
                      <span className={`text-xs font-bold ${pct >= 100 ? "text-success" : "text-primary"}`}>{pct.toFixed(0)}%</span>
                      <button onClick={() => rmGoal(g.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                    </div>
                    <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#34d399" : "#E6FF00" }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted/35"><span>{gbp(g.currentAmount)} saved</span><span>{gbp(remaining)} to go of {gbp(g.targetAmount)}</span></div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Saved £</span><input type="number" defaultValue={g.currentAmount} onBlur={e => patchGoal(g.id, { currentAmount: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">Target £</span><input type="number" defaultValue={g.targetAmount} onBlur={e => patchGoal(g.id, { targetAmount: parseFloat(e.target.value) || 0 })} style={{ fontSize: "16px" }} className={inp} /></label>
                      <label className="flex flex-col gap-0.5"><span className="text-[9px] uppercase tracking-widest text-muted/30">By date</span><input type="date" defaultValue={g.targetDate ?? ""} onBlur={e => patchGoal(g.id, { targetDate: e.target.value || null })} style={{ fontSize: "16px" }} className={inp} /></label>
                    </div>
                    {monthlyNeeded !== null && <p className="text-[10px] text-muted/40">Need <span className="text-primary font-bold">{gbp(monthlyNeeded)}/mo</span> — {monthsLeft} months to target date</p>}
                    {monthlyNeeded !== null && monthlySurplus > 0 && (
                      <p className={`text-[10px] ${onTrack ? "text-success" : "text-warning"}`}>
                        {onTrack ? `✓ On track — your ${gbp(monthlySurplus)}/mo surplus covers this` : `Need ${gbp(monthlyNeeded - monthlySurplus)}/mo more than current surplus`}
                      </p>
                    )}
                  </div>
                );
              })}
              {goals.length === 0 && <p className="text-[11px] text-muted/25 italic pb-2">Add savings goals — extension, new car, holiday, retirement target. Once you have income set, we can tell you if you&apos;re on track.</p>}
              <div className="flex flex-wrap gap-2">
                {GOAL_CATS.map(c => <button key={c.key} onClick={() => addGoal(c.key)} className="text-[10px] font-bold uppercase tracking-widest text-primary/45 hover:text-primary border border-primary/20 rounded-lg px-3 py-1.5 transition-colors">+ {c.label}</button>)}
              </div>
            </div>
          </Section>

          </div>

          {/* ── BIG SPEND PLANNER ── */}
          <div style={{ order: secOrder.indexOf("planner") + 2 }} draggable onDragStart={() => setDragKey("planner")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "planner") moveSection(dragKey, "planner"); setDragKey(null); }} className={dragKey === "planner" ? "opacity-40" : ""}>
          <Section title="Big spend planner" subtitle="Extension · car · lump sum" open={sec.planner} onToggle={() => tog("planner")} showDragHandle>
            <div className="pt-4">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted/35">Spend amount</span>
                  <input type="number" value={bigSpend} onChange={e => setBigSpend(+e.target.value || 0)} style={{ fontSize: "16px" }} className="w-28 bg-background border border-white/10 rounded-lg px-3 py-1.5 text-sm font-bold text-right outline-none focus:border-primary/40" />
                </div>
                <input type="range" min={10000} max={500000} step={5000} value={bigSpend} onChange={e => setBigSpend(+e.target.value)} className="w-full accent-[#E6FF00]" />
                <div className="flex justify-between text-[10px] text-muted/20 mt-0.5"><span>£10k</span><span>£500k</span></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-background/50 border border-white/8 rounded-xl px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted/30">Opp. cost</p>
                  <p className="text-lg font-black text-secondary">{gbp(oppCost)}</p>
                  <p className="text-[10px] text-muted/30">lost growth in {projYears}y</p>
                </div>
                <div className="bg-background/50 border border-white/8 rounded-xl px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted/30">Keep invested</p>
                  <p className="text-lg font-black text-primary">{gbp(projData[projData.length - 1]?.baseline ?? 0)}</p>
                  <p className="text-[10px] text-muted/30">in {projYears}y</p>
                </div>
                <div className="bg-background/50 border border-white/8 rounded-xl px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted/30">After spend</p>
                  <p className="text-lg font-black text-foreground/65">{gbp(projData[projData.length - 1]?.withSpend ?? 0)}</p>
                  <p className="text-[10px] text-muted/30">in {projYears}y</p>
                </div>
              </div>
              {cutIds.size > 0 && monthsToSave && (
                <div className="mb-4 bg-success/5 border border-success/15 rounded-xl px-4 py-3 text-xs text-foreground/65">
                  Cut selected expenses ({gbp(savedMonthly)}/mo) → fund {gbp(bigSpend)} in <span className="font-bold text-success">{monthsToSave} months</span> without touching investments.
                </div>
              )}
              {/* Borrow vs invest comparison */}
              {mortgage?.interestRate && (
                <div className="mb-4 bg-background/50 border border-white/8 rounded-xl p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted/30 mb-2">If you borrowed {gbp(bigSpend)} instead (remortgage)</p>
                  {(() => {
                    const r = (mortgage.interestRate ?? 5) / 100 / 12;
                    const n = 25 * 12;
                    const extra = r > 0 ? (bigSpend * r) / (1 - Math.pow(1 + r, -n)) : bigSpend / n;
                    const totalCost = extra * n - bigSpend;
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div><p className="text-[9px] uppercase tracking-widest text-muted/30">Extra monthly</p><p className="text-base font-black">{gbp(extra)}</p><p className="text-[10px] text-muted/25">over 25 years</p></div>
                        <div><p className="text-[9px] uppercase tracking-widest text-muted/30">Total interest</p><p className="text-base font-black text-secondary">{gbp(totalCost)}</p><p className="text-[10px] text-muted/25">vs {gbp(oppCost)} opp. cost if investing</p></div>
                      </div>
                    );
                  })()}
                </div>
              )}
              {accounts.length === 0 && (
                <p className="text-xs text-muted/35 italic mb-3">No investment accounts added yet — showing what this amount would grow to at an illustrative 5%/yr. Add accounts above to see the real impact on your portfolio.</p>
              )}
              {mounted && (
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={projData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                      <defs><linearGradient id="gSP" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E6FF00" stopOpacity={0.18} /><stop offset="100%" stopColor="#E6FF00" stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.04)" />
                      <YAxis tickFormatter={gbpShort} tick={{ fill: "#555", fontSize: 10 }} stroke="rgba(255,255,255,0.04)" width={44} />
                      <Tooltip formatter={(v: unknown) => gbp(Number(v))} contentStyle={{ background: "#161616", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "#666" }} />
                      <Area type="monotone" dataKey="baseline" name="Keep invested" stroke="#E6FF00" strokeWidth={2} fill="url(#gSP)" />
                      <Area type="monotone" dataKey="withSpend" name={`After ${gbp(bigSpend)}`} stroke="#ff2d78" strokeWidth={2} fill="none" strokeDasharray="5 4" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </Section>

          </div>

          {/* ── DOCUMENTS ── */}
          <div style={{ order: secOrder.indexOf("docs") + 2 }} draggable onDragStart={() => setDragKey("docs")} onDragEnd={() => setDragKey(null)} onDragOver={e => e.preventDefault()} onDrop={() => { if (dragKey && dragKey !== "docs") moveSection(dragKey, "docs"); setDragKey(null); }} className={dragKey === "docs" ? "opacity-40" : ""}>
          <Section title="Documents &amp; checklist" subtitle={`${docs.length} uploaded · ${checklist.filter(c => !c.done).length} to find`} open={sec.docs} onToggle={() => tog("docs")} showDragHandle>
            <div className="pt-4">
              <div className="flex flex-col gap-0.5 mb-4">
                {docs.map(d => (
                  <div key={`doc-${d.id}`} className="flex items-center gap-2.5 py-1.5 group">
                    <span className="w-4 h-4 rounded flex items-center justify-center bg-primary/15 border border-primary/30 flex-shrink-0 text-[10px] text-primary">✓</span>
                    <a href={d.fileUrl} target="_blank" rel="noreferrer" className="flex-1 text-sm text-foreground/55 hover:text-primary truncate">{d.name}</a>
                    <span className="text-[9px] uppercase tracking-widest text-muted/20 shrink-0">{d.kind}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => extractDoc(d.id)} disabled={extractingId === d.id} className="text-[9px] font-bold uppercase tracking-widest text-primary/55 hover:text-primary border border-primary/20 rounded-full px-2 py-0.5 disabled:opacity-40">{extractingId === d.id ? "…" : d.status === "extracted" ? "Re-read" : "Read"}</button>
                      <button onClick={() => rmDoc(d.id)} className="text-muted/20 hover:text-danger text-xs">✕</button>
                    </div>
                  </div>
                ))}
                {checklist.map(c => (
                  <div key={`cl-${c.id}`} className="flex items-center gap-2.5 py-1.5 group">
                    <button onClick={() => toggleChecklist(c.id, !c.done)} className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 text-[10px] font-bold border transition-colors ${c.done ? "bg-primary/15 border-primary/30 text-primary" : "bg-transparent border-white/12 text-transparent hover:border-white/25"}`}>✓</button>
                    <span className={`flex-1 text-sm ${c.done ? "text-muted/22 line-through" : "text-foreground/55"}`}>{c.name}</span>
                    <button onClick={() => rmChecklist(c.id)} className="text-muted/15 hover:text-danger text-xs opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                  </div>
                ))}
                {docs.length === 0 && checklist.length === 0 && <p className="text-[11px] text-muted/20 italic pb-2">No documents yet</p>}
              </div>
              <div className="flex gap-2 mb-3">
                <input value={checklistInput} onChange={e => setChecklistInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addChecklistItem()} placeholder="Add a document to find…" style={{ fontSize: "16px" }} className={`${inp} flex-1`} />
                <button onClick={addChecklistItem} className="text-[10px] font-bold uppercase tracking-widest text-primary/65 hover:text-primary border border-primary/20 rounded-lg px-4 py-2 transition-colors">Add</button>
              </div>
              <div className="flex gap-2">
                <select value={uploadKind} onChange={e => setUploadKind(e.target.value)} style={{ fontSize: "16px" }} className="bg-background border border-white/10 rounded-lg px-3 py-2 text-xs text-muted outline-none">
                  <option value="bank_statement">Bank statement</option><option value="investment">Investment</option><option value="pension">Pension</option><option value="other">Other</option>
                </select>
                <label className="flex-1 border border-dashed border-white/10 hover:border-primary/25 rounded-xl px-4 py-2.5 text-center cursor-pointer transition-colors" onDrop={ev => { ev.preventDefault(); if (ev.dataTransfer.files.length) handleFiles(ev.dataTransfer.files); }} onDragOver={ev => ev.preventDefault()}>
                  <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={ev => { if (ev.target.files?.length) handleFiles(ev.target.files); (ev.target as HTMLInputElement).value = ""; }} />
                  <span className="text-xs text-muted/30">{uploading ? "Uploading…" : "Drop or tap to upload"}</span>
                </label>
              </div>
              {docs.some(d => suggestions[d.id]) && (
                <div className="flex flex-col gap-3 mt-4">
                  {docs.map(d => {
                    const sug = suggestions[d.id]; if (!sug) return null;
                    return (
                      <div key={d.id} className="border border-white/8 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted/30 mb-1">{d.name}</p>
                        {sug.summary && <p className="text-xs text-muted/40 italic mb-2">{sug.summary}</p>}
                        {sug.accounts.map((s, i) => <div key={`a${i}`} className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/12 rounded-lg px-3 py-2 mb-1.5"><span className="flex-1"><span className="font-bold">{String(s.name)}</span><span className="text-muted/40"> · {String(s.type)} · {gbp(Number(s.balance) || 0)}</span></span><button onClick={() => acceptDocAccount(d.id, s)} className="text-[10px] font-bold text-primary hover:underline">+ Account</button></div>)}
                        {sug.expenses.map((s, i) => <div key={`e${i}`} className="flex items-center gap-2 text-xs bg-white/[0.02] border border-white/8 rounded-lg px-3 py-2 mb-1.5"><span className="flex-1"><span className="font-bold">{String(s.name)}</span><span className="text-muted/40"> · {gbp(Number(s.amount) || 0)}/{String(s.frequency ?? "monthly")}</span></span><button onClick={() => acceptDocExpense(d.id, s)} className="text-[10px] font-bold text-primary hover:underline">+ Expense</button></div>)}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>
          </div>

        </div>
      )}
    </main>
  );
}
