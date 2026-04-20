import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchContractsServer } from "@/features/contracts/server";
import type {
  HoursBootstrapData,
  HoursEmployeeRecord,
  HoursListResponse,
} from "@/features/hours/types";

async function fetchHoursPayloadServer() {
  const { payload } = await fetchBackendJsonServer<HoursListResponse>("/time-entries", {
    nextPath: "/hours",
  });

  if (!payload) {
    throw new Error("Hours backend nie zwrocil poprawnego payloadu.");
  }

  return payload;
}

async function fetchEmployeesDirectoryServer() {
  const { status, payload } = await fetchBackendJsonServer<{ employees?: HoursEmployeeRecord[] }>(
    "/employees",
    {
      nextPath: "/hours",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return [];
  }

  return Array.isArray(payload?.employees) ? payload.employees : [];
}

export async function fetchHoursBootstrapServer(): Promise<HoursBootstrapData> {
  const [contracts, canonicalEmployees, payload] = await Promise.all([
    fetchContractsServer(true),
    fetchEmployeesDirectoryServer(),
    fetchHoursPayloadServer(),
  ]);

  const activeEmployees = canonicalEmployees.filter((employee) => employee.status !== "inactive");
  const selectedMonthKey =
    payload.months.find((month) => month.selected)?.month_key ||
    payload.months[0]?.month_key ||
    "";

  return {
    contracts,
    employees: activeEmployees,
    historicalEmployees: canonicalEmployees,
    payload,
    selectedMonthKey,
  };
}
