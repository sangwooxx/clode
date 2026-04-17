import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import {
  emptyWorkwearCatalogStore,
  emptyWorkwearIssuesStore,
  normalizeWorkwearCatalogStore,
  normalizeWorkwearIssuesStore,
} from "@/features/workwear/mappers";
import type {
  WorkwearBootstrapData,
  WorkwearCatalogItem,
  WorkwearIssueRecord,
} from "@/features/workwear/types";
import {
  WORKWEAR_CATALOG_STORE_KEY,
  WORKWEAR_ISSUES_STORE_KEY,
} from "@/features/workwear/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

async function fetchStoreServer<T>(storeKey: string, fallback: T) {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/stores/${storeKey}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return fallback;
  }

  const payload = (await response.json().catch(() => null)) as
    | ({ payload?: T; error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Store ${storeKey} returned status ${response.status}.`);
  }

  return payload.payload ?? fallback;
}

export async function fetchWorkwearBootstrapServer(): Promise<WorkwearBootstrapData> {
  const [employeesBootstrap, catalogPayload, issuesPayload] = await Promise.all([
    fetchEmployeesBootstrapServer(),
    fetchStoreServer<WorkwearCatalogItem[]>(
      WORKWEAR_CATALOG_STORE_KEY,
      emptyWorkwearCatalogStore()
    ),
    fetchStoreServer<WorkwearIssueRecord[]>(
      WORKWEAR_ISSUES_STORE_KEY,
      emptyWorkwearIssuesStore()
    ),
  ]);

  return {
    ...employeesBootstrap,
    catalog: normalizeWorkwearCatalogStore(catalogPayload),
    issues: normalizeWorkwearIssuesStore(issuesPayload),
  };
}
