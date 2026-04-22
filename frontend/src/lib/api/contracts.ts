import { http } from "@/lib/api/http";

export type ContractPayload = {
  contract_number?: string;
  name: string;
  investor?: string;
  signed_date?: string;
  end_date?: string;
  contract_value?: number;
  status?: "active" | "archived";
};

export type ContractControlPayload = {
  planned_revenue_total?: number | null;
  planned_invoice_cost_total?: number | null;
  planned_labor_cost_total?: number | null;
  forecast_revenue_total?: number | null;
  forecast_invoice_cost_total?: number | null;
  forecast_labor_cost_total?: number | null;
  note?: string;
};

export function listContracts(includeArchived = false) {
  const params = includeArchived ? "?include_archived=1" : "";
  return http(`/contracts${params}`, { method: "GET" });
}

export function getContract(contractId: string) {
  return http(`/contracts/${encodeURIComponent(contractId)}`, { method: "GET" });
}

export function createContract(payload: ContractPayload) {
  return http("/contracts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateContract(contractId: string, payload: ContractPayload) {
  return http(`/contracts/${encodeURIComponent(contractId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function archiveContract(contractId: string) {
  return http(`/contracts/${encodeURIComponent(contractId)}`, { method: "DELETE" });
}

export function deleteContractPermanently(contractId: string) {
  return http(`/contracts/${encodeURIComponent(contractId)}?permanent=1`, {
    method: "DELETE"
  });
}

export function getContractUsage(contractId: string) {
  return http(`/contracts/${encodeURIComponent(contractId)}/usage`, { method: "GET" });
}

export function getContractSnapshot(contractId: string) {
  return http(`/contracts/${encodeURIComponent(contractId)}/snapshot`, { method: "GET" });
}

export function updateContractControl(contractId: string, payload: ContractControlPayload) {
  return http(`/contracts/${encodeURIComponent(contractId)}/control`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function getDashboardSnapshot() {
  return http("/dashboard/contracts", { method: "GET" });
}
