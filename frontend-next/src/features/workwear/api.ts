"use client";

import { ApiError } from "@/lib/api/http";
import { getStore, saveStore } from "@/lib/api/stores";
import { fetchEmployeesModuleData } from "@/features/employees/api";
import { findEmployeeByKey } from "@/features/employees/mappers";
import {
  buildWorkwearDirectory,
  emptyWorkwearCatalogStore,
  emptyWorkwearIssuesStore,
  matchesWorkwearEmployeeReference,
  normalizeWorkwearCatalogStore,
  normalizeWorkwearIssuesStore,
} from "@/features/workwear/mappers";
import {
  normalizeWorkwearDate,
  normalizeWorkwearText,
} from "@/features/workwear/formatters";
import type {
  WorkwearBootstrapData,
  WorkwearCatalogFormValues,
  WorkwearCatalogItem,
  WorkwearIssueFormValues,
  WorkwearIssueRecord,
} from "@/features/workwear/types";
import {
  WORKWEAR_CATALOG_STORE_KEY,
  WORKWEAR_ISSUES_STORE_KEY,
} from "@/features/workwear/types";

function generateWorkwearCatalogId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `ww-cat-next-${randomPart}`;
}

function generateWorkwearIssueId() {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  return `ww-issue-next-${randomPart}`;
}

function parseWorkwearQuantity(value: string) {
  const normalized = String(value || "").trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchWorkwearCatalogStore() {
  try {
    const response = await getStore<WorkwearCatalogItem[]>(WORKWEAR_CATALOG_STORE_KEY);
    return normalizeWorkwearCatalogStore(response.payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return emptyWorkwearCatalogStore();
    }
    throw error;
  }
}

async function fetchWorkwearIssuesStore() {
  try {
    const response = await getStore<WorkwearIssueRecord[]>(WORKWEAR_ISSUES_STORE_KEY);
    return normalizeWorkwearIssuesStore(response.payload);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return emptyWorkwearIssuesStore();
    }
    throw error;
  }
}

export async function fetchWorkwearModuleData(): Promise<WorkwearBootstrapData> {
  const [employeesBootstrap, catalog, issues] = await Promise.all([
    fetchEmployeesModuleData(),
    fetchWorkwearCatalogStore(),
    fetchWorkwearIssuesStore(),
  ]);

  return {
    ...employeesBootstrap,
    catalog,
    issues,
  };
}

function resolveEditableIssueEmployee(args: {
  bootstrap: WorkwearBootstrapData;
  values: WorkwearIssueFormValues;
  existingIssue?: WorkwearIssueRecord | null;
}) {
  const employees = buildWorkwearDirectory(args.bootstrap);
  const employee = findEmployeeByKey(employees, normalizeWorkwearText(args.values.employee_key));

  if (!employee) {
    throw new Error("Wybierz pracownika z kartoteki.");
  }

  const editingSameInactiveEmployee =
    employee.status === "inactive" &&
    args.existingIssue &&
    matchesWorkwearEmployeeReference(args.existingIssue, employee, employees);

  if (employee.status === "inactive" && !editingSameInactiveEmployee) {
    throw new Error("Nie mozna wydac nowej odziezy nieaktywnemu pracownikowi.");
  }

  return { employee };
}

export async function saveWorkwearCatalogItem(args: {
  itemId?: string | null;
  values: WorkwearCatalogFormValues;
  bootstrap: WorkwearBootstrapData;
}) {
  const catalog = normalizeWorkwearCatalogStore(args.bootstrap.catalog);
  const existingItem = catalog.find((item) => item.id === args.itemId) ?? null;
  const itemName = normalizeWorkwearText(args.values.name);

  if (!itemName) {
    throw new Error("Podaj nazwe elementu odziezy.");
  }

  const duplicateItem = catalog.find(
    (item) =>
      normalizeWorkwearText(item.name).toLowerCase() === itemName.toLowerCase() &&
      item.id !== existingItem?.id
  );

  if (duplicateItem) {
    throw new Error("Taki element katalogu juz istnieje.");
  }

  const nextItem = {
    id: existingItem?.id || generateWorkwearCatalogId(),
    name: itemName,
    category: normalizeWorkwearText(args.values.category) || "Bez kategorii",
    notes: normalizeWorkwearText(args.values.notes),
  } satisfies WorkwearCatalogItem;

  const nextCatalog = existingItem
    ? catalog.map((item) => (item.id === existingItem.id ? nextItem : item))
    : [...catalog, nextItem];

  await saveStore(WORKWEAR_CATALOG_STORE_KEY, nextCatalog);
  return fetchWorkwearModuleData();
}

export async function deleteWorkwearCatalogItem(args: {
  itemId: string;
  bootstrap: WorkwearBootstrapData;
}) {
  const catalog = normalizeWorkwearCatalogStore(args.bootstrap.catalog);
  const issues = normalizeWorkwearIssuesStore(args.bootstrap.issues);
  const targetItem = catalog.find((item) => item.id === args.itemId) ?? null;

  if (!targetItem) {
    throw new Error("Nie znaleziono elementu katalogu.");
  }

  const usedInIssues = issues.some(
    (issue) =>
      normalizeWorkwearText(issue.item_id) === targetItem.id ||
      (!normalizeWorkwearText(issue.item_id) &&
        normalizeWorkwearText(issue.item_name).toLowerCase() ===
          normalizeWorkwearText(targetItem.name).toLowerCase())
  );

  if (usedInIssues) {
    throw new Error("Nie mozna usunac elementu, ktory ma juz wydania w ewidencji.");
  }

  await saveStore(
    WORKWEAR_CATALOG_STORE_KEY,
    catalog.filter((item) => item.id !== targetItem.id)
  );

  return fetchWorkwearModuleData();
}

export async function saveWorkwearIssueRecord(args: {
  issueId?: string | null;
  values: WorkwearIssueFormValues;
  bootstrap: WorkwearBootstrapData;
}) {
  const issues = normalizeWorkwearIssuesStore(args.bootstrap.issues);
  const catalog = normalizeWorkwearCatalogStore(args.bootstrap.catalog);
  const existingIssue = issues.find((issue) => issue.id === args.issueId) ?? null;
  const { employee } = resolveEditableIssueEmployee({
    bootstrap: args.bootstrap,
    values: args.values,
    existingIssue,
  });

  const item =
    catalog.find(
      (catalogItem) => catalogItem.id === normalizeWorkwearText(args.values.item_id)
    ) ?? null;
  if (!item) {
    throw new Error("Wybierz element z katalogu odziezy.");
  }

  const issueDate = normalizeWorkwearDate(args.values.issue_date);
  if (!issueDate) {
    throw new Error("Podaj date wydania.");
  }

  const quantity = parseWorkwearQuantity(args.values.quantity);
  if (quantity <= 0) {
    throw new Error("Ilosc musi byc wieksza od zera.");
  }

  const nextIssue = {
    id: existingIssue?.id || generateWorkwearIssueId(),
    employee_id: normalizeWorkwearText(employee.id) || undefined,
    employee_key: employee.key,
    employee_name: employee.name,
    issue_date: issueDate,
    item_id: item.id,
    item_name: item.name,
    size: normalizeWorkwearText(args.values.size) || "UNI",
    quantity,
    notes: normalizeWorkwearText(args.values.notes),
  } satisfies WorkwearIssueRecord;

  const nextIssues = existingIssue
    ? issues.map((issue) => (issue.id === existingIssue.id ? nextIssue : issue))
    : [...issues, nextIssue];

  await saveStore(WORKWEAR_ISSUES_STORE_KEY, nextIssues);
  return fetchWorkwearModuleData();
}

export async function deleteWorkwearIssueRecord(args: {
  issueId: string;
  bootstrap: WorkwearBootstrapData;
}) {
  const issues = normalizeWorkwearIssuesStore(args.bootstrap.issues);
  await saveStore(
    WORKWEAR_ISSUES_STORE_KEY,
    issues.filter((issue) => issue.id !== args.issueId)
  );
  return fetchWorkwearModuleData();
}
