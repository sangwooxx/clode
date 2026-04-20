"use client";

import { listContracts } from "@/lib/api/contracts";
import { ApiError, http } from "@/lib/api/http";
import { fetchEmployeesModuleData } from "@/features/employees/api";
import {
  buildPlanningDirectory,
  getPlanningAbsenceForDate,
  removePlanningAssignmentsForEmployee,
  upsertPlanningAssignmentForEmployee,
} from "@/features/planning/mappers";
import type { PlanningBootstrapData } from "@/features/planning/types";
import {
  type PlanningStore,
  type VacationStore,
} from "@/features/vacations/types";
import {
  emptyPlanningStore,
  emptyVacationStore,
  normalizePlanningStore,
  normalizeVacationStore,
} from "@/features/vacations/mappers";

async function fetchPlanningStore() {
  try {
    const response = await http<{ planning_store?: PlanningStore }>("/planning/state", {
      method: "GET",
    });
    return normalizePlanningStore(response.planning_store);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return emptyPlanningStore();
    }
    throw error;
  }
}

async function fetchVacationStore() {
  try {
    const response = await http<{ vacation_store?: VacationStore }>("/vacations/state", {
      method: "GET",
    });
    return normalizeVacationStore(response.vacation_store);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return emptyVacationStore();
    }
    throw error;
  }
}

async function fetchPlanningContracts() {
  const response = (await listContracts(true)) as { contracts?: PlanningBootstrapData["contracts"] };
  return Array.isArray(response.contracts) ? response.contracts : [];
}

async function savePlanningStoreRemote(store: PlanningStore) {
  return http<{ planning_store?: PlanningStore }>("/planning/state", {
    method: "PUT",
    body: JSON.stringify({ planning_store: store }),
  });
}

export async function fetchPlanningModuleData(): Promise<PlanningBootstrapData> {
  const [employeesBootstrap, contracts, planningStore, vacationStore] = await Promise.all([
    fetchEmployeesModuleData(),
    fetchPlanningContracts(),
    fetchPlanningStore(),
    fetchVacationStore(),
  ]);

  return {
    ...employeesBootstrap,
    contracts,
    planningStore,
    vacationStore,
  };
}

export async function savePlanningAssignmentRecord(args: {
  dateKey: string;
  employeeKey: string;
  contractId: string;
  note: string;
  bootstrap: PlanningBootstrapData;
}) {
  const employees = buildPlanningDirectory(args.bootstrap);
  const employee = employees.find((item) => item.key === args.employeeKey) ?? null;
  if (!employee) {
    throw new Error("Nie udalo sie odnalezc pracownika w kartotece.");
  }

  if (employee.status === "inactive") {
    throw new Error("Nie mozna planowac nowego dnia dla nieaktywnego pracownika.");
  }

  const absence = getPlanningAbsenceForDate({
    dateKey: args.dateKey,
    employee,
    employees,
    vacationStore: normalizeVacationStore(args.bootstrap.vacationStore),
  });

  if (absence) {
    throw new Error(`Pracownik ma na ten dzien nieobecnosc: ${absence.label}.`);
  }

  const contracts = args.bootstrap.contracts || [];
  const contract = args.contractId
    ? contracts.find(
        (item) => item.id === args.contractId && item.status !== "archived"
      ) ?? null
    : null;
  const normalizedNote = String(args.note || "").trim();

  if (args.contractId && !contract) {
    throw new Error("Wybierz aktywny kontrakt z rejestru.");
  }

  if (!contract && !normalizedNote) {
    return clearPlanningAssignmentRecord({
      dateKey: args.dateKey,
      employeeKey: args.employeeKey,
      bootstrap: args.bootstrap,
    });
  }

  const nextStore = upsertPlanningAssignmentForEmployee({
    dateKey: args.dateKey,
    employee,
    employees,
    store: normalizePlanningStore(args.bootstrap.planningStore),
    contract,
    note: normalizedNote,
  });

  await savePlanningStoreRemote(nextStore);
  return fetchPlanningModuleData();
}

export async function clearPlanningAssignmentRecord(args: {
  dateKey: string;
  employeeKey: string;
  bootstrap: PlanningBootstrapData;
}) {
  const employees = buildPlanningDirectory(args.bootstrap);
  const employee = employees.find((item) => item.key === args.employeeKey) ?? null;
  if (!employee) {
    throw new Error("Nie udalo sie odnalezc pracownika w kartotece.");
  }

  const nextStore = removePlanningAssignmentsForEmployee({
    dateKey: args.dateKey,
    employee,
    employees,
    store: normalizePlanningStore(args.bootstrap.planningStore),
  });

  await savePlanningStoreRemote(nextStore);
  return fetchPlanningModuleData();
}

export async function copyPlanningFromPreviousDay(args: {
  targetDateKey: string;
  bootstrap: PlanningBootstrapData;
}) {
  const sourceDate = new Date(`${args.targetDateKey}T00:00:00`);
  if (Number.isNaN(sourceDate.getTime())) {
    throw new Error("Nie udalo sie wyznaczyc dnia do skopiowania.");
  }

  sourceDate.setDate(sourceDate.getDate() - 1);
  const previousDateKey = `${sourceDate.getFullYear()}-${String(
    sourceDate.getMonth() + 1
  ).padStart(2, "0")}-${String(sourceDate.getDate()).padStart(2, "0")}`;

  const employees = buildPlanningDirectory(args.bootstrap);
  const planningStore = normalizePlanningStore(args.bootstrap.planningStore);
  const vacationStore = normalizeVacationStore(args.bootstrap.vacationStore);
  const contracts = args.bootstrap.contracts || [];
  const previousAssignments = planningStore.assignments?.[previousDateKey] || {};

  let nextStore = {
    ...planningStore,
    assignments: {
      ...planningStore.assignments,
      [args.targetDateKey]: {},
    },
  } satisfies PlanningStore;

  Object.values(previousAssignments).forEach((assignment) => {
    const matchedEmployee =
      employees.find((employee) =>
        (assignment.employee_key && assignment.employee_key === employee.key) ||
        (assignment.employee_id && assignment.employee_id === employee.id) ||
        (!assignment.employee_key &&
          !assignment.employee_id &&
          assignment.employee_name &&
          assignment.employee_name === employee.name)
      ) ?? null;

    if (!matchedEmployee || matchedEmployee.status === "inactive") {
      return;
    }

    const absence = getPlanningAbsenceForDate({
      dateKey: args.targetDateKey,
      employee: matchedEmployee,
      employees,
      vacationStore,
    });
    if (absence) {
      return;
    }

    const contractId = String(assignment.contract_id || "").trim();
    const contractName = String(assignment.contract_name || "").trim();
    const activeContract =
      contracts.find((contract) => {
        if (contract.status === "archived") return false;
        if (contractId && contract.id === contractId) return true;
        return Boolean(contractName) && contract.name === contractName;
      }) ?? null;

    nextStore = upsertPlanningAssignmentForEmployee({
      dateKey: args.targetDateKey,
      employee: matchedEmployee,
      employees,
      store: nextStore,
      contract: activeContract,
      note: String(assignment.note || "").trim(),
    });
  });

  await savePlanningStoreRemote(nextStore);
  return fetchPlanningModuleData();
}
