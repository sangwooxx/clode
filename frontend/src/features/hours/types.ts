import type { ContractRecord, ContractStatus } from "@/features/contracts/types";
import type { TimeEntriesQuery } from "@/lib/api/time-entries";

export const UNASSIGNED_TIME_CONTRACT_ID = "__unassigned__";

export type HoursEmployeeRecord = {
  id?: string;
  name: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  status?: "active" | "inactive";
  employment_date?: string;
  employment_end_date?: string;
  street?: string;
  city?: string;
  phone?: string;
  medical_exam_valid_until?: string;
  worker_code?: string;
};

export type HoursMonthFinance = {
  zus_company_1: number;
  zus_company_2: number;
  zus_company_3: number;
  pit4_company_1: number;
  pit4_company_2: number;
  pit4_company_3: number;
  payouts: number;
};

export type HoursMonthRecord = {
  id: string;
  month_key: string;
  month_label: string;
  selected: boolean;
  visible_investments: string[];
  finance: HoursMonthFinance;
};

export type TimeEntryRecord = {
  id: string;
  month_id: string;
  month_key: string;
  month_label: string;
  employee_id: string;
  employee_name: string;
  contract_id: string;
  contract_name: string;
  hours: number;
  cost_amount: number;
};

export type HoursContractAggregate = {
  contract_id: string;
  contract_name: string;
  hours_total: number;
  cost_total: number;
  entries_count: number;
};

export type HoursMonthAggregate = {
  month_key: string;
  month_label: string;
  hours_total: number;
  cost_total: number;
  entries_count: number;
};

export type HoursAggregates = {
  per_contract: HoursContractAggregate[];
  per_month: HoursMonthAggregate[];
};

export type HoursListResponse = {
  ok?: boolean;
  entries: TimeEntryRecord[];
  months: HoursMonthRecord[];
  aggregates: HoursAggregates;
  filters: TimeEntriesQuery;
};

export type HoursTimeEntryResponse = {
  ok?: boolean;
  time_entry: TimeEntryRecord;
};

export type HoursMonthResponse = {
  ok?: boolean;
  month: HoursMonthRecord;
};

export type HoursBootstrapData = {
  contracts: ContractRecord[];
  employees: HoursEmployeeRecord[];
  historicalEmployees: HoursEmployeeRecord[];
  payload: HoursListResponse;
  selectedMonthKey: string;
};

export type HoursEntryFormValues = {
  employee_name: string;
  contract_id: string;
  hours: string;
};

export type HoursFinanceDraft = {
  zus_company_1: string;
  zus_company_2: string;
  zus_company_3: string;
  pit4_company_1: string;
  pit4_company_2: string;
  pit4_company_3: string;
  payouts: string;
};

export type HoursCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type HoursMonthOption = {
  value: string;
  label: string;
};

export type HoursContractOption = {
  id: string;
  label: string;
  code: string;
  status: ContractStatus | "unassigned" | "missing";
};

export type HoursEntryDetails = {
  employeeName: string;
  employeeCode: string;
  employeePosition: string;
  contractLabel: string;
  contractStatus: ContractStatus | "unassigned" | "missing";
  contractCode: string;
};

export type HoursEntryRow = {
  id: string;
  index: number;
  entry: TimeEntryRecord;
  details: HoursEntryDetails;
};
