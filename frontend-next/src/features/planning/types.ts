import type { ContractRecord } from "@/features/contracts/types";
import type { EmployeeDirectoryRecord, EmployeesBootstrapData } from "@/features/employees/types";
import type { PlanningStore, VacationStore, VacationType } from "@/features/vacations/types";

export type PlanningBootstrapData = EmployeesBootstrapData & {
  contracts: ContractRecord[];
  planningStore: PlanningStore;
  vacationStore: VacationStore;
};

export type PlanningAbsenceInfo = {
  requestId: string;
  type: VacationType;
  label: string;
};

export type PlanningAssignmentResolution =
  | "exact"
  | "historical_inactive"
  | "unmatched"
  | "ambiguous";

export type PlanningAssignmentEntry = {
  rawKey: string;
  employee: EmployeeDirectoryRecord | null;
  employeeName: string;
  employeeId: string | null;
  employeeKey: string | null;
  contractId: string | null;
  contractName: string;
  contract: ContractRecord | null;
  note: string;
  resolution: PlanningAssignmentResolution;
  resolutionLabel: string;
};

export type PlanningEmployeeRow = {
  index: number;
  employee: EmployeeDirectoryRecord;
  assignment: PlanningAssignmentEntry | null;
  absence: PlanningAbsenceInfo | null;
  hasConflict: boolean;
  statusLabel: string;
  statusTone: "ok" | "warning" | "danger" | "neutral";
};

export type PlanningContractSummaryRow = {
  index: number;
  contract: ContractRecord;
  assignedEmployees: string[];
  staffingStatus: string;
};

export type PlanningHistoricalRow = {
  index: number;
  entry: PlanningAssignmentEntry;
};

export type PlanningSummaryCard = {
  id: string;
  label: string;
  value: string;
  accent?: boolean;
};

export type PlanningDaySummary = {
  selectedDate: string;
  activeContractsCount: number;
  assignedCount: number;
  unavailableCount: number;
  unassignedCount: number;
  unassignedNames: string[];
  unavailableNames: string[];
};

export type PlanningCalendarCell = {
  dateKey: string;
  dayNumber: number;
  isOutsideMonth: boolean;
  isSelected: boolean;
  assignmentCount: number;
  absenceCount: number;
  historicalCount: number;
};

export type PlanningContractOption = {
  id: string;
  label: string;
  subtitle: string;
  contract: ContractRecord;
};

export type PlanningDraftRecord = {
  contractId: string;
  note: string;
};
