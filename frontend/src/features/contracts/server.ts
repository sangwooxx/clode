import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import type { ContractSnapshotResponse, ContractsListResponse } from "@/features/contracts/types";

export async function fetchContractsServer(includeArchived = true) {
  const query = includeArchived ? "?include_archived=1" : "";
  const { payload } = await fetchBackendJsonServer<ContractsListResponse>(
    `/contracts${query}`,
    { nextPath: "/contracts" }
  );

  return Array.isArray(payload?.contracts) ? payload.contracts : [];
}

export async function fetchContractSnapshotServer(contractId: string) {
  const { payload } = await fetchBackendJsonServer<ContractSnapshotResponse>(
    `/contracts/${encodeURIComponent(contractId)}/snapshot`,
    { nextPath: "/contracts" }
  );

  return payload ?? null;
}
