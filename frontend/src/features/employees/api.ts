"use client";

import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  listEmployeesSummary,
  updateEmployee,
} from "@/lib/api/employees";
import { http } from "@/lib/api/http";
import { fetchHoursData, saveHoursEntry } from "@/features/hours/api";
import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import { normalizeEmployeeText } from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  matchesEmployeeReference,
  toEmployeeStoreRecord,
} from "@/features/employees/mappers";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeesBootstrapData,
} from "@/features/employees/types";
import { fetchWorkCardStore } from "@/features/work-cards/api";
import type { WorkCardRecord, WorkCardStore } from "@/features/work-cards/types";

function emptyWorkCardStore(): WorkCardStore {
  return {
    version: 1,
    cards: [],
  };
}

async function fetchEmployeesDirectory() {
  const response = await listEmployees();
  return Array.isArray(response.employees) ? response.employees : [];
}

async function fetchEmployeesSummaryData(): Promise<EmployeesBootstrapData> {
  const response = await listEmployeesSummary();
  return {
    directoryEmployees: Array.isArray(response.employees) ? response.employees : [],
    operationalEmployees: Array.isArray(response.operational_employees)
      ? response.operational_employees
      : [],
    relationSummaries: Array.isArray(response.relation_summaries)
      ? response.relation_summaries
      : [],
  };
}

function buildCurrentDirectory(args: EmployeesBootstrapData) {
  return buildEmployeeDirectory({
    directoryEmployees: args.directoryEmployees,
    operationalEmployees: args.operationalEmployees,
  });
}

function buildOperationalEmployeesFromHistory(args: {
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
}) {
  return [
    ...args.timeEntries.map((entry) => ({
      id: String(entry.employee_id || "").trim() || undefined,
      name: String(entry.employee_name || "").trim(),
      status: "active" as const,
    })),
    ...args.workCardStore.cards.map((card) => ({
      id: String(card.employee_id || "").trim() || undefined,
      name: String(card.employee_name || "").trim(),
      status: "active" as const,
    })),
  ];
}

function generateEmployeeId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `emp-next-${randomPart}`;
}

function updateWorkCardRecord(card: WorkCardRecord, nextEmployee: HoursEmployeeRecord) {
  return {
    ...card,
    employee_id: String(nextEmployee.id || "").trim(),
    employee_name: String(nextEmployee.name || "").trim(),
  };
}

function buildUpdatedWorkCardStore(args: {
  employee: EmployeeDirectoryRecord | null;
  nextEmployee: HoursEmployeeRecord;
  workCardStore: WorkCardStore;
  employeeDirectory: EmployeeDirectoryRecord[];
}) {
  const target = args.employee ?? {
    ...args.nextEmployee,
    key: "",
    source: "operational" as const,
    isPersisted: true,
  };

  const nextCards = args.workCardStore.cards.map((card) => {
    if (
      !matchesEmployeeReference(
        {
          employee_id: card.employee_id,
          employee_name: card.employee_name,
        },
        target,
        args.employeeDirectory
      )
    ) {
      return card;
    }

    return updateWorkCardRecord(card, args.nextEmployee);
  });

  return {
    version: 1,
    cards: nextCards,
  } satisfies WorkCardStore;
}

async function syncEmployeeTimeEntries(args: {
  employee: EmployeeDirectoryRecord | null;
  nextEmployee: HoursEmployeeRecord;
  timeEntries: TimeEntryRecord[];
  employeeDirectory: EmployeeDirectoryRecord[];
}) {
  const target = args.employee ?? {
    ...args.nextEmployee,
    key: "",
    source: "operational" as const,
    isPersisted: true,
  };

  const matchingEntries = args.timeEntries.filter((entry) =>
    matchesEmployeeReference(
      {
        employee_id: entry.employee_id,
        employee_name: entry.employee_name,
      },
      target,
      args.employeeDirectory
    )
  );

  for (const entry of matchingEntries) {
    await saveHoursEntry(entry.id, {
      month_key: entry.month_key,
      employee_id: String(args.nextEmployee.id || "").trim(),
      employee_name: String(args.nextEmployee.name || "").trim(),
      contract_id: entry.contract_id || "",
      contract_name: entry.contract_name || "Nieprzypisane",
      hours: Number(entry.hours || 0),
    });
  }
}

async function fetchEmployeesFullBootstrap(): Promise<{
  directoryEmployees: HoursEmployeeRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
}> {
  const [directoryEmployees, hoursPayload, workCardStore] = await Promise.all([
    fetchEmployeesDirectory(),
    fetchHoursData(),
    fetchWorkCardStore().catch(() => emptyWorkCardStore()),
  ]);

  return {
    directoryEmployees,
    timeEntries: hoursPayload.entries,
    workCardStore,
  };
}

export async function fetchEmployeesModuleData(): Promise<EmployeesBootstrapData> {
  return fetchEmployeesSummaryData();
}

export async function saveEmployeeRecord(args: {
  employee: EmployeeDirectoryRecord | null;
  values: EmployeeFormValues;
  bootstrap: EmployeesBootstrapData;
}) {
  const firstName = normalizeEmployeeText(args.values.first_name);
  const lastName = normalizeEmployeeText(args.values.last_name);

  if (!firstName || !lastName) {
    throw new Error("Podaj imie i nazwisko pracownika.");
  }

  const employeeId = String(args.employee?.id || "").trim() || generateEmployeeId();
  const employeePayload = toEmployeeStoreRecord({
    employeeId,
    values: args.values,
  });

  let persistedEmployee;
  try {
    persistedEmployee = args.employee
      ? await updateEmployee(employeeId, employeePayload)
      : await createEmployee(employeePayload);
  } catch (error) {
    throw new Error(
      `Nie udalo sie zapisac rekordu pracownika: ${error instanceof Error ? error.message : "nieznany blad"}`
    );
  }

  const canonicalEmployee = persistedEmployee.employee || employeePayload;
  const fullBootstrap = await fetchEmployeesFullBootstrap();
  const currentDirectory = buildEmployeeDirectory({
    directoryEmployees: fullBootstrap.directoryEmployees,
    operationalEmployees: buildOperationalEmployeesFromHistory({
      timeEntries: fullBootstrap.timeEntries,
      workCardStore: fullBootstrap.workCardStore,
    }),
  });
  const nextWorkCardStore = buildUpdatedWorkCardStore({
    employee: args.employee,
    nextEmployee: canonicalEmployee,
    workCardStore: fullBootstrap.workCardStore,
    employeeDirectory: currentDirectory,
  });

  const shouldSyncNames =
    !args.employee ||
    String(args.employee.id || "").trim() !== String(canonicalEmployee.id || "").trim() ||
    normalizeEmployeeText(args.employee.name) !== normalizeEmployeeText(canonicalEmployee.name);

  if (shouldSyncNames) {
    try {
      await syncEmployeeTimeEntries({
        employee: args.employee,
        nextEmployee: canonicalEmployee,
        timeEntries: fullBootstrap.timeEntries,
        employeeDirectory: currentDirectory,
      });
    } catch (error) {
      throw new Error(
        `Nie udalo sie zsynchronizowac ewidencji czasu pracy pracownika: ${error instanceof Error ? error.message : "nieznany blad"}`
      );
    }
  }

  if (
    JSON.stringify(fullBootstrap.workCardStore.cards) !== JSON.stringify(nextWorkCardStore.cards)
  ) {
    try {
      await http("/work-cards/state", {
        method: "PUT",
        body: JSON.stringify({ store: nextWorkCardStore }),
      });
    } catch (error) {
      throw new Error(
        `Nie udalo sie zsynchronizowac kart pracy pracownika: ${error instanceof Error ? error.message : "nieznany blad"}`
      );
    }
  }

  let bootstrap;
  try {
    bootstrap = await fetchEmployeesModuleData();
  } catch (error) {
    throw new Error(
      `Nie udalo sie odswiezyc kartoteki po zapisie pracownika: ${error instanceof Error ? error.message : "nieznany blad"}`
    );
  }

  const employeeDirectory = buildCurrentDirectory(bootstrap);
  const selectedEmployee =
    employeeDirectory.find(
      (employee) =>
        String(employee.id || "").trim() === String(canonicalEmployee.id || "").trim()
    ) ??
    employeeDirectory.find(
      (employee) =>
        normalizeEmployeeText(employee.name) === normalizeEmployeeText(canonicalEmployee.name)
    ) ??
    null;

  return {
    bootstrap,
    selectedEmployeeKey: selectedEmployee?.key ?? null,
  };
}

export async function deleteEmployeeRecord(args: {
  employee: EmployeeDirectoryRecord;
  bootstrap: EmployeesBootstrapData;
}) {
  const employeeId = String(args.employee.id || "").trim();
  if (!employeeId) {
    throw new Error(
      "Nie mozna usunac pracownika bez stabilnego identyfikatora. Uzupelnij rekord i sprobuj ponownie."
    );
  }

  try {
    await deleteEmployee(employeeId);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Nie udalo sie usunac pracownika."
    );
  }

  return fetchEmployeesModuleData();
}
