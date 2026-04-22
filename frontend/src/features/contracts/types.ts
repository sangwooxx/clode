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

export type ContractAlertLevel = "info" | "warning" | "critical";
export type ContractHealthLevel = "good" | "attention" | "critical";
export type ContractVarianceStatus = "missing" | "on_track" | "warning" | "critical";
export type ContractRevenueSource = "manual" | "contract_value" | "planned_revenue" | "missing";

export type ContractSnapshotMetrics = {
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
  margin_percent?: number | null;
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

export type ContractControlState = {
  contract_id: string;
  planned_revenue_total: number | null;
  planned_invoice_cost_total: number | null;
  planned_labor_cost_total: number | null;
  forecast_revenue_total: number | null;
  forecast_invoice_cost_total: number | null;
  forecast_labor_cost_total: number | null;
  note: string;
  updated_at: string;
  updated_by: string;
};

export type ContractPlanOverview = {
  is_configured: boolean;
  revenue_total: number | null;
  invoice_cost_total: number | null;
  labor_cost_total: number | null;
  total_cost: number | null;
  margin: number | null;
  margin_percent: number | null;
  revenue_source: ContractRevenueSource;
};

export type ContractForecastOverview = ContractPlanOverview & {
  is_manual: boolean;
};

export type ContractActualOverview = {
  revenue_total: number;
  invoice_cost_total: number;
  labor_cost_total: number;
  total_cost: number;
  margin: number;
  margin_percent: number | null;
  labor_hours_total: number;
  invoice_count: number;
};

export type ContractVarianceOverview = {
  status: ContractVarianceStatus;
  label: string;
  cost_total: number | null;
  margin: number | null;
  margin_percent: number | null;
};

export type ContractFreshness = {
  snapshot_generated_at: string;
  last_invoice_date: string | null;
  last_financial_activity_at: string | null;
  last_time_entry_month: string | null;
  last_planning_date: string | null;
  last_operational_activity_at: string | null;
  days_since_financial_activity: number | null;
  days_since_operational_activity: number | null;
};

export type ContractHealth = {
  level: ContractHealthLevel;
  summary: string;
  reasons: string[];
};

export type ContractAlert = {
  level: ContractAlertLevel;
  code: string;
  title: string;
  description: string;
  context?: string | null;
};

export type ContractSnapshot = {
  contract: ContractRecord;
  metrics: ContractSnapshotMetrics;
  activity: ContractActivity;
  monthly_breakdown: ContractMonthlyBreakdown[];
  control: ContractControlState;
  plan: ContractPlanOverview;
  actual: ContractActualOverview;
  forecast: ContractForecastOverview;
  variance: ContractVarianceOverview;
  freshness: ContractFreshness;
  health: ContractHealth;
  alerts: ContractAlert[];
  snapshot_generated_at: string;
};

export type ContractsListResponse = {
  ok?: boolean;
  contracts: ContractRecord[];
};

export type ContractResponse = {
  ok?: boolean;
  contract: ContractRecord;
};

export type ContractSnapshotResponse = ContractSnapshot & {
  ok?: boolean;
};

export type ContractSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
};

export type ContractsViewModel = {
  contracts: ContractRecord[];
  summary: ContractSummaryCard[];
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

export type ContractControlFormValues = {
  planned_revenue_total: string;
  planned_invoice_cost_total: string;
  planned_labor_cost_total: string;
  forecast_revenue_total: string;
  forecast_invoice_cost_total: string;
  forecast_labor_cost_total: string;
  note: string;
};

export type ContractKpiItem = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type ContractHeaderDetail = {
  id: string;
  label: string;
  value: string;
};

export type ContractFreshnessItem = {
  id: string;
  label: string;
  value: string;
  hint?: string;
};

export type ContractPlanComparisonRow = {
  id: string;
  label: string;
  planValue: string;
  actualValue: string;
  varianceValue: string;
};

export type ContractForecastItem = {
  id: string;
  label: string;
  value: string;
};

export type ContractActivityItem = {
  id: string;
  label: string;
  value: string;
};

export type ContractAlertView = {
  id: string;
  level: ContractAlertLevel;
  title: string;
  description: string;
  context?: string | null;
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
  contractName: string;
  contractNumber: string;
  contractStatus: string;
  investor: string;
  healthLevel: ContractHealthLevel;
  healthLabel: string;
  healthSummary: string;
  headerDetails: ContractHeaderDetail[];
  heroKpiItems: ContractKpiItem[];
  freshnessItems: ContractFreshnessItem[];
  planComparisonRows: ContractPlanComparisonRow[];
  planStatusLabel: string;
  forecastItems: ContractForecastItem[];
  forecastSummary: string;
  controlNote: string | null;
  controlUpdatedAtLabel: string | null;
  alerts: ContractAlertView[];
  activityItems: ContractActivityItem[];
  operationalStatus: string;
  emptyMessage: string | null;
  monthlyRows: ContractMonthlyRowView[];
};
