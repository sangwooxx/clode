import {
  archiveContract,
  createContract,
  deleteContractPermanently,
  getContract,
  getContractSnapshot,
  listContracts,
  updateContractControl,
  updateContract,
  type ContractControlPayload,
  type ContractPayload
} from "@/lib/api/contracts";
import type {
  ContractRecord,
  ContractResponse,
  ContractsListResponse,
  ContractSnapshot,
  ContractSnapshotResponse
} from "@/features/contracts/types";

export async function fetchContracts(includeArchived = true) {
  const response = (await listContracts(includeArchived)) as ContractsListResponse;
  return Array.isArray(response.contracts) ? response.contracts : [];
}

export async function fetchContract(contractId: string) {
  const response = (await getContract(contractId)) as ContractResponse;
  return response.contract;
}

export async function saveContract(contractId: string | null, payload: ContractPayload) {
  const response = (contractId
    ? await updateContract(contractId, payload)
    : await createContract(payload)) as ContractResponse;
  return response.contract;
}

export async function archiveContractRecord(contractId: string) {
  const response = (await archiveContract(contractId)) as ContractResponse;
  return response.contract;
}

export async function deleteContractRecord(contractId: string) {
  return deleteContractPermanently(contractId);
}

export async function fetchContractSnapshot(contractId: string) {
  return (await getContractSnapshot(contractId)) as ContractSnapshot;
}

export async function saveContractControl(contractId: string, payload: ContractControlPayload) {
  return (await updateContractControl(contractId, payload)) as ContractSnapshotResponse;
}

export function normalizeContractPayload(contract: {
  contract_number: string;
  name: string;
  investor: string;
  signed_date: string;
  end_date: string;
  contract_value: string;
  status: "active" | "archived";
}): ContractPayload {
  return {
    contract_number: contract.contract_number.trim(),
    name: contract.name.trim(),
    investor: contract.investor.trim(),
    signed_date: contract.signed_date.trim(),
    end_date: contract.end_date.trim(),
    contract_value: Number(contract.contract_value || 0),
    status: contract.status
  };
}

export function findContractById(contracts: ContractRecord[], contractId: string | null) {
  if (!contractId) return null;
  return contracts.find((contract) => contract.id === contractId) ?? null;
}

export function normalizeContractControlPayload(values: {
  planned_revenue_total: string;
  planned_invoice_cost_total: string;
  planned_labor_cost_total: string;
  forecast_revenue_total: string;
  forecast_invoice_cost_total: string;
  forecast_labor_cost_total: string;
  note: string;
}): ContractControlPayload {
  function toOptionalNumber(value: string) {
    const normalized = value.trim();
    if (!normalized) return null;
    const parsed = Number(normalized.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return {
    planned_revenue_total: toOptionalNumber(values.planned_revenue_total),
    planned_invoice_cost_total: toOptionalNumber(values.planned_invoice_cost_total),
    planned_labor_cost_total: toOptionalNumber(values.planned_labor_cost_total),
    forecast_revenue_total: toOptionalNumber(values.forecast_revenue_total),
    forecast_invoice_cost_total: toOptionalNumber(values.forecast_invoice_cost_total),
    forecast_labor_cost_total: toOptionalNumber(values.forecast_labor_cost_total),
    note: values.note.trim()
  };
}
