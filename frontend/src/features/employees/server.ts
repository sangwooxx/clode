import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import type { HoursEmployeeRecord, HoursListResponse } from "@/features/hours/types";
import type { EmployeesBootstrapData } from "@/features/employees/types";
import type { WorkCardStore } from "@/features/work-cards/types";

async function fetchEmployeesDirectoryServer() {
  const { status, payload } = await fetchBackendJsonServer<{ employees?: HoursEmployeeRecord[] }>(
    "/employees",
    {
      nextPath: "/employees",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return [];
  }

  return Array.isArray(payload?.employees) ? payload.employees : [];
}

async function fetchHoursPayloadServer() {
  const { payload } = await fetchBackendJsonServer<HoursListResponse>("/time-entries", {
    nextPath: "/employees",
  });

  if (!payload) {
    throw new Error("Hours backend nie zwrocil poprawnego payloadu.");
  }

  return payload;
}

async function fetchWorkCardsStoreServer() {
  const { status, payload } = await fetchBackendJsonServer<{ store?: WorkCardStore }>(
    "/work-cards/state",
    {
      nextPath: "/employees",
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

export async function fetchEmployeesBootstrapServer(): Promise<EmployeesBootstrapData> {
  const [directoryEmployees, hoursPayload, workCardStore] = await Promise.all([
    fetchEmployeesDirectoryServer(),
    fetchHoursPayloadServer(),
    fetchWorkCardsStoreServer(),
  ]);

  return {
    directoryEmployees,
    storeEmployees: [],
    timeEntries: hoursPayload.entries,
    workCardStore,
  };
}
