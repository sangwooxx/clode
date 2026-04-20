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

export type ContractUsage = {
  invoices: number;
  hours: number;
  hours_entries: number;
  planning: number;
};

export type ContractUsageSnapshot = {
  contract: ContractRecord;
  usage: ContractUsage;
  has_operational_data: boolean;
};

export type ContractsListResponse = {
  ok?: boolean;
  contracts: ContractRecord[];
};

export type ContractResponse = {
  ok?: boolean;
  contract: ContractRecord;
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
