import type { HoursContractOption, HoursEntryDetails, HoursEmployeeRecord } from "@/features/hours/types";

export type HoursEmployeeContractCell = {
  key: string;
  label: string;
  code: string;
  status: HoursEntryDetails["contractStatus"];
  hours: number;
  cost: number;
  entriesCount: number;
};

export type HoursEmployeeRow = {
  key: string;
  index: number;
  employeeId: string;
  employeeName: string;
  employeeLabel: string;
  employeeCode: string;
  employeePosition: string;
  employeeStatus: HoursEmployeeRecord["status"];
  contracts: HoursEmployeeContractCell[];
  totalHours: number;
  totalCost: number;
  entriesCount: number;
};

export type HoursContractSummaryRow = {
  index: number;
  aggregate: {
    contract_id: string;
    contract_name: string;
    hours_total: number;
    cost_total: number;
    entries_count: number;
  };
  option: HoursContractOption;
};
