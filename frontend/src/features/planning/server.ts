import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchContractsServer } from "@/features/contracts/server";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import type { PlanningBootstrapData } from "@/features/planning/types";
import {
  emptyPlanningStore,
  emptyVacationStore,
  normalizePlanningStore,
  normalizeVacationStore,
} from "@/features/vacations/mappers";
import {
  type PlanningStore,
  type VacationStore,
} from "@/features/vacations/types";

async function fetchPlanningStateServer() {
  const { status, payload } = await fetchBackendJsonServer<{ planning_store?: PlanningStore }>(
    "/planning/state",
    {
      nextPath: "/planning",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return emptyPlanningStore();
  }

  return normalizePlanningStore(payload?.planning_store);
}

async function fetchVacationStateServer() {
  const { status, payload } = await fetchBackendJsonServer<{ vacation_store?: VacationStore }>(
    "/vacations/state",
    {
      nextPath: "/planning",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return emptyVacationStore();
  }

  return normalizeVacationStore(payload?.vacation_store);
}

export async function fetchPlanningBootstrapServer(): Promise<PlanningBootstrapData> {
  const [employeesBootstrap, contracts, planningStore, vacationStore] = await Promise.all([
    fetchEmployeesBootstrapServer(),
    fetchContractsServer(true),
    fetchPlanningStateServer(),
    fetchVacationStateServer(),
  ]);

  return {
    ...employeesBootstrap,
    contracts,
    planningStore,
    vacationStore,
  };
}
