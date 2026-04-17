import { cookies } from "next/headers";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";
import { fetchContractsServer } from "@/features/contracts/server";
import type {
  HoursBootstrapData,
  HoursEmployeeRecord,
  HoursListResponse,
} from "@/features/hours/types";

function buildCookieHeader(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const cookiePairs = SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  }).filter(Boolean);

  return cookiePairs.join("; ");
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

  if (response.status === 404) {
    return [];
  }

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

  const payload = (await response.json().catch(() => null)) as
    | ({ payload?: HoursEmployeeRecord[]; error?: string })
    | null;

  if (response.status === 404) {
    return [];
  }

  if (!response.ok || !payload) {
    throw new Error(payload?.error || `Employees store returned status ${response.status}.`);
  }

  return Array.isArray(payload.payload) ? payload.payload : [];
}

export async function fetchHoursBootstrapServer(): Promise<HoursBootstrapData> {
  const [contracts, canonicalEmployees, payload] = await Promise.all([
    fetchContractsServer(true),
    fetchEmployeesDirectoryServer(),
    fetchHoursPayloadServer(),
  ]);

  const employees =
    canonicalEmployees.length > 0
      ? canonicalEmployees
      : await fetchEmployeesStoreServer();
  const activeEmployees = employees.filter((employee) => employee.status !== "inactive");

  const selectedMonthKey =
    payload.months.find((month) => month.selected)?.month_key ||
    payload.months[0]?.month_key ||
    "";

  return {
    contracts,
    employees: activeEmployees,
    historicalEmployees: employees,
    payload,
    selectedMonthKey,
  };
}
