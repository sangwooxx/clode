"use client";

import { ApiError, http } from "@/lib/api/http";
import { fetchEmployeesModuleData } from "@/features/employees/api";
import { findEmployeeByKey } from "@/features/employees/mappers";
import { createDefaultWorkflowValues } from "@/features/settings/types";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import {
  normalizeVacationStatus,
  normalizeVacationText,
  normalizeVacationType,
} from "@/features/vacations/formatters";
import {
  buildVacationBalanceStorageKey,
  canApproveVacationWorkflow,
  buildVacationDirectory,
  buildVacationStatsForEmployee,
  calculateVacationDays,
  emptyPlanningStore,
  emptyVacationStore,
  findVacationConflicts,
  findVacationRequestById,
  getApprovedVacationDaysExcluding,
  getPlanningConflictsForRange,
  isVacationPoolType,
  findVacationBalanceRecord,
  normalizePlanningStore,
  normalizeVacationStore,
  matchesVacationEmployeeReference,
} from "@/features/vacations/mappers";
import type {
  PlanningStore,
  VacationBalanceFormValues,
  VacationRequestFormValues,
  VacationRequestRecord,
  VacationStore,
  VacationsBootstrapData,
} from "@/features/vacations/types";

function generateVacationRequestId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `vac-next-${randomPart}`;
}

function parseFormNumber(value: string, fieldLabel: string) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldLabel} musi byc poprawna liczba.`);
  }

  return parsed;
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

async function fetchPlanningStore() {
  try {
    const response = await http<{ planning_store?: PlanningStore }>("/planning/state", {
      method: "GET",
    });
    return normalizePlanningStore(response.planning_store);
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 404 || error.status === 403 || error.status === 401)
    ) {
      return emptyPlanningStore();
    }
    throw error;
  }
}

async function fetchWorkflowSettings() {
  try {
    const response = await http<{ workflow?: Record<string, unknown> }>("/settings/workflow", {
      method: "GET",
    });
    return createDefaultWorkflowValues(response.workflow);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return createDefaultWorkflowValues();
    }
    throw error;
  }
}

export async function fetchVacationsModuleData(): Promise<VacationsBootstrapData> {
  const [employeesBootstrap, vacationStore, planningStore, workflow] = await Promise.all([
    fetchEmployeesModuleData(),
    fetchVacationStore(),
    fetchPlanningStore(),
    fetchWorkflowSettings(),
  ]);

  return {
    ...employeesBootstrap,
    vacationStore,
    planningStore,
    workflow,
  };
}

function resolveEditableEmployee(args: {
  employeeKey: string;
  bootstrap: VacationsBootstrapData;
  existingRequest?: VacationRequestRecord | null;
}) {
  const employees = buildVacationDirectory(args.bootstrap);
  const employee = findEmployeeByKey(employees, args.employeeKey);

  if (!employee) {
    throw new Error("Wybierz pracownika z kartoteki.");
  }

  const editingSameInactiveEmployee =
    employee.status === "inactive" &&
    args.existingRequest &&
    matchesVacationEmployeeReference(
      {
        employee_id: args.existingRequest.employee_id,
        employee_key: args.existingRequest.employee_key,
        employee_name: args.existingRequest.employee_name,
      },
      employee,
      employees
    );

  if (employee.status === "inactive" && !editingSameInactiveEmployee) {
    throw new Error("Nie mozna dodac nowej nieobecnosci dla nieaktywnego pracownika.");
  }

  return { employee, employees };
}

function saveVacationStoreRemote(store: VacationStore) {
  return http<{ vacation_store?: VacationStore }>("/vacations/state", {
    method: "PUT",
    body: JSON.stringify({ vacation_store: store }),
  });
}

export async function saveVacationBalanceRecord(args: {
  employee: EmployeeDirectoryRecord;
  values: VacationBalanceFormValues;
  bootstrap: VacationsBootstrapData;
}) {
  if (args.employee.status === "inactive") {
    throw new Error("Pula urlopowa nie moze byc zmieniana dla nieaktywnego pracownika.");
  }

  const store = normalizeVacationStore(args.bootstrap.vacationStore);
  const employees = buildVacationDirectory(args.bootstrap);
  const existingEntry = findVacationBalanceRecord(store, args.employee, employees);
  const balanceKey = buildVacationBalanceStorageKey(args.employee);

  if (
    existingEntry.status === "resolved" &&
    existingEntry.key &&
    existingEntry.key !== balanceKey
  ) {
    delete store.balances[existingEntry.key];
  }

  store.balances[balanceKey] = {
    employee_id: args.employee.id,
    employee_key: args.employee.key,
    employee_name: args.employee.name,
    base_days: parseFormNumber(args.values.base_days, "Limit roczny"),
    carryover_days: parseFormNumber(args.values.carryover_days, "Urlop zalegly"),
    extra_days: parseFormNumber(args.values.extra_days, "Dodatkowa pula"),
  };

  await saveVacationStoreRemote(store);
  return fetchVacationsModuleData();
}

export async function saveVacationRequestRecord(args: {
  requestId?: string | null;
  values: VacationRequestFormValues;
  bootstrap: VacationsBootstrapData;
  currentUserDisplayName?: string | null;
  currentUserRole?: string | null;
  currentUserCanApproveVacations?: boolean | null;
}) {
  const store = normalizeVacationStore(args.bootstrap.vacationStore);
  const existingRequest = findVacationRequestById(store, args.requestId || null);
  const { employee, employees } = resolveEditableEmployee({
    employeeKey: args.values.employee_key,
    bootstrap: args.bootstrap,
    existingRequest,
  });

  const startDate = normalizeVacationText(args.values.start_date);
  const endDate = normalizeVacationText(args.values.end_date || args.values.start_date);
  const rawDaysValue = String(args.values.days || "").trim();
  const explicitDays =
    rawDaysValue.length > 0 ? parseFormNumber(rawDaysValue, "Liczba dni") : null;
  const days =
    explicitDays && explicitDays > 0 ? explicitDays : calculateVacationDays(startDate, endDate);
  const type = normalizeVacationType(args.values.type);
  const requestedBy =
    normalizeVacationText(args.values.requested_by) ||
    normalizeVacationText(existingRequest?.requested_by) ||
    normalizeVacationText(args.currentUserDisplayName) ||
    "Uzytkownik";
  const canApprove = canApproveVacationWorkflow({
    role: args.currentUserRole,
    canApproveVacations: args.currentUserCanApproveVacations,
    approvalMode: args.bootstrap.workflow.vacationApprovalMode,
  });
  const nextStatus = canApprove
    ? normalizeVacationStatus(args.values.status)
    : normalizeVacationStatus(existingRequest?.status);

  if (!startDate) {
    throw new Error("Podaj date rozpoczecia nieobecnosci.");
  }

  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    throw new Error("Data koncowa nie moze byc wczesniejsza niz data poczatkowa.");
  }

  if (days <= 0) {
    throw new Error("Liczba dni musi byc wieksza od zera.");
  }

  const conflicts = findVacationConflicts({
    employee,
    employees,
    store,
    startDate,
    endDate,
    excludeRequestId: existingRequest?.id,
  });

  if (conflicts.length > 0) {
    const conflictLabel = conflicts
      .slice(0, 3)
      .map(
        (request) =>
          `${request.start_date} - ${request.end_date} (${normalizeVacationStatus(
            request.status
          )})`
      )
      .join(", ");
    throw new Error(`Zakres koliduje z innym wpisem pracownika: ${conflictLabel}.`);
  }

  if (isVacationPoolType(type)) {
    const stats = buildVacationStatsForEmployee({
      employee,
      employees,
      store,
    });

    if (days > stats.total_pool) {
      throw new Error("Wniosek przekracza laczna pule urlopowa pracownika.");
    }
  }

  if (nextStatus === "approved") {
    if (!canApprove) {
      throw new Error("To konto nie ma uprawnien do zatwierdzania urlopow.");
    }

    if (isVacationPoolType(type)) {
      const stats = buildVacationStatsForEmployee({
        employee,
        employees,
        store,
      });
      const approvedDays = getApprovedVacationDaysExcluding({
        employee,
        employees,
        store,
        excludeRequestId: existingRequest?.id,
      });

      if (approvedDays + days > stats.total_pool) {
        throw new Error(
          "Nie mozna zatwierdzic wniosku, bo przekroczy dostepna pule urlopowa."
        );
      }
    }

    const planningConflicts = getPlanningConflictsForRange({
      employee,
      employees,
      planningStore: normalizePlanningStore(args.bootstrap.planningStore),
      startDate,
      endDate,
    });

    if (planningConflicts.length > 0) {
      const hasAmbiguousConflicts = planningConflicts.some((item) => item.kind === "ambiguous");
      if (hasAmbiguousConflicts) {
        throw new Error(
          "Planowanie dla pracownika o zduplikowanej nazwie jest niejednoznaczne. Uzupelnij identyfikator pracownika w planowaniu albo usun konflikt przed zatwierdzeniem."
        );
      }

      const planningLabel = planningConflicts
        .slice(0, 3)
        .map((item) => `${item.date} (${item.contract_name})`)
        .join(", ");
      throw new Error(
        `Usun najpierw przypisania z planowania dla tego pracownika: ${planningLabel}.`
      );
    }
  }

  const payload: VacationRequestRecord = {
    id: existingRequest?.id || generateVacationRequestId(),
    employee_id: employee.id,
    employee_key: employee.key,
    employee_name: employee.name,
    type,
    start_date: startDate,
    end_date: endDate,
    days,
    status: nextStatus,
    requested_by: requestedBy,
    notes: normalizeVacationText(args.values.notes),
    created_at: existingRequest?.created_at || new Date().toISOString(),
  };

  const nextRequests = existingRequest
    ? store.requests.map((request) => (request.id === existingRequest.id ? payload : request))
    : [...store.requests, payload];

  store.requests = nextRequests;
  await saveVacationStoreRemote(store);
  return fetchVacationsModuleData();
}

export async function updateVacationRequestStatus(args: {
  requestId: string;
  status: "approved" | "rejected";
  bootstrap: VacationsBootstrapData;
  currentUserDisplayName?: string | null;
  currentUserRole?: string | null;
  currentUserCanApproveVacations?: boolean | null;
}) {
  const canApprove = canApproveVacationWorkflow({
    role: args.currentUserRole,
    canApproveVacations: args.currentUserCanApproveVacations,
    approvalMode: args.bootstrap.workflow.vacationApprovalMode,
  });

  if (!canApprove) {
    throw new Error("To konto nie ma uprawnien do zatwierdzania urlopow.");
  }

  const store = normalizeVacationStore(args.bootstrap.vacationStore);
  const request = findVacationRequestById(store, args.requestId);
  if (!request) {
    throw new Error("Nie udalo sie odnalezc wskazanego wniosku.");
  }

  const employees = buildVacationDirectory(args.bootstrap);
  const employee = employees.find((candidate) =>
    matchesVacationEmployeeReference(
      {
        employee_id: request.employee_id,
        employee_key: request.employee_key,
        employee_name: request.employee_name,
      },
      candidate,
      employees
    )
  );

  return saveVacationRequestRecord({
    requestId: request.id,
    values: {
      employee_key: employee?.key || "",
      type: normalizeVacationType(request.type),
      start_date: request.start_date,
      end_date: request.end_date,
      days: String(request.days),
      status: args.status,
      requested_by: request.requested_by || args.currentUserDisplayName || "",
      notes: request.notes || "",
    },
    bootstrap: args.bootstrap,
    currentUserDisplayName: args.currentUserDisplayName,
    currentUserRole: args.currentUserRole,
    currentUserCanApproveVacations: args.currentUserCanApproveVacations,
  });
}

export async function deleteVacationRequestRecord(args: {
  requestId: string;
  bootstrap: VacationsBootstrapData;
}) {
  const store = normalizeVacationStore(args.bootstrap.vacationStore);
  const nextRequests = store.requests.filter((request) => request.id !== args.requestId);
  store.requests = nextRequests;
  await saveVacationStoreRemote(store);
  return fetchVacationsModuleData();
}
