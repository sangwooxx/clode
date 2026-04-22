import {
  archiveContract,
  createContract,
  deleteContractPermanently,
  getContract,
  getContractSnapshot,
  listContracts,
  updateContract,
  type ContractPayload
} from "@/lib/api/contracts";
import type {
  ContractRecord,
  ContractResponse,
  ContractSnapshot,
  ContractsListResponse,
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
