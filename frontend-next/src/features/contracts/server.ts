import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import type { ContractsListResponse } from "@/features/contracts/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

export async function fetchContractsServer(includeArchived = true) {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);
  const query = includeArchived ? "?include_archived=1" : "";

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/contracts${query}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {})
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => null)) as
    | (ContractsListResponse & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Contracts backend returned status ${response.status}.`);
  }

  return Array.isArray(payload.contracts) ? payload.contracts : [];
}
