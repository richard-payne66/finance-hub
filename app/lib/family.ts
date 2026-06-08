import { db } from "@/app/lib/db";

// ============================================================================
// Family finances data layer
// Uses finance-hub db() function (service-role, bypasses RLS).
// ============================================================================

export type AccountType = "savings" | "investment" | "pension" | "cash" | "other";
export type AccountOwner = "joint" | "rich" | "cat";
export type TaxWrapper = "isa" | "lisa" | "pension" | "sipp" | "gia" | "cash" | "other";
export type ExpenseFrequency = "weekly" | "monthly" | "quarterly" | "annual";
export type IncomeType = "salary" | "dividend" | "rental" | "benefit" | "other";
export type LiabilityType = "mortgage" | "loan" | "credit_card" | "car_finance" | "other";
export type GoalCategory = "savings" | "house" | "car" | "holiday" | "retirement" | "education" | "other";

export interface FamilyAccount {
  id: string; name: string; type: AccountType; owner: AccountOwner;
  taxWrapper: TaxWrapper; taxYearContribution: number; accessibleFromAge: number | null;
  institution: string | null; balance: number; currency: string;
  monthlyContribution: number; growthRate: number | null;
  asOfDate: string | null; notes: string | null; documentId: string | null;
  createdAt: string; updatedAt: string;
}

export interface FamilyExpense {
  id: string; name: string; amount: number; frequency: ExpenseFrequency;
  category: string; notes: string | null; active: boolean; variable: boolean;
  createdAt: string; updatedAt: string;
}

export interface FamilyIncome {
  id: string; name: string; amount: number; frequency: ExpenseFrequency;
  owner: AccountOwner; type: IncomeType; notes: string | null;
  active: boolean; createdAt: string; updatedAt: string;
}

export interface FamilyLiability {
  id: string; name: string; type: LiabilityType;
  balance: number; monthlyPayment: number;
  interestRate: number | null; rateType: string | null; rateExpiryDate: string | null;
  originalAmount: number | null; termRemainingMonths: number | null;
  notes: string | null; createdAt: string; updatedAt: string;
}

export interface FamilyGoal {
  id: string; name: string; targetAmount: number; targetDate: string | null;
  currentAmount: number; category: GoalCategory;
  linkedAccount: string | null; notes: string | null;
  createdAt: string; updatedAt: string;
}

export interface FamilySnapshot {
  id: string; snapshotDate: string;
  totalAssets: number; totalLiabilities: number; netWorth: number;
  monthlyIncome: number; monthlyOutgoings: number; monthlySurplus: number;
  notes: string | null; createdAt: string;
}

export interface FamilyDocument {
  id: string; name: string; fileUrl: string; contentType: string | null;
  kind: string; status: string; extracted: unknown | null; createdAt: string;
}

export interface ChecklistItem {
  id: string; name: string; done: boolean; note: string | null; createdAt: string;
}

export function isTableMissing(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|could not find the table|schema cache|42P01|PGRST205/i.test(msg);
}

// ── Helpers ────────────────────────────────────────────────────────────────
const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

// ── Accounts ───────────────────────────────────────────────────────────────
const ACCOUNT_COLS =
  "id, name, type, owner, institution, balance, currency, monthly_contribution, growth_rate, as_of_date, notes, document_id, tax_wrapper, tax_year_contribution, accessible_from_age, created_at, updated_at";

type AccountRow = {
  id: string; name: string; type: string; owner: string; institution: string | null;
  balance: number | string | null; currency: string | null;
  monthly_contribution: number | string | null; growth_rate: number | string | null;
  as_of_date: string | null; notes: string | null; document_id: string | null;
  tax_wrapper: string | null; tax_year_contribution: number | string | null;
  accessible_from_age: number | null; created_at: string; updated_at: string;
};
function rowToAccount(r: AccountRow): FamilyAccount {
  return {
    id: r.id, name: r.name,
    type: (r.type as AccountType) ?? "savings",
    owner: (r.owner as AccountOwner) ?? "joint",
    taxWrapper: (r.tax_wrapper as TaxWrapper) ?? "other",
    taxYearContribution: num(r.tax_year_contribution),
    accessibleFromAge: r.accessible_from_age ?? null,
    institution: r.institution,
    balance: num(r.balance),
    currency: r.currency ?? "GBP",
    monthlyContribution: num(r.monthly_contribution),
    growthRate: r.growth_rate === null || r.growth_rate === undefined ? null : num(r.growth_rate),
    asOfDate: r.as_of_date, notes: r.notes, documentId: r.document_id,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function getAccounts(): Promise<FamilyAccount[]> {
  const { data, error } = await db().from("family_accounts").select(ACCOUNT_COLS)
    .order("type").order("created_at");
  if (error) throw new Error(`GET accounts: ${error.message}`);
  return (data as AccountRow[]).map(rowToAccount);
}

export interface AccountInput {
  name?: string; type?: AccountType; owner?: AccountOwner;
  taxWrapper?: TaxWrapper; taxYearContribution?: number; accessibleFromAge?: number | null;
  institution?: string | null; balance?: number; monthlyContribution?: number;
  growthRate?: number | null; asOfDate?: string | null; notes?: string | null; documentId?: string | null;
}

export async function createAccount(input: AccountInput): Promise<FamilyAccount> {
  const { data, error } = await db().from("family_accounts").insert({
    name: input.name ?? "New account", type: input.type ?? "savings",
    owner: input.owner ?? "joint", institution: input.institution ?? null,
    balance: input.balance ?? 0, monthly_contribution: input.monthlyContribution ?? 0,
    growth_rate: input.growthRate ?? null, as_of_date: input.asOfDate ?? null,
    notes: input.notes ?? null, document_id: input.documentId ?? null,
    tax_wrapper: input.taxWrapper ?? "other",
    tax_year_contribution: input.taxYearContribution ?? 0,
    accessible_from_age: input.accessibleFromAge ?? null,
  }).select(ACCOUNT_COLS).single();
  if (error) throw new Error(`POST account: ${error.message}`);
  return rowToAccount(data as AccountRow);
}

export async function updateAccount(id: string, input: Partial<AccountInput>): Promise<void> {
  const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) f.name = input.name;
  if (input.type !== undefined) f.type = input.type;
  if (input.owner !== undefined) f.owner = input.owner;
  if (input.institution !== undefined) f.institution = input.institution;
  if (input.balance !== undefined) f.balance = input.balance;
  if (input.monthlyContribution !== undefined) f.monthly_contribution = input.monthlyContribution;
  if (input.growthRate !== undefined) f.growth_rate = input.growthRate;
  if (input.asOfDate !== undefined) f.as_of_date = input.asOfDate;
  if (input.notes !== undefined) f.notes = input.notes;
  if (input.documentId !== undefined) f.document_id = input.documentId;
  if (input.taxWrapper !== undefined) f.tax_wrapper = input.taxWrapper;
  if (input.taxYearContribution !== undefined) f.tax_year_contribution = input.taxYearContribution;
  if (input.accessibleFromAge !== undefined) f.accessible_from_age = input.accessibleFromAge;
  const { error } = await db().from("family_accounts").update(f).eq("id", id);
  if (error) throw new Error(`PATCH account: ${error.message}`);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await db().from("family_accounts").delete().eq("id", id);
  if (error) throw new Error(`DELETE account: ${error.message}`);
}

// ── Expenses ───────────────────────────────────────────────────────────────
const EXPENSE_COLS = "id, name, amount, frequency, category, notes, active, variable, created_at, updated_at";

type ExpenseRow = {
  id: string; name: string; amount: number | string | null; frequency: string;
  category: string; notes: string | null; active: boolean | null;
  variable: boolean | null; created_at: string; updated_at: string;
};
function rowToExpense(r: ExpenseRow): FamilyExpense {
  return {
    id: r.id, name: r.name, amount: num(r.amount),
    frequency: (r.frequency as ExpenseFrequency) ?? "monthly",
    category: r.category ?? "joint", notes: r.notes,
    active: r.active ?? true, variable: r.variable ?? false,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function getExpenses(): Promise<FamilyExpense[]> {
  const { data, error } = await db().from("family_expenses").select(EXPENSE_COLS)
    .order("category").order("created_at");
  if (error) throw new Error(`GET expenses: ${error.message}`);
  return (data as ExpenseRow[]).map(rowToExpense);
}

export interface ExpenseInput {
  name?: string; amount?: number; frequency?: ExpenseFrequency;
  category?: string; notes?: string | null; active?: boolean; variable?: boolean;
}

export async function createExpense(input: ExpenseInput): Promise<FamilyExpense> {
  const { data, error } = await db().from("family_expenses").insert({
    name: input.name ?? "New expense", amount: input.amount ?? 0,
    frequency: input.frequency ?? "monthly", category: input.category ?? "joint",
    notes: input.notes ?? null, active: input.active ?? true,
    variable: input.variable ?? false,
  }).select(EXPENSE_COLS).single();
  if (error) throw new Error(`POST expense: ${error.message}`);
  return rowToExpense(data as ExpenseRow);
}

export async function createExpenses(inputs: ExpenseInput[]): Promise<FamilyExpense[]> {
  if (!inputs.length) return [];
  const { data, error } = await db().from("family_expenses").insert(
    inputs.map((i) => ({
      name: i.name ?? "Expense", amount: i.amount ?? 0,
      frequency: i.frequency ?? "monthly", category: i.category ?? "joint",
      notes: i.notes ?? null, active: i.active ?? true, variable: i.variable ?? false,
    }))
  ).select(EXPENSE_COLS);
  if (error) throw new Error(`bulk POST expenses: ${error.message}`);
  return (data as ExpenseRow[]).map(rowToExpense);
}

export async function updateExpense(id: string, input: Partial<ExpenseInput>): Promise<void> {
  const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) f.name = input.name;
  if (input.amount !== undefined) f.amount = input.amount;
  if (input.frequency !== undefined) f.frequency = input.frequency;
  if (input.category !== undefined) f.category = input.category;
  if (input.notes !== undefined) f.notes = input.notes;
  if (input.active !== undefined) f.active = input.active;
  if (input.variable !== undefined) f.variable = input.variable;
  const { error } = await db().from("family_expenses").update(f).eq("id", id);
  if (error) throw new Error(`PATCH expense: ${error.message}`);
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await db().from("family_expenses").delete().eq("id", id);
  if (error) throw new Error(`DELETE expense: ${error.message}`);
}

export async function countExpenses(): Promise<number> {
  const { count, error } = await db().from("family_expenses")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`COUNT expenses: ${error.message}`);
  return count ?? 0;
}

// ── Income ─────────────────────────────────────────────────────────────────
const INCOME_COLS = "id, name, amount, frequency, owner, type, notes, active, created_at, updated_at";

type IncomeRow = {
  id: string; name: string; amount: number | string | null;
  frequency: string; owner: string; type: string;
  notes: string | null; active: boolean | null;
  created_at: string; updated_at: string;
};
function rowToIncome(r: IncomeRow): FamilyIncome {
  return {
    id: r.id, name: r.name, amount: num(r.amount),
    frequency: (r.frequency as ExpenseFrequency) ?? "monthly",
    owner: (r.owner as AccountOwner) ?? "rich",
    type: (r.type as IncomeType) ?? "salary",
    notes: r.notes, active: r.active ?? true,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function getIncome(): Promise<FamilyIncome[]> {
  const { data, error } = await db().from("family_income").select(INCOME_COLS)
    .order("owner").order("created_at");
  if (error) throw new Error(`GET income: ${error.message}`);
  return (data as IncomeRow[]).map(rowToIncome);
}

export interface IncomeInput {
  name?: string; amount?: number; frequency?: ExpenseFrequency;
  owner?: AccountOwner; type?: IncomeType; notes?: string | null; active?: boolean;
}

export async function createIncome(input: IncomeInput): Promise<FamilyIncome> {
  const { data, error } = await db().from("family_income").insert({
    name: input.name ?? "New income", amount: input.amount ?? 0,
    frequency: input.frequency ?? "monthly", owner: input.owner ?? "rich",
    type: input.type ?? "salary", notes: input.notes ?? null, active: input.active ?? true,
  }).select(INCOME_COLS).single();
  if (error) throw new Error(`POST income: ${error.message}`);
  return rowToIncome(data as IncomeRow);
}

export async function updateIncome(id: string, input: Partial<IncomeInput>): Promise<void> {
  const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) f.name = input.name;
  if (input.amount !== undefined) f.amount = input.amount;
  if (input.frequency !== undefined) f.frequency = input.frequency;
  if (input.owner !== undefined) f.owner = input.owner;
  if (input.type !== undefined) f.type = input.type;
  if (input.notes !== undefined) f.notes = input.notes;
  if (input.active !== undefined) f.active = input.active;
  const { error } = await db().from("family_income").update(f).eq("id", id);
  if (error) throw new Error(`PATCH income: ${error.message}`);
}

export async function deleteIncome(id: string): Promise<void> {
  const { error } = await db().from("family_income").delete().eq("id", id);
  if (error) throw new Error(`DELETE income: ${error.message}`);
}

// ── Liabilities ────────────────────────────────────────────────────────────
const LIABILITY_COLS =
  "id, name, type, balance, monthly_payment, interest_rate, rate_type, rate_expiry_date, original_amount, term_remaining_months, notes, created_at, updated_at";

type LiabilityRow = {
  id: string; name: string; type: string;
  balance: number | string | null; monthly_payment: number | string | null;
  interest_rate: number | string | null; rate_type: string | null;
  rate_expiry_date: string | null; original_amount: number | string | null;
  term_remaining_months: number | null; notes: string | null;
  created_at: string; updated_at: string;
};
function rowToLiability(r: LiabilityRow): FamilyLiability {
  return {
    id: r.id, name: r.name, type: (r.type as LiabilityType) ?? "mortgage",
    balance: num(r.balance), monthlyPayment: num(r.monthly_payment),
    interestRate: r.interest_rate === null ? null : num(r.interest_rate),
    rateType: r.rate_type, rateExpiryDate: r.rate_expiry_date,
    originalAmount: r.original_amount === null ? null : num(r.original_amount),
    termRemainingMonths: r.term_remaining_months,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function getLiabilities(): Promise<FamilyLiability[]> {
  const { data, error } = await db().from("family_liabilities").select(LIABILITY_COLS)
    .order("created_at");
  if (error) throw new Error(`GET liabilities: ${error.message}`);
  return (data as LiabilityRow[]).map(rowToLiability);
}

export interface LiabilityInput {
  name?: string; type?: LiabilityType; balance?: number; monthlyPayment?: number;
  interestRate?: number | null; rateType?: string | null; rateExpiryDate?: string | null;
  originalAmount?: number | null; termRemainingMonths?: number | null; notes?: string | null;
}

export async function createLiability(input: LiabilityInput): Promise<FamilyLiability> {
  const { data, error } = await db().from("family_liabilities").insert({
    name: input.name ?? "New liability", type: input.type ?? "mortgage",
    balance: input.balance ?? 0, monthly_payment: input.monthlyPayment ?? 0,
    interest_rate: input.interestRate ?? null, rate_type: input.rateType ?? "fixed",
    rate_expiry_date: input.rateExpiryDate ?? null,
    original_amount: input.originalAmount ?? null,
    term_remaining_months: input.termRemainingMonths ?? null,
    notes: input.notes ?? null,
  }).select(LIABILITY_COLS).single();
  if (error) throw new Error(`POST liability: ${error.message}`);
  return rowToLiability(data as LiabilityRow);
}

export async function updateLiability(id: string, input: Partial<LiabilityInput>): Promise<void> {
  const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) f.name = input.name;
  if (input.type !== undefined) f.type = input.type;
  if (input.balance !== undefined) f.balance = input.balance;
  if (input.monthlyPayment !== undefined) f.monthly_payment = input.monthlyPayment;
  if (input.interestRate !== undefined) f.interest_rate = input.interestRate;
  if (input.rateType !== undefined) f.rate_type = input.rateType;
  if (input.rateExpiryDate !== undefined) f.rate_expiry_date = input.rateExpiryDate;
  if (input.originalAmount !== undefined) f.original_amount = input.originalAmount;
  if (input.termRemainingMonths !== undefined) f.term_remaining_months = input.termRemainingMonths;
  if (input.notes !== undefined) f.notes = input.notes;
  const { error } = await db().from("family_liabilities").update(f).eq("id", id);
  if (error) throw new Error(`PATCH liability: ${error.message}`);
}

export async function deleteLiability(id: string): Promise<void> {
  const { error } = await db().from("family_liabilities").delete().eq("id", id);
  if (error) throw new Error(`DELETE liability: ${error.message}`);
}

// ── Goals ──────────────────────────────────────────────────────────────────
const GOAL_COLS = "id, name, target_amount, target_date, current_amount, category, linked_account, notes, created_at, updated_at";

type GoalRow = {
  id: string; name: string; target_amount: number | string | null;
  target_date: string | null; current_amount: number | string | null;
  category: string; linked_account: string | null; notes: string | null;
  created_at: string; updated_at: string;
};
function rowToGoal(r: GoalRow): FamilyGoal {
  return {
    id: r.id, name: r.name,
    targetAmount: num(r.target_amount),
    targetDate: r.target_date,
    currentAmount: num(r.current_amount),
    category: (r.category as GoalCategory) ?? "savings",
    linkedAccount: r.linked_account,
    notes: r.notes, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function getGoals(): Promise<FamilyGoal[]> {
  const { data, error } = await db().from("family_goals").select(GOAL_COLS)
    .order("target_date", { nullsFirst: false }).order("created_at");
  if (error) throw new Error(`GET goals: ${error.message}`);
  return (data as GoalRow[]).map(rowToGoal);
}

export interface GoalInput {
  name?: string; targetAmount?: number; targetDate?: string | null;
  currentAmount?: number; category?: GoalCategory;
  linkedAccount?: string | null; notes?: string | null;
}

export async function createGoal(input: GoalInput): Promise<FamilyGoal> {
  const { data, error } = await db().from("family_goals").insert({
    name: input.name ?? "New goal", target_amount: input.targetAmount ?? 0,
    target_date: input.targetDate ?? null, current_amount: input.currentAmount ?? 0,
    category: input.category ?? "savings", linked_account: input.linkedAccount ?? null,
    notes: input.notes ?? null,
  }).select(GOAL_COLS).single();
  if (error) throw new Error(`POST goal: ${error.message}`);
  return rowToGoal(data as GoalRow);
}

export async function updateGoal(id: string, input: Partial<GoalInput>): Promise<void> {
  const f: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) f.name = input.name;
  if (input.targetAmount !== undefined) f.target_amount = input.targetAmount;
  if (input.targetDate !== undefined) f.target_date = input.targetDate;
  if (input.currentAmount !== undefined) f.current_amount = input.currentAmount;
  if (input.category !== undefined) f.category = input.category;
  if (input.linkedAccount !== undefined) f.linked_account = input.linkedAccount;
  if (input.notes !== undefined) f.notes = input.notes;
  const { error } = await db().from("family_goals").update(f).eq("id", id);
  if (error) throw new Error(`PATCH goal: ${error.message}`);
}

export async function deleteGoal(id: string): Promise<void> {
  const { error } = await db().from("family_goals").delete().eq("id", id);
  if (error) throw new Error(`DELETE goal: ${error.message}`);
}

// ── Snapshots ──────────────────────────────────────────────────────────────
const SNAPSHOT_COLS =
  "id, snapshot_date, total_assets, total_liabilities, net_worth, monthly_income, monthly_outgoings, monthly_surplus, notes, created_at";

type SnapshotRow = {
  id: string; snapshot_date: string;
  total_assets: number | string | null; total_liabilities: number | string | null;
  net_worth: number | string | null; monthly_income: number | string | null;
  monthly_outgoings: number | string | null; monthly_surplus: number | string | null;
  notes: string | null; created_at: string;
};
function rowToSnapshot(r: SnapshotRow): FamilySnapshot {
  return {
    id: r.id, snapshotDate: r.snapshot_date,
    totalAssets: num(r.total_assets), totalLiabilities: num(r.total_liabilities),
    netWorth: num(r.net_worth), monthlyIncome: num(r.monthly_income),
    monthlyOutgoings: num(r.monthly_outgoings), monthlySurplus: num(r.monthly_surplus),
    notes: r.notes, createdAt: r.created_at,
  };
}

export async function getSnapshots(): Promise<FamilySnapshot[]> {
  const { data, error } = await db().from("family_snapshots").select(SNAPSHOT_COLS)
    .order("snapshot_date").limit(36);
  if (error) throw new Error(`GET snapshots: ${error.message}`);
  return (data as SnapshotRow[]).map(rowToSnapshot);
}

export interface SnapshotInput {
  totalAssets: number; totalLiabilities: number; netWorth: number;
  monthlyIncome: number; monthlyOutgoings: number; monthlySurplus: number;
  snapshotDate?: string; notes?: string | null;
}

export async function createSnapshot(input: SnapshotInput): Promise<FamilySnapshot> {
  const { data, error } = await db().from("family_snapshots").insert({
    snapshot_date: input.snapshotDate ?? new Date().toISOString().split("T")[0],
    total_assets: input.totalAssets, total_liabilities: input.totalLiabilities,
    net_worth: input.netWorth, monthly_income: input.monthlyIncome,
    monthly_outgoings: input.monthlyOutgoings, monthly_surplus: input.monthlySurplus,
    notes: input.notes ?? null,
  }).select(SNAPSHOT_COLS).single();
  if (error) throw new Error(`POST snapshot: ${error.message}`);
  return rowToSnapshot(data as SnapshotRow);
}

// ── Documents ──────────────────────────────────────────────────────────────
const DOCUMENT_COLS = "id, name, file_url, content_type, kind, status, extracted, created_at";

type DocumentRow = {
  id: string; name: string; file_url: string; content_type: string | null;
  kind: string | null; status: string; extracted: unknown | null; created_at: string;
};
function rowToDocument(r: DocumentRow): FamilyDocument {
  return {
    id: r.id, name: r.name, fileUrl: r.file_url, contentType: r.content_type,
    kind: r.kind ?? "other", status: r.status ?? "uploaded",
    extracted: r.extracted, createdAt: r.created_at,
  };
}

export async function getDocuments(): Promise<FamilyDocument[]> {
  const { data, error } = await db().from("family_documents").select(DOCUMENT_COLS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`GET documents: ${error.message}`);
  return (data as DocumentRow[]).map(rowToDocument);
}

export interface DocumentInput {
  name: string; fileUrl: string; contentType?: string | null; kind?: string;
}

export async function createDocument(input: DocumentInput): Promise<FamilyDocument> {
  const { data, error } = await db().from("family_documents").insert({
    name: input.name, file_url: input.fileUrl,
    content_type: input.contentType ?? null, kind: input.kind ?? "other", status: "uploaded",
  }).select(DOCUMENT_COLS).single();
  if (error) throw new Error(`POST document: ${error.message}`);
  return rowToDocument(data as DocumentRow);
}

export async function updateDocument(id: string, fields: { status?: string; extracted?: unknown; kind?: string }): Promise<void> {
  const u: Record<string, unknown> = {};
  if (fields.status !== undefined) u.status = fields.status;
  if (fields.extracted !== undefined) u.extracted = fields.extracted;
  if (fields.kind !== undefined) u.kind = fields.kind;
  if (!Object.keys(u).length) return;
  const { error } = await db().from("family_documents").update(u).eq("id", id);
  if (error) throw new Error(`PATCH document: ${error.message}`);
}

export async function getDocument(id: string): Promise<FamilyDocument | null> {
  const { data, error } = await db().from("family_documents").select(DOCUMENT_COLS)
    .eq("id", id).maybeSingle();
  if (error) throw new Error(`GET document: ${error.message}`);
  return data ? rowToDocument(data as DocumentRow) : null;
}

export async function deleteDocument(id: string): Promise<void> {
  const { error } = await db().from("family_documents").delete().eq("id", id);
  if (error) throw new Error(`DELETE document: ${error.message}`);
}

// ── Checklist ──────────────────────────────────────────────────────────────
const CHECKLIST_COLS = "id, name, done, note, created_at";

type ChecklistRow = {
  id: string; name: string; done: boolean | null; note: string | null; created_at: string;
};
function rowToChecklist(r: ChecklistRow): ChecklistItem {
  return { id: r.id, name: r.name, done: r.done ?? false, note: r.note, createdAt: r.created_at };
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const { data, error } = await db().from("family_doc_checklist").select(CHECKLIST_COLS)
    .order("created_at");
  if (error) throw new Error(`GET checklist: ${error.message}`);
  return (data as ChecklistRow[]).map(rowToChecklist);
}

export async function createChecklistItem(name: string, note?: string): Promise<ChecklistItem> {
  const { data, error } = await db().from("family_doc_checklist")
    .insert({ name, note: note ?? null, done: false })
    .select(CHECKLIST_COLS).single();
  if (error) throw new Error(`POST checklist: ${error.message}`);
  return rowToChecklist(data as ChecklistRow);
}

export async function updateChecklistItem(id: string, fields: { done?: boolean; name?: string; note?: string }): Promise<void> {
  const u: Record<string, unknown> = {};
  if (fields.done !== undefined) u.done = fields.done;
  if (fields.name !== undefined) u.name = fields.name;
  if (fields.note !== undefined) u.note = fields.note || null;
  if (!Object.keys(u).length) return;
  const { error } = await db().from("family_doc_checklist").update(u).eq("id", id);
  if (error) throw new Error(`PATCH checklist: ${error.message}`);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const { error } = await db().from("family_doc_checklist").delete().eq("id", id);
  if (error) throw new Error(`DELETE checklist: ${error.message}`);
}
