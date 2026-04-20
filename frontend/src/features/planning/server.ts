import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchContractsServer } from "@/features/contracts/server";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import type { PlanningBootstrapData } from "@/features/planning/types";
import { emptyPlanningStore, emptyVacationStore, normalizePlanningStore, normalizeVacationStore } from "@/features/vacations/mappers";
import { PLANNING_STORE_KEY, VACATIONS_STORE_KEY, type PlanningStore, type VacationStore } from "@/features/vacations/types";

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

export async function fetchPlanningBootstrapServer(): Promise<PlanningBootstrapData> {
  const [employeesBootstrap, contracts, planningStorePayload, vacationStorePayload] =
    await Promise.all([
      fetchEmployeesBootstrapServer(),
      fetchContractsServer(true),
      fetchStoreServer<PlanningStore>(PLANNING_STORE_KEY, emptyPlanningStore()),
      fetchStoreServer<VacationStore>(VACATIONS_STORE_KEY, emptyVacationStore()),
    ]);

  return {
    ...employeesBootstrap,
    contracts,
    planningStore: normalizePlanningStore(planningStorePayload),
    vacationStore: normalizeVacationStore(vacationStorePayload),
  };
}
