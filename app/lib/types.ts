// Shared types for Finance Hub. Mirrors the Postgres schema in db/schema.sql.

export type ReceiptStatus = "pending" | "approved" | "rejected" | "failed";
export type ReceiptSource = "photo" | "upload" | "email";

export type ReceiptLineItem = {
  description: string;
  quantity?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  vat_rate?: string | null;
};

export type Receipt = {
  id: string;
  status: ReceiptStatus;
  source: ReceiptSource;
  source_ref: string | null;
  file_sha256: string;

  supplier: string | null;
  description: string | null;
  supply_date: string | null; // ISO YYYY-MM-DD
  currency: string | null;
  gross_total: number | null;
  net_total: number | null;
  vat_total: number | null;
  vat_rate: string | null;
  payment_method: "card" | "cash" | "bank_transfer" | "direct_debit" | null;
  category_url: string | null;
  category_name: string | null;
  line_items: ReceiptLineItem[] | null;
  is_business_card: boolean | null;

  model_confidence: number | null;
  low_confidence_fields: string[] | null;
  extracted_json: unknown | null;

  receipt_image_url: string | null;
  freeagent_url: string | null;
  pushed_at: string | null;
  notes: string | null;

  created_at: string;
  updated_at: string;
};

export type FreeAgentCategoryType = "admin_expenses" | "cost_of_sales" | "income" | "general";

export type FreeAgentCategory = {
  category_url: string;
  nominal_code: string | null;
  description: string | null;
  category_type: FreeAgentCategoryType | null;
  auto_vat_rate: string | null;
  usage_count: number;
  last_synced: string;
};

export type ChecklistState = {
  item_id: string;
  completed: boolean;
  completed_at: string | null;
  notes: string | null;
  document_id: string | null;
  updated_at: string;
};

export type DocumentCategory =
  | "CT600"
  | "Self Assessment"
  | "Statutory Accounts"
  | "Trial Balance"
  | "Directors Loan"
  | "P60"
  | "VAT Returns"
  | "Other";

export type Document = {
  id: string;
  category: DocumentCategory;
  year: string | null;
  filename: string;
  file_url: string;
  uploaded_at: string;
  notes: string | null;
  checklist_item_id: string | null;
};

export type TaxType =
  | "PAYE"
  | "VAT"
  | "Corporation Tax"
  | "Self Assessment"
  | "Confirmation Statement"
  | "Annual Accounts"
  | "P60"
  | "P11D";

export type DeadlineStatus = "upcoming" | "due" | "overdue" | "paid";

export type TaxDeadline = {
  id: string;
  tax_type: TaxType;
  due_date: string;
  amount: number | null;
  status: DeadlineStatus;
  google_calendar_event_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
