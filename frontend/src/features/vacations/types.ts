import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import type { SettingsWorkflowValues } from "@/features/settings/types";
import type { WorkCardStore } from "@/features/work-cards/types";

export type VacationType = "vacation" | "on_demand" | "sick_leave" | "other";
export type VacationStatus = "pending" | "approved" | "rejected";

export type VacationBalanceRecord = {
  employee_id?: string;
  employee_key?: string;
  employee_name?: string;
  base_days?: number;
  carryover_days?: number;
  extra_days?: number;
};

export type VacationRequestRecord = {
  id: string;
  employee_id?: string;
  employee_key?: string;
  employee_name: string;
  type: VacationType | string;
  start_date: string;
  end_date: string;
  days: number;
  status: VacationStatus | string;
  requested_by?: string;
  notes?: string;
  created_at?: string;
};

export type VacationStore = {
  version?: number;
  balances: Record<string, VacationBalanceRecord>;
  requests: VacationRequestRecord[];
};

export type PlanningAssignmentRecord = {
  contract_id?: string;
  employee_id?: string;
  employee_key?: string;
  employee_name?: string;
  contract_name?: string;
  note?: string;
};

export type PlanningStore = {
  assignments: Record<string, Record<string, PlanningAssignmentRecord>>;
};

export type VacationsBootstrapData = {
  directoryEmployees: HoursEmployeeRecord[];
  storeEmployees: HoursEmployeeRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
  vacationStore: VacationStore;
  planningStore: PlanningStore;
  workflow: SettingsWorkflowValues;
};

export type VacationBalanceFormValues = {
  base_days: string;
  carryover_days: string;
  extra_days: string;
};

export type VacationRequestFormValues = {
  employee_key: string;
  type: VacationType;
  start_date: string;
  end_date: string;
  days: string;
  status: VacationStatus;
  requested_by: string;
  notes: string;
};

export type VacationEmployeeOption = {
  key: string;
  label: string;
  description: string;
  employee: EmployeeDirectoryRecord;
  status: "active" | "inactive";
};

export type VacationEmployeeStats = {
  balance: {
    base_days: number;
    carryover_days: number;
    extra_days: number;
  };
  total_pool: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
  requests_count: number;
  approved_requests: number;
};

export type VacationSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type VacationEmployeeRow = {
  index: number;
  employee: EmployeeDirectoryRecord;
  stats: VacationEmployeeStats;
};

export type VacationHistoryRow = {
  index: number;
  request: VacationRequestRecord;
  employee: EmployeeDirectoryRecord | null;
};

export type VacationApprovalRow = {
  index: number;
  request: VacationRequestRecord;
  employee: EmployeeDirectoryRecord | null;
  displayName: string;
  subtitle: string;
};

export type VacationPlanningConflict = {
  date: string;
  contract_name: string;
  kind: "exact" | "ambiguous";
  employee_name?: string;
};

export type VacationBalanceLookup = {
  key: string | null;
  record: VacationBalanceRecord;
  status: "resolved" | "missing" | "ambiguous";
  source: "id" | "key" | "legacy_name" | "none";
};
