import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import type { HoursEmployeeRecord, HoursListResponse } from "@/features/hours/types";
import type { EmployeesBootstrapData } from "@/features/employees/types";
import type { WorkCardStore } from "@/features/work-cards/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
}

async function fetchEmployeesDirectoryServer() {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/employees`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | ({ employees?: HoursEmployeeRecord[]; error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Employees directory returned status ${response.status}.`);
  }

  return Array.isArray(payload.employees) ? payload.employees : [];
}

async function fetchEmployeesStoreServer() {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/stores/employees`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return [] as HoursEmployeeRecord[];
  }

  const payload = (await response.json().catch(() => null)) as
    | ({ payload?: HoursEmployeeRecord[]; error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Employees store returned status ${response.status}.`);
  }

  return Array.isArray(payload.payload) ? payload.payload : [];
}

async function fetchHoursPayloadServer() {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/time-entries`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as
    | (HoursListResponse & { error?: string })
    | null;

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Hours backend returned status ${response.status}.`);
  }

  return payload as HoursListResponse;
}

async function fetchWorkCardsStoreServer() {
  const cookieStore = await cookies();
  const cookieHeader = buildCookieHeader(cookieStore);

  const response = await fetch(`${resolveBackendOrigin()}/api/v1/stores/work_cards`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return {
      version: 1,
      cards: [],
    } satisfies WorkCardStore;
  }

  const payload = (await response.json().catch(() => null)) as
    | ({ payload?: WorkCardStore; error?: string })
    | null;

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

export async function fetchEmployeesBootstrapServer(): Promise<EmployeesBootstrapData> {
  const [directoryEmployees, storeEmployees, hoursPayload, workCardStore] =
    await Promise.all([
      fetchEmployeesDirectoryServer(),
      fetchEmployeesStoreServer(),
      fetchHoursPayloadServer(),
      fetchWorkCardsStoreServer(),
    ]);

  return {
    directoryEmployees,
    storeEmployees,
    timeEntries: hoursPayload.entries,
    workCardStore,
  };
}
