export type ContractStatus = "active" | "archived";

export type ContractRecord = {
  id: string;
  contract_number: string;
  name: string;
  investor: string;
  signed_date: string;
  end_date: string;
  contract_value: number;
  status: ContractStatus;
  created_at?: string | null;
  updated_at?: string | null;
  deleted_at?: string | null;
};

export type ContractMetrics = {
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

export type ContractActivity = {
  invoice_count: number;
  time_entry_count: number;
  planning_assignment_count: number;
  has_financial_data: boolean;
  has_operational_data: boolean;
  has_data: boolean;
};

export type ContractMonthlyBreakdown = {
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

export type ContractSnapshot = {
  contract: ContractRecord;
  metrics: ContractMetrics;
  activity: ContractActivity;
  monthly_breakdown: ContractMonthlyBreakdown[];
};

export type ContractsListResponse = {
  ok?: boolean;
  contracts: ContractRecord[];
};

export type ContractResponse = {
  ok?: boolean;
  contract: ContractRecord;
};

export type ContractSummaryItem = {
  id: string;
  label: string;
  value: string;
};

export type ContractKpiItem = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type ContractActivityItem = {
  id: string;
  label: string;
  value: string;
};

export type ContractMonthlyRowView = {
  id: string;
  month_key: string;
  month_label: string;
  revenue_total: string;
  invoice_cost_total: string;
  labor_cost_total: string;
  cost_total: string;
  margin: string;
  labor_hours_total: string;
  invoice_count: string;
};

export type ContractCenterViewModel = {
  heroKpiItems: ContractKpiItem[];
  secondaryKpiItems: ContractKpiItem[];
  activityItems: ContractActivityItem[];
  operationalStatus: string;
  emptyMessage: string | null;
  monthlyRows: ContractMonthlyRowView[];
};

export type ContractsViewModel = {
  contracts: ContractRecord[];
  summary: Array<{
    id: string;
    label: string;
    value: string;
    accent?: boolean;
    hint?: string;
  }>;
};

export type ContractFormValues = {
  contract_number: string;
  name: string;
  investor: string;
  signed_date: string;
  end_date: string;
  contract_value: string;
  status: ContractStatus;
};
