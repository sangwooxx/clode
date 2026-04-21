import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import {
  createDefaultWorkflowValues,
  type SettingsWorkflowValues,
} from "@/features/settings/types";
import {
  emptyPlanningStore,
  emptyVacationStore,
  normalizePlanningStore,
  normalizeVacationStore,
} from "@/features/vacations/mappers";
import type { PlanningStore, VacationStore, VacationsBootstrapData } from "@/features/vacations/types";

async function fetchVacationStateServer() {
  const { status, payload } = await fetchBackendJsonServer<{ vacation_store?: VacationStore }>(
    "/vacations/state",
    {
      nextPath: "/vacations",
      allowStatuses: [404],
    }
  );

  if (status === 404) {
    return emptyVacationStore();
  }

  return normalizeVacationStore(payload?.vacation_store);
}

async function fetchPlanningStateServer() {
  const { status, payload } = await fetchBackendJsonServer<{ planning_store?: PlanningStore }>(
    "/planning/state",
    {
      nextPath: "/vacations",
      allowStatuses: [403, 404],
    }
  );

  if (status === 403 || status === 404) {
    return emptyPlanningStore();
  }

  return normalizePlanningStore(payload?.planning_store);
}

async function fetchSettingsWorkflowServer() {
  const { status, payload } = await fetchBackendJsonServer<{
    workflow?: Partial<SettingsWorkflowValues>;
  }>(
    "/settings/workflow",
    {
      nextPath: "/vacations",
      allowStatuses: [403, 404],
    }
  );

  if (status === 403 || status === 404) {
    return createDefaultWorkflowValues();
  }

  const workflow = payload?.workflow;
  return createDefaultWorkflowValues({
    vacationApprovalMode: workflow?.vacationApprovalMode === "admin" ? "admin" : "permission",
    vacationNotifications: workflow?.vacationNotifications === "off" ? "off" : "on",
  });
}

export async function fetchVacationsBootstrapServer(): Promise<VacationsBootstrapData> {
  const [employeesBootstrap, vacationStore, planningStore, workflow] = await Promise.all([
    fetchEmployeesBootstrapServer(),
    fetchVacationStateServer(),
    fetchPlanningStateServer(),
    fetchSettingsWorkflowServer(),
  ]);

  return {
    ...employeesBootstrap,
    vacationStore,
    planningStore,
    workflow,
  };
}
