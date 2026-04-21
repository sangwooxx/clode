import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchContractsServer } from "@/features/contracts/server";
import type {
  HoursBootstrapData,
  HoursEmployeeRecord,
  HoursListResponse,
  HoursMonthRecord,
} from "@/features/hours/types";

type TimeEntriesBootstrapResponse = {
  months?: HoursMonthRecord[];
  selected_month_key?: string;
};

async function fetchHoursBootstrapPayloadServer() {
  const { payload } = await fetchBackendJsonServer<TimeEntriesBootstrapResponse>(
    "/time-entries/bootstrap",
    {
      nextPath: "/hours",
    }
  );

  const months = Array.isArray(payload?.months) ? payload.months : [];
  const selectedMonthKey =
    String(payload?.selected_month_key || "").trim() ||
    months.find((month) => month.selected)?.month_key ||
    months[0]?.month_key ||
    "";

  return {
    months,
    selectedMonthKey,
  };
}

async function fetchHoursPayloadServer(monthKey: string) {
  const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
  const { payload } = await fetchBackendJsonServer<HoursListResponse>(`/time-entries${query}`, {
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
      allowStatuses: [403, 404],
    }
  );

  if (status === 403 || status === 404) {
    return [];
  }

  return Array.isArray(payload?.employees) ? payload.employees : [];
}

export async function fetchHoursBootstrapServer(): Promise<HoursBootstrapData> {
  const [contracts, canonicalEmployees, bootstrapPayload] = await Promise.all([
    fetchContractsServer(true),
    fetchEmployeesDirectoryServer(),
    fetchHoursBootstrapPayloadServer(),
  ]);
  const payload = await fetchHoursPayloadServer(bootstrapPayload.selectedMonthKey);
  const activeEmployees = canonicalEmployees.filter((employee) => employee.status !== "inactive");

  return {
    contracts,
    employees: activeEmployees,
    historicalEmployees: canonicalEmployees,
    payload,
    selectedMonthKey: bootstrapPayload.selectedMonthKey,
  };
}
