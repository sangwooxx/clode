import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import type { WorkCardStore } from "@/features/work-cards/types";

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
  storeEmployees: HoursEmployeeRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
};

export type EmployeeRelationSnapshot = {
  hoursEntries: number;
  workCards: number;
  monthsCount: number;
  totalHours: number;
  totalCost: number;
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
