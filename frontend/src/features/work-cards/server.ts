import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchContractsServer } from "@/features/contracts/server";
import {
  buildWorkCardEmployeeOptions,
  mergeWorkCardEmployeeDirectory,
} from "@/features/work-cards/mappers";
import type {
  WorkCardBootstrapData,
  WorkCardHistorySummary,
  WorkCardRecord,
} from "@/features/work-cards/types";
import type { HoursEmployeeRecord, HoursMonthRecord } from "@/features/hours/types";

type TimeEntriesBootstrapResponse = {
  months?: HoursMonthRecord[];
  selected_month_key?: string;
};

async function fetchEmployeesDirectoryServer() {
  const { status, payload } = await fetchBackendJsonServer<{ employees?: HoursEmployeeRecord[] }>(
    "/employees",
    {
      nextPath: "/work-cards",
      allowStatuses: [403, 404],
    }
  );

  if (status === 403 || status === 404) {
    return [];
  }

  return Array.isArray(payload?.employees) ? payload.employees : [];
}

async function fetchWorkCardHistoryServer() {
  const { status, payload } = await fetchBackendJsonServer<{ cards?: WorkCardHistorySummary[] }>(
    "/work-cards/history",
    {
      nextPath: "/work-cards",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return [];
  }

  return Array.isArray(payload?.cards) ? payload.cards : [];
}

async function fetchWorkCardBootstrapPayloadServer() {
  const { payload } = await fetchBackendJsonServer<TimeEntriesBootstrapResponse>(
    "/time-entries/bootstrap",
    {
      nextPath: "/work-cards",
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

async function fetchInitialCardServer(args: {
  monthKey: string;
  employee: Pick<HoursEmployeeRecord, "id" | "name"> | null;
}) {
  if (!args.employee || !args.monthKey) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("month", args.monthKey);

  const employeeId = String(args.employee.id || "").trim();
  const employeeName = String(args.employee.name || "").trim();

  if (employeeId) {
    params.set("employee_id", employeeId);
  }
  if (employeeName) {
    params.set("employee_name", employeeName);
  }

  const { payload } = await fetchBackendJsonServer<{ card?: WorkCardRecord | null }>(
    `/work-cards/card?${params.toString()}`,
    {
      nextPath: "/work-cards",
    }
  );

  return payload?.card ?? null;
}

export async function fetchWorkCardBootstrapServer(): Promise<{
  bootstrap: WorkCardBootstrapData;
  initialCard: WorkCardRecord | null;
}> {
  const [contracts, employeeDirectory, bootstrapPayload, historicalCards] = await Promise.all([
    fetchContractsServer(true),
    fetchEmployeesDirectoryServer(),
    fetchWorkCardBootstrapPayloadServer(),
    fetchWorkCardHistoryServer(),
  ]);
  const mergedEmployeeDirectory = mergeWorkCardEmployeeDirectory({
    employeeDirectory,
    historicalCards,
  });
  const employees = mergedEmployeeDirectory.filter((employee) => employee.status !== "inactive");
  const employeeOptions = buildWorkCardEmployeeOptions(employees);
  const selectedEmployeeKey =
    employeeOptions.find((option) => option.status !== "inactive")?.key ||
    employeeOptions[0]?.key ||
    "";
  const selectedEmployee =
    employeeOptions.find((option) => option.key === selectedEmployeeKey)?.employee ?? null;

  return {
    bootstrap: {
      contracts,
      employees,
      historicalEmployees: mergedEmployeeDirectory,
      months: bootstrapPayload.months,
      selectedMonthKey: bootstrapPayload.selectedMonthKey,
      selectedEmployeeKey,
      historicalCards,
    },
    initialCard: await fetchInitialCardServer({
      monthKey: bootstrapPayload.selectedMonthKey,
      employee: selectedEmployee,
    }),
  };
}
