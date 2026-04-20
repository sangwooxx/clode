import type { EmployeeDirectoryRecord, EmployeesBootstrapData } from "@/features/employees/types";

export const WORKWEAR_CATALOG_STORE_KEY = "workwear_catalog";
export const WORKWEAR_ISSUES_STORE_KEY = "workwear_issues";

export const WORKWEAR_SIZE_OPTIONS = [
  "UNI",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
] as const;

export type WorkwearCatalogItem = {
  id: string;
  name: string;
  category: string;
  notes: string;
};

export type WorkwearIssueRecord = {
  id: string;
  employee_id?: string;
  employee_key?: string;
  employee_name: string;
  issue_date: string;
  item_id: string;
  item_name: string;
  size: string;
  quantity: number;
  notes: string;
};

export type WorkwearBootstrapData = EmployeesBootstrapData & {
  catalog: WorkwearCatalogItem[];
  issues: WorkwearIssueRecord[];
};

export type WorkwearIssueResolution =
  | "exact"
  | "historical_inactive"
  | "missing_employee"
  | "ambiguous";

export type WorkwearIssueEntry = {
  issue: WorkwearIssueRecord;
  employee: EmployeeDirectoryRecord | null;
  item: WorkwearCatalogItem | null;
  resolution: WorkwearIssueResolution;
  resolutionLabel: string;
  isHistorical: boolean;
};

export type WorkwearEmployeeRow = {
  index: number;
  employee: EmployeeDirectoryRecord;
  issuesCount: number;
  totalQuantity: number;
  lastIssueDate: string;
  lastItemName: string;
  isHistorical: boolean;
};

export type WorkwearIssueRow = {
  index: number;
  entry: WorkwearIssueEntry;
};

export type WorkwearCatalogRow = {
  index: number;
  item: WorkwearCatalogItem;
  issuesCount: number;
  activeAssignments: number;
  lastIssueDate: string;
};

export type WorkwearAttentionRow = {
  index: number;
  entry: WorkwearIssueEntry;
  reason: string;
};

export type WorkwearEmployeeOption = {
  key: string;
  label: string;
  subtitle: string;
  employee: EmployeeDirectoryRecord;
  historical: boolean;
};

export type WorkwearSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type WorkwearIssueFormValues = {
  employee_key: string;
  issue_date: string;
  item_id: string;
  size: string;
  quantity: string;
  notes: string;
};

export type WorkwearCatalogFormValues = {
  name: string;
  category: string;
  notes: string;
};
