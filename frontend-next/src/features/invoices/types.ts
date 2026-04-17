import type {
  InvoicePaymentStatus,
  InvoiceScope,
  InvoiceType
} from "@/lib/api/invoices";
import type { ContractRecord } from "@/features/contracts/types";

export { type InvoicePaymentStatus, type InvoiceScope, type InvoiceType };

export const UNASSIGNED_CONTRACT_ID = "__unassigned__";

export type InvoiceRecord = {
  id: string;
  contract_id: string | null;
  contract_name: string;
  type: InvoiceType;
  issue_date: string;
  invoice_number: string;
  counterparty_name: string;
  category_or_description: string;
  cost_category?: string | null;
  amount_net: number;
  vat_rate: number;
  amount_vat: number;
  amount_gross: number;
  due_date: string;
  payment_date: string;
  payment_status: InvoicePaymentStatus;
  notes: string;
  created_at?: string | null;
  updated_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type InvoiceStats = {
  cost_count: number;
  cost_net: number;
  sales_count: number;
  sales_net: number;
  saldo_net: number;
};

export type InvoiceSummary = {
  count: number;
  amount_net: number;
  amount_vat: number;
  amount_gross: number;
};

export type InvoiceFilters = {
  contract_id?: string;
  unassigned?: boolean;
  scope: InvoiceScope;
  year?: string;
  month?: string;
  type: InvoiceType;
  payment_status?: string;
};

export type InvoicesListResponse = {
  items: InvoiceRecord[];
  stats: InvoiceStats;
  summary: InvoiceSummary;
  available_years: string[];
  available_months: string[];
  filters: InvoiceFilters;
};

export type InvoiceResponse = {
  invoice: InvoiceRecord;
};

export type InvoiceCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
};

export type InvoicesViewModel = {
  analysisCards: InvoiceCard[];
  summaryCards: InvoiceCard[];
  scopeCaption: string;
};

export type InvoiceFormValues = {
  type: InvoiceType;
  issue_date: string;
  invoice_number: string;
  counterparty_name: string;
  category_or_description: string;
  notes: string;
  amount_net: string;
  vat_mode: "23" | "none" | "custom";
  vat_rate_custom: string;
  amount_vat: string;
  amount_gross: string;
  due_date: string;
  payment_date: string;
  payment_status: InvoicePaymentStatus;
};

export type InvoiceBootstrapData = {
  contracts: ContractRecord[];
  initialContractId: string;
  payload: InvoicesListResponse;
};
