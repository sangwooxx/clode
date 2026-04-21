import type { ContractRecord } from "@/features/contracts/types";
import type { HoursEmployeeRecord, HoursMonthRecord } from "@/features/hours/types";

export type WorkCardEntryRecord = {
  id: string;
  contract_id: string;
  contract_name: string;
  hours: number;
};

export type WorkCardDayRecord = {
  date: string;
  note: string;
  entries: WorkCardEntryRecord[];
};

export type WorkCardRecord = {
  id: string;
  employee_id: string;
  employee_name: string;
  month_key: string;
  month_label: string;
  updated_at: string;
  rows: WorkCardDayRecord[];
};

export type WorkCardStore = {
  version: 1;
  cards: WorkCardRecord[];
};

export type WorkCardHistorySummary = {
  card_id: string;
  employee_id: string;
  employee_name: string;
  month_key: string;
  month_label: string;
  updated_at: string;
  total_hours: number;
  filled_days: number;
};

export type WorkCardBootstrapData = {
  contracts: ContractRecord[];
  employees: HoursEmployeeRecord[];
  historicalEmployees: HoursEmployeeRecord[];
  months: HoursMonthRecord[];
  selectedMonthKey: string;
  selectedEmployeeKey: string;
  historicalCards: WorkCardHistorySummary[];
};

export type WorkCardEmployeeOption = {
  key: string;
  name: string;
  label: string;
  description: string;
  status: "active" | "inactive";
  employee: HoursEmployeeRecord;
};

export type WorkCardContractOption = {
  id: string;
  label: string;
  code: string;
  status: "active" | "archived" | "unassigned" | "missing";
};

export type WorkCardDayViewModel = {
  date: string;
  dayNumber: string;
  weekdayLabel: string;
  isWeekend: boolean;
  note: string;
  entries: WorkCardEntryRecord[];
  hoursByContract: Record<string, string>;
  totalHours: number;
};

export type WorkCardSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type WorkCardContractTotals = {
  contractId: string;
  hours: number;
};
