"use client";

import {
  createEmployee,
  deleteEmployee,
  listEmployees,
  updateEmployee,
} from "@/lib/api/employees";
import { http } from "@/lib/api/http";
import { fetchHoursData, saveHoursEntry } from "@/features/hours/api";
import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import { normalizeEmployeeText } from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  buildEmployeeRelations,
  matchesEmployeeReference,
  toEmployeeStoreRecord,
} from "@/features/employees/mappers";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeesBootstrapData,
} from "@/features/employees/types";
import { fetchWorkCardStore } from "@/features/work-cards/api";
import { type WorkCardRecord, type WorkCardStore } from "@/features/work-cards/types";

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

function buildCurrentDirectory(args: EmployeesBootstrapData) {
  return buildEmployeeDirectory({
    directoryEmployees: args.directoryEmployees,
    storeEmployees: args.storeEmployees,
    timeEntries: args.timeEntries,
    workCardStore: args.workCardStore,
  });
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
  bootstrap: EmployeesBootstrapData;
  employeeDirectory: EmployeeDirectoryRecord[];
}) {
  const target = args.employee ?? {
    ...args.nextEmployee,
    key: "",
    source: "store" as const,
    isPersisted: true,
  };

  const nextCards = args.bootstrap.workCardStore.cards.map((card) => {
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
    source: "store" as const,
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

export async function fetchEmployeesModuleData(): Promise<EmployeesBootstrapData> {
  const [directoryEmployees, hoursPayload, workCardStore] = await Promise.all([
    fetchEmployeesDirectory(),
    fetchHoursData(),
    fetchWorkCardStore().catch(() => emptyWorkCardStore()),
  ]);

  return {
    directoryEmployees,
    storeEmployees: [],
    timeEntries: hoursPayload.entries,
    workCardStore,
  };
}

export async function saveEmployeeRecord(args: {
  employee: EmployeeDirectoryRecord | null;
  values: EmployeeFormValues;
  bootstrap: EmployeesBootstrapData;
}) {
  const firstName = normalizeEmployeeText(args.values.first_name);
  const lastName = normalizeEmployeeText(args.values.last_name);

  if (!firstName || !lastName) {
    throw new Error("Podaj imię i nazwisko pracownika.");
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
      `Nie udało się zapisać rekordu pracownika: ${error instanceof Error ? error.message : "nieznany błąd"}`
    );
  }
  const canonicalEmployee = persistedEmployee.employee || employeePayload;

  const currentDirectory = buildCurrentDirectory(args.bootstrap);
  const nextWorkCardStore = buildUpdatedWorkCardStore({
    employee: args.employee,
    nextEmployee: canonicalEmployee,
    bootstrap: args.bootstrap,
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
        timeEntries: args.bootstrap.timeEntries,
        employeeDirectory: currentDirectory,
      });
    } catch (error) {
      throw new Error(
        `Nie udało się zsynchronizować ewidencji czasu pracy pracownika: ${error instanceof Error ? error.message : "nieznany błąd"}`
      );
    }
  }

  if (
    JSON.stringify(args.bootstrap.workCardStore.cards) !== JSON.stringify(nextWorkCardStore.cards)
  ) {
    try {
      await http("/work-cards/state", {
        method: "PUT",
        body: JSON.stringify({ store: nextWorkCardStore }),
      });
    } catch (error) {
      throw new Error(
        `Nie udało się zsynchronizować kart pracy pracownika: ${error instanceof Error ? error.message : "nieznany błąd"}`
      );
    }
  }

  let bootstrap;
  try {
    bootstrap = await fetchEmployeesModuleData();
  } catch (error) {
    throw new Error(
      `Nie udało się odświeżyć kartoteki po zapisie pracownika: ${error instanceof Error ? error.message : "nieznany błąd"}`
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
  const employeeDirectory = buildCurrentDirectory(args.bootstrap);
  const relations = buildEmployeeRelations({
    employee: args.employee,
    employees: employeeDirectory,
    timeEntries: args.bootstrap.timeEntries,
    workCardStore: args.bootstrap.workCardStore,
  });

  if (relations.hoursEntries > 0 || relations.workCards > 0) {
    throw new Error(
      "Pracownik ma powiązane wpisy czasu lub karty pracy. Zmień status na nieaktywny zamiast usuwać rekord."
    );
  }

  const employeeId = String(args.employee.id || "").trim();
  if (!employeeId) {
    throw new Error(
      "Nie można usunąć pracownika bez stabilnego identyfikatora. Uzupełnij rekord i spróbuj ponownie."
    );
  }

  await deleteEmployee(employeeId);

  return fetchEmployeesModuleData();
}
