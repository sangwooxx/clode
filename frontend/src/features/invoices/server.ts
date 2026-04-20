import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchContractsServer } from "@/features/contracts/server";
import {
  UNASSIGNED_CONTRACT_ID,
  type InvoiceBootstrapData,
  type InvoicesListResponse,
} from "@/features/invoices/types";

async function fetchInvoicesServer(filters: Record<string, string>) {
  const params = new URLSearchParams(filters);
  const { payload } = await fetchBackendJsonServer<InvoicesListResponse>(
    `/invoices?${params.toString()}`,
    { nextPath: "/invoices" }
  );

  if (!payload) {
    throw new Error("Invoices backend nie zwrocil poprawnego payloadu.");
  }

  return payload;
}

export async function fetchInvoicesBootstrapServer(): Promise<InvoiceBootstrapData> {
  const contracts = await fetchContractsServer(false);
  const initialContractId = contracts[0]?.id ?? UNASSIGNED_CONTRACT_ID;
  const payload = await fetchInvoicesServer(
    initialContractId === UNASSIGNED_CONTRACT_ID
      ? { scope: "all", type: "cost", unassigned: "1" }
      : { scope: "all", type: "cost", contract_id: initialContractId }
  );

  return {
    contracts,
    initialContractId,
    payload,
  };
}
