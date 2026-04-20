import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import { createDefaultWorkflowValues } from "@/features/settings/types";
import { emptyPlanningStore, emptyVacationStore, normalizePlanningStore, normalizeVacationStore } from "@/features/vacations/mappers";
import type { PlanningStore, VacationStore, VacationsBootstrapData } from "@/features/vacations/types";
import { PLANNING_STORE_KEY, VACATIONS_STORE_KEY } from "@/features/vacations/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

async function fetchStoreServer<T>(storeKey: string, fallback: T, options?: { allowForbidden?: boolean }) {
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

  if (
    response.status === 404 ||
    (options?.allowForbidden && (response.status === 401 || response.status === 403))
  ) {
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

export async function fetchVacationsBootstrapServer(): Promise<VacationsBootstrapData> {
  const [employeesBootstrap, vacationStorePayload, planningStorePayload, settingsStorePayload] = await Promise.all([
    fetchEmployeesBootstrapServer(),
    fetchStoreServer<VacationStore>(VACATIONS_STORE_KEY, emptyVacationStore()),
    fetchStoreServer<PlanningStore>(PLANNING_STORE_KEY, emptyPlanningStore(), {
      allowForbidden: true,
    }),
    fetchStoreServer<Record<string, unknown>>("settings", {}),
  ]);

  const rawWorkflow =
    settingsStorePayload &&
    typeof settingsStorePayload === "object" &&
    settingsStorePayload.workflow &&
    typeof settingsStorePayload.workflow === "object"
      ? settingsStorePayload.workflow
      : settingsStorePayload;

  return {
    ...employeesBootstrap,
    vacationStore: normalizeVacationStore(vacationStorePayload),
    planningStore: normalizePlanningStore(planningStorePayload),
    workflow: createDefaultWorkflowValues({
      vacationApprovalMode:
        String((rawWorkflow as { vacationApprovalMode?: string } | null)?.vacationApprovalMode || "") ===
        "admin"
          ? "admin"
          : "permission",
      vacationNotifications:
        String((rawWorkflow as { vacationNotifications?: string } | null)?.vacationNotifications || "") ===
        "off"
          ? "off"
          : "on",
    }),
  };
}
