"use client";

import {
  createEmployee,
  deleteEmployee,
  listEmployeesSummary,
  updateEmployee,
} from "@/lib/api/employees";
import { normalizeEmployeeText } from "@/features/employees/formatters";
import { buildEmployeeDirectory, toEmployeeStoreRecord } from "@/features/employees/mappers";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeesBootstrapData,
} from "@/features/employees/types";

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

function generateEmployeeId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `emp-next-${randomPart}`;
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

  let bootstrap;
  try {
    bootstrap = await fetchEmployeesModuleData();
  } catch (error) {
    throw new Error(
      `Nie udalo sie odswiezyc kartoteki po zapisie pracownika: ${error instanceof Error ? error.message : "nieznany blad"}`
    );
  }

  const employeeDirectory = buildEmployeeDirectory({
    directoryEmployees: bootstrap.directoryEmployees,
    operationalEmployees: bootstrap.operationalEmployees,
  });
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
