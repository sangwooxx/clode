import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchHoursBootstrapServer } from "@/features/hours/server";
import { buildWorkCardEmployeeOptions } from "@/features/work-cards/mappers";
import { WORK_CARDS_STORE_KEY, type WorkCardBootstrapData, type WorkCardStore } from "@/features/work-cards/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

async function fetchWorkCardsStoreServer() {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/stores/${WORK_CARDS_STORE_KEY}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ payload?: WorkCardStore; error?: string })
    | null;

  if (response.status === 404) {
    return {
      version: 1,
      cards: [],
    } satisfies WorkCardStore;
  }

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Work cards store returned status ${response.status}.`);
  }

  if (payload.payload && Array.isArray(payload.payload.cards)) {
    return payload.payload;
  }

  return {
    version: 1,
    cards: [],
  } satisfies WorkCardStore;
}

export async function fetchWorkCardsBootstrapServer(): Promise<WorkCardBootstrapData> {
  const [hoursBootstrap, store] = await Promise.all([
    fetchHoursBootstrapServer(),
    fetchWorkCardsStoreServer(),
  ]);

  const employeeOptions = buildWorkCardEmployeeOptions(hoursBootstrap.employees);

  return {
    contracts: hoursBootstrap.contracts,
    employees: hoursBootstrap.employees,
    historicalEmployees: hoursBootstrap.historicalEmployees,
    months: hoursBootstrap.payload.months,
    selectedMonthKey: hoursBootstrap.selectedMonthKey,
    selectedEmployeeKey:
      employeeOptions.find((option) => option.status !== "inactive")?.key ||
      employeeOptions[0]?.key ||
      "",
    store,
  };
}
