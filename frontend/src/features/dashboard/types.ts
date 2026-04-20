export type DashboardTotals = {
  revenue_total: number;
  invoice_cost_total: number;
  labor_cost_total: number;
  labor_hours_total: number;
  cost_total: number;
  margin: number;
  invoice_count: number;
  cost_invoice_count: number;
  sales_invoice_count: number;
  cost_by_category: Record<string, number>;
};

export type DashboardContract = {
  id: string;
  contract_number: string;
  name: string;
  investor: string;
  status: string;
  contract_value: number;
  signed_date: string;
  end_date: string;
};

export type DashboardMetrics = {
  contract_id: string;
  revenue_total: number;
  invoice_cost_total: number;
  labor_cost_total: number;
  labor_hours_total: number;
  cost_total: number;
  cost_by_category: Record<string, number>;
  invoice_count: number;
  cost_invoice_count: number;
  sales_invoice_count: number;
  margin: number;
};

export type DashboardMonthlyBreakdown = {
  month_key: string;
  month_label: string;
  revenue_total: number;
  invoice_cost_total: number;
  labor_cost_total: number;
  labor_hours_total: number;
  cost_total: number;
  margin: number;
  invoice_count: number;
  cost_invoice_count: number;
  sales_invoice_count: number;
};

export type DashboardContractItem = {
  contract: DashboardContract;
  metrics: DashboardMetrics;
  monthly_breakdown: DashboardMonthlyBreakdown[];
};

export type DashboardUnassignedInvoice = {
  id: string;
  issue_date: string;
  type: "sales" | "cost";
  document_number: string;
  contract_name: string;
  party: string;
  category: string;
  description: string;
  net_amount: number;
  vat_rate: number;
  gross_amount: number;
};

export type DashboardUnmatchedHours = {
  source_name: string;
  entries: number;
  labor_hours: number;
  labor_cost: number;
};

export type DashboardSnapshot = {
  range: {
    scope: string;
    year?: string;
    month?: string;
  };
  contracts: DashboardContractItem[];
  unassigned: DashboardMetrics;
  unassigned_invoices: DashboardUnassignedInvoice[];
  unmatched_hours: DashboardUnmatchedHours[];
  totals: DashboardTotals;
};

export type DashboardViewModel = {
  summary: Array<{
    id: string;
    label: string;
    value: string;
    accent?: boolean;
    hint?: string;
  }>;
  contracts: DashboardContractItem[];
  unassignedInvoices: DashboardUnassignedInvoice[];
  unmatchedHours: DashboardUnmatchedHours[];
  totals: DashboardTotals;
  unassigned: DashboardMetrics;
};
