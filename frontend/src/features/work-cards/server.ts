import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchHoursBootstrapServer } from "@/features/hours/server";
import { buildWorkCardEmployeeOptions } from "@/features/work-cards/mappers";
import type { WorkCardBootstrapData, WorkCardStore } from "@/features/work-cards/types";

async function fetchWorkCardsStoreServer() {
  const { status, payload } = await fetchBackendJsonServer<{ store?: WorkCardStore }>(
    "/work-cards/state",
    {
      nextPath: "/work-cards",
      allowStatuses: [404],
    }
  );

  if (status === 404 || !payload?.store || !Array.isArray(payload.store.cards)) {
    return {
      version: 1,
      cards: [],
    } satisfies WorkCardStore;
  }

  return payload.store;
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
