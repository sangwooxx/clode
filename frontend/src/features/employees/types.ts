import type { HoursEmployeeRecord } from "@/features/hours/types";

export type EmployeeDirectoryRecord = HoursEmployeeRecord & {
  key: string;
  source: "store" | "directory" | "operational";
  isPersisted: boolean;
};

export type EmployeeFormValues = {
  first_name: string;
  last_name: string;
  worker_code: string;
  position: string;
  status: "active" | "inactive";
  employment_date: string;
  employment_end_date: string;
  street: string;
  city: string;
  phone: string;
  medical_exam_valid_until: string;
};

export type EmployeesBootstrapData = {
  directoryEmployees: HoursEmployeeRecord[];
  operationalEmployees: HoursEmployeeRecord[];
  relationSummaries: EmployeeRelationSummary[];
};

export type EmployeeRelationSnapshot = {
  hoursEntries: number;
  workCards: number;
  monthsCount: number;
  totalHours: number;
  totalCost: number;
};

export type EmployeeRelationSummary = {
  employee_id?: string;
  employee_name?: string;
  hours_entries: number;
  work_cards: number;
  months_count: number;
  total_hours: number;
  total_cost: number;
};

export type EmployeeMedicalState = {
  label: string;
  tone: "ok" | "warning" | "danger" | "neutral";
  dateText: string;
  daysText: string;
};

export type EmployeeSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type EmployeeTableRow = {
  index: number;
  employee: EmployeeDirectoryRecord;
  relations: EmployeeRelationSnapshot;
  medical: EmployeeMedicalState;
};
