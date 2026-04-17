import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchContractsServer } from "@/features/contracts/server";
import {
  UNASSIGNED_CONTRACT_ID,
  type InvoiceBootstrapData,
  type InvoicesListResponse
} from "@/features/invoices/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

async function fetchInvoicesServer(filters: Record<string, string>) {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);
  const params = new URLSearchParams(filters);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/invoices?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as
    | (InvoicesListResponse & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Invoices backend returned status ${response.status}.`);
  }

  return payload as InvoicesListResponse;
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
    payload
  };
}
