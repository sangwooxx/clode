import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import { buildEmployeeDirectory, findEmployeeByKey } from "@/features/employees/mappers";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import {
  formatWorkwearCategory,
  normalizeWorkwearDate,
  normalizeWorkwearText,
} from "@/features/workwear/formatters";
import type {
  WorkwearAttentionRow,
  WorkwearBootstrapData,
  WorkwearCatalogFormValues,
  WorkwearCatalogItem,
  WorkwearCatalogRow,
  WorkwearEmployeeOption,
  WorkwearEmployeeRow,
  WorkwearIssueEntry,
  WorkwearIssueFormValues,
  WorkwearIssueRecord,
  WorkwearIssueRow,
  WorkwearSummaryCard,
} from "@/features/workwear/types";
import { WORKWEAR_SIZE_OPTIONS } from "@/features/workwear/types";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function countEmployeesWithSameName(
  employees: EmployeeDirectoryRecord[],
  employeeName: string
) {
  const normalizedName = normalizeWorkwearText(employeeName).toLowerCase();
  if (!normalizedName) {
    return 0;
  }

  return employees.filter(
    (employee) => normalizeWorkwearText(employee.name).toLowerCase() === normalizedName
  ).length;
}

function findEmployeeById(
  employees: EmployeeDirectoryRecord[],
  employeeId: string | null | undefined
) {
  const normalizedId = normalizeWorkwearText(employeeId);
  if (!normalizedId) {
    return null;
  }

  return (
    employees.find((employee) => normalizeWorkwearText(employee.id) === normalizedId) ?? null
  );
}

function resolveIssueCatalogItem(
  issue: WorkwearIssueRecord,
  catalog: WorkwearCatalogItem[]
) {
  const itemId = normalizeWorkwearText(issue.item_id);
  if (itemId) {
    return catalog.find((item) => item.id === itemId) ?? null;
  }

  const itemName = normalizeWorkwearText(issue.item_name).toLowerCase();
  if (!itemName) {
    return null;
  }

  const matches = catalog.filter(
    (item) => normalizeWorkwearText(item.name).toLowerCase() === itemName
  );
  return matches.length === 1 ? matches[0] ?? null : null;
}

export function emptyWorkwearCatalogStore() {
  return [] as WorkwearCatalogItem[];
}

export function emptyWorkwearIssuesStore() {
  return [] as WorkwearIssueRecord[];
}

export function normalizeWorkwearCatalogStore(payload: unknown): WorkwearCatalogItem[] {
  if (!Array.isArray(payload)) {
    return emptyWorkwearCatalogStore();
  }

  const normalized: Array<WorkwearCatalogItem | null> = payload.map((entry, index) => {
      const item = entry as Partial<WorkwearCatalogItem>;
      const name = normalizeWorkwearText(item.name);
      const id = normalizeWorkwearText(item.id) || `workwear-item-${index + 1}`;
      if (!name) {
        return null;
      }

      return {
        id,
        name,
        category: formatWorkwearCategory(item.category),
        notes: normalizeWorkwearText(item.notes),
      } satisfies WorkwearCatalogItem;
    });

  return normalized
    .filter((entry): entry is WorkwearCatalogItem => entry !== null)
    .sort((left, right) =>
      `${left.name} ${left.id}`.localeCompare(`${right.name} ${right.id}`, "pl", {
        sensitivity: "base",
        numeric: true,
      })
    );
}

export function normalizeWorkwearIssuesStore(payload: unknown): WorkwearIssueRecord[] {
  if (!Array.isArray(payload)) {
    return emptyWorkwearIssuesStore();
  }

  const normalized: Array<WorkwearIssueRecord | null> = payload.map((entry, index) => {
      const issue = entry as Partial<WorkwearIssueRecord>;
      const issueDate = normalizeWorkwearDate(issue.issue_date);
      const itemId = normalizeWorkwearText(issue.item_id);
      const itemName = normalizeWorkwearText(issue.item_name);
      const employeeName = normalizeWorkwearText(issue.employee_name);
      const quantity = Number(issue.quantity || 0);

      if (!itemId && !itemName) {
        return null;
      }

      if (
        !employeeName &&
        !normalizeWorkwearText(issue.employee_id) &&
        !normalizeWorkwearText(issue.employee_key)
      ) {
        return null;
      }

      return {
        id: normalizeWorkwearText(issue.id) || `workwear-issue-${index + 1}`,
        employee_id: normalizeWorkwearText(issue.employee_id) || undefined,
        employee_key: normalizeWorkwearText(issue.employee_key) || undefined,
        employee_name: employeeName,
        issue_date: issueDate || todayDate(),
        item_id: itemId,
        item_name: itemName,
        size: normalizeWorkwearText(issue.size) || WORKWEAR_SIZE_OPTIONS[0],
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        notes: normalizeWorkwearText(issue.notes),
      } satisfies WorkwearIssueRecord;
    });

  return normalized
    .filter((entry): entry is WorkwearIssueRecord => entry !== null)
    .sort((left, right) =>
      `${right.issue_date} ${right.id}`.localeCompare(`${left.issue_date} ${left.id}`, "pl", {
        sensitivity: "base",
        numeric: true,
      })
    );
}

export function buildWorkwearDirectory(bootstrap: WorkwearBootstrapData) {
  return buildEmployeeDirectory({
    directoryEmployees: bootstrap.directoryEmployees,
    operationalEmployees: bootstrap.operationalEmployees,
  });
}

export function matchesWorkwearEmployeeReference(
  reference: Pick<WorkwearIssueRecord, "employee_id" | "employee_key" | "employee_name">,
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const referenceEmployeeKey = normalizeWorkwearText(reference.employee_key);
  if (referenceEmployeeKey) {
    return employee.key === referenceEmployeeKey;
  }

  const referenceEmployeeId = normalizeWorkwearText(reference.employee_id);
  const employeeId = normalizeWorkwearText(employee.id);
  if (referenceEmployeeId && employeeId) {
    return employeeId === referenceEmployeeId;
  }

  const referenceEmployeeName = normalizeWorkwearText(reference.employee_name).toLowerCase();
  if (!referenceEmployeeName) {
    return false;
  }

  if (countEmployeesWithSameName(employees, employee.name) > 1) {
    return false;
  }

  return normalizeWorkwearText(employee.name).toLowerCase() === referenceEmployeeName;
}

export function resolveWorkwearIssueEmployee(
  issue: WorkwearIssueRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const issueEmployeeKey = normalizeWorkwearText(issue.employee_key);
  if (issueEmployeeKey) {
    const employee = findEmployeeByKey(employees, issueEmployeeKey);
    if (!employee) {
      return {
        employee: null,
        resolution: "missing_employee" as const,
        resolutionLabel: "Brak pracownika w kartotece",
      };
    }

    return {
      employee,
      resolution:
        employee.status === "inactive" ? ("historical_inactive" as const) : ("exact" as const),
      resolutionLabel:
        employee.status === "inactive"
          ? "Historia pracownika nieaktywnego"
          : "Powiazanie po kluczu pracownika",
    };
  }

  const issueEmployeeId = normalizeWorkwearText(issue.employee_id);
  if (issueEmployeeId) {
    const employee = findEmployeeById(employees, issueEmployeeId);
    if (!employee) {
      return {
        employee: null,
        resolution: "missing_employee" as const,
        resolutionLabel: "Brak pracownika w kartotece",
      };
    }

    return {
      employee,
      resolution:
        employee.status === "inactive" ? ("historical_inactive" as const) : ("exact" as const),
      resolutionLabel:
        employee.status === "inactive"
          ? "Historia pracownika nieaktywnego"
          : "Powiazanie po identyfikatorze",
    };
  }

  const issueEmployeeName = normalizeWorkwearText(issue.employee_name).toLowerCase();
  if (!issueEmployeeName) {
    return {
      employee: null,
      resolution: "missing_employee" as const,
      resolutionLabel: "Brak danych pracownika",
    };
  }

  const matchingEmployees = employees.filter(
    (employee) => normalizeWorkwearText(employee.name).toLowerCase() === issueEmployeeName
  );

  if (matchingEmployees.length === 1) {
    const employee = matchingEmployees[0] ?? null;
    if (!employee) {
      return {
        employee: null,
        resolution: "missing_employee" as const,
        resolutionLabel: "Brak pracownika w kartotece",
      };
    }

    return {
      employee,
      resolution:
        employee.status === "inactive" ? ("historical_inactive" as const) : ("exact" as const),
      resolutionLabel:
        employee.status === "inactive"
          ? "Historia po unikalnej nazwie"
          : "Legacy match po unikalnej nazwie",
    };
  }

  if (matchingEmployees.length > 1) {
    return {
      employee: null,
      resolution: "ambiguous" as const,
      resolutionLabel: "Niejednoznaczny pracownik w danych legacy",
    };
  }

  return {
    employee: null,
    resolution: "missing_employee" as const,
    resolutionLabel: "Pracownik usuniety z kartoteki",
  };
}

export function buildWorkwearIssueEntries(args: {
  issues: WorkwearIssueRecord[];
  catalog: WorkwearCatalogItem[];
  employees: EmployeeDirectoryRecord[];
}) {
  return args.issues.map((issue) => {
    const employeeResolution = resolveWorkwearIssueEmployee(issue, args.employees);
    const item = resolveIssueCatalogItem(issue, args.catalog);

    return {
      issue,
      employee: employeeResolution.employee,
      item,
      resolution: employeeResolution.resolution,
      resolutionLabel: employeeResolution.resolutionLabel,
      isHistorical: employeeResolution.employee?.status === "inactive",
    } satisfies WorkwearIssueEntry;
  });
}

function buildEmployeeIssueSnapshot(
  employee: EmployeeDirectoryRecord,
  issueEntries: WorkwearIssueEntry[],
  employees: EmployeeDirectoryRecord[]
) {
  const matchedEntries = issueEntries.filter((entry) =>
    matchesWorkwearEmployeeReference(entry.issue, employee, employees)
  );

  return {
    issuesCount: matchedEntries.length,
    totalQuantity: matchedEntries.reduce(
      (sum, entry) => sum + Number(entry.issue.quantity || 0),
      0
    ),
    lastIssueDate: matchedEntries[0]?.issue.issue_date || "",
    lastItemName: matchedEntries[0]?.issue.item_name || "",
  };
}

export function buildWorkwearEmployeeRows(args: {
  employees: EmployeeDirectoryRecord[];
  issueEntries: WorkwearIssueEntry[];
  historical?: boolean;
}) {
  const sourceEmployees = args.employees
    .filter((employee) =>
      args.historical ? employee.status === "inactive" : employee.status !== "inactive"
    )
    .map((employee) => {
      const snapshot = buildEmployeeIssueSnapshot(employee, args.issueEntries, args.employees);
      return {
        employee,
        ...snapshot,
      };
    })
    .filter((row) => (args.historical ? row.issuesCount > 0 : true))
    .sort((left, right) =>
      `${left.employee.name} ${left.employee.id || ""}`.localeCompare(
        `${right.employee.name} ${right.employee.id || ""}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    );

  return sourceEmployees.map((row, index) => ({
    index: index + 1,
    employee: row.employee,
    issuesCount: row.issuesCount,
    totalQuantity: row.totalQuantity,
    lastIssueDate: row.lastIssueDate,
    lastItemName: row.lastItemName,
    isHistorical: args.historical === true,
  } satisfies WorkwearEmployeeRow));
}

export function buildWorkwearIssueRowsForEmployee(args: {
  employee: EmployeeDirectoryRecord | null;
  issueEntries: WorkwearIssueEntry[];
  employees: EmployeeDirectoryRecord[];
}) {
  if (!args.employee) {
    return [] as WorkwearIssueRow[];
  }

  return args.issueEntries
    .filter((entry) =>
      matchesWorkwearEmployeeReference(entry.issue, args.employee!, args.employees)
    )
    .sort((left, right) =>
      `${right.issue.issue_date} ${right.issue.id}`.localeCompare(
        `${left.issue.issue_date} ${left.issue.id}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((entry, index) => ({
      index: index + 1,
      entry,
    }));
}

export function buildWorkwearCatalogRows(args: {
  catalog: WorkwearCatalogItem[];
  issueEntries: WorkwearIssueEntry[];
}) {
  return args.catalog.map((item, index) => {
    const itemEntries = args.issueEntries.filter(
      (entry) => normalizeWorkwearText(entry.issue.item_id) === item.id
    );
    const activeAssignments = new Set(
      itemEntries
        .filter((entry) => entry.employee && entry.employee.status !== "inactive")
        .map((entry) => entry.employee?.key || "")
        .filter(Boolean)
    );

    return {
      index: index + 1,
      item,
      issuesCount: itemEntries.length,
      activeAssignments: activeAssignments.size,
      lastIssueDate: itemEntries[0]?.issue.issue_date || "",
    } satisfies WorkwearCatalogRow;
  });
}

export function buildWorkwearAttentionRows(issueEntries: WorkwearIssueEntry[]) {
  return issueEntries
    .filter((entry) => entry.resolution === "missing_employee" || entry.resolution === "ambiguous")
    .map((entry, index) => ({
      index: index + 1,
      entry,
      reason:
        entry.resolution === "ambiguous"
          ? "Wpis legacy nie wskazuje jednoznacznie pracownika."
          : "Pracownik z wpisu nie istnieje juz w kartotece.",
    } satisfies WorkwearAttentionRow));
}

export function buildWorkwearSummaryCards(args: {
  employees: EmployeeDirectoryRecord[];
  catalog: WorkwearCatalogItem[];
  issueEntries: WorkwearIssueEntry[];
}) {
  const activeEmployees = args.employees.filter((employee) => employee.status !== "inactive");
  const historicalEmployees = args.employees.filter((employee) => employee.status === "inactive");
  const historicalWithIssues = historicalEmployees.filter((employee) =>
    args.issueEntries.some((entry) => entry.employee?.key === employee.key)
  );

  return [
    {
      id: "workwear-active",
      label: "Aktywni pracownicy",
      value: String(activeEmployees.length),
      accent: true,
    },
    {
      id: "workwear-issues",
      label: "Wydania lacznie",
      value: String(args.issueEntries.length),
    },
    {
      id: "workwear-catalog",
      label: "Elementy w katalogu",
      value: String(args.catalog.length),
    },
    {
      id: "workwear-history",
      label: "Nieaktywni w historii",
      value: String(historicalWithIssues.length),
    },
  ] satisfies WorkwearSummaryCard[];
}

export function buildWorkwearEmployeeOptions(args: {
  employees: EmployeeDirectoryRecord[];
  includeEmployeeKey?: string | null;
}) {
  const includedEmployee = findEmployeeByKey(args.employees, args.includeEmployeeKey || null);
  const activeEmployees = args.employees.filter((employee) => employee.status !== "inactive");
  const employeePool =
    includedEmployee?.status === "inactive"
      ? [...activeEmployees, includedEmployee]
      : activeEmployees;

  const uniqueEmployees = new Map<string, EmployeeDirectoryRecord>();
  employeePool.forEach((employee) => {
    uniqueEmployees.set(employee.key, employee);
  });

  return [...uniqueEmployees.values()]
    .sort((left, right) =>
      `${left.name} ${left.id || ""}`.localeCompare(`${right.name} ${right.id || ""}`, "pl", {
        sensitivity: "base",
        numeric: true,
      })
    )
    .map((employee) => {
      const displayName = formatEmployeeDisplayName(employee, employee.name);
      const subtitleParts = [
        employee.position || "Bez stanowiska",
        `Kod ${formatEmployeeCodeLabel(employee.worker_code)}`,
      ];

      if (employee.status === "inactive") {
        subtitleParts.push("Historia");
      }

      return {
        key: employee.key,
        label: displayName,
        subtitle: subtitleParts.join(" | "),
        employee,
        historical: employee.status === "inactive",
      } satisfies WorkwearEmployeeOption;
    });
}

export function resolveInitialWorkwearEmployeeKey(args: {
  preferredKey?: string | null;
  employees: EmployeeDirectoryRecord[];
  issueEntries: WorkwearIssueEntry[];
}) {
  const preferredEmployee = findEmployeeByKey(args.employees, args.preferredKey || null);
  if (preferredEmployee) {
    return preferredEmployee.key;
  }

  const activeRows = buildWorkwearEmployeeRows({
    employees: args.employees,
    issueEntries: args.issueEntries,
  });
  const historicalRows = buildWorkwearEmployeeRows({
    employees: args.employees,
    issueEntries: args.issueEntries,
    historical: true,
  });

  return (
    activeRows.find((row) => row.issuesCount > 0)?.employee.key ||
    activeRows[0]?.employee.key ||
    historicalRows[0]?.employee.key ||
    null
  );
}

export function buildWorkwearIssueFormValues(args?: {
  issueEntry?: WorkwearIssueEntry | null;
  selectedEmployee?: EmployeeDirectoryRecord | null;
  catalog?: WorkwearCatalogItem[];
}) {
  const catalog = args?.catalog ?? [];
  const issueEntry = args?.issueEntry ?? null;
  const selectedEmployee = args?.selectedEmployee ?? null;

  if (issueEntry) {
    return {
      employee_key:
        issueEntry.employee?.key || normalizeWorkwearText(issueEntry.issue.employee_key),
      issue_date: normalizeWorkwearDate(issueEntry.issue.issue_date) || todayDate(),
      item_id: normalizeWorkwearText(issueEntry.issue.item_id) || catalog[0]?.id || "",
      size:
        WORKWEAR_SIZE_OPTIONS.includes(
          (normalizeWorkwearText(issueEntry.issue.size) || "UNI") as (typeof WORKWEAR_SIZE_OPTIONS)[number]
        )
          ? normalizeWorkwearText(issueEntry.issue.size) || "UNI"
          : "UNI",
      quantity: String(issueEntry.issue.quantity || 1),
      notes: issueEntry.issue.notes || "",
    } satisfies WorkwearIssueFormValues;
  }

  return {
    employee_key: selectedEmployee?.status !== "inactive" ? selectedEmployee?.key || "" : "",
    issue_date: todayDate(),
    item_id: catalog[0]?.id || "",
    size: "UNI",
    quantity: "1",
    notes: "",
  } satisfies WorkwearIssueFormValues;
}

export function buildWorkwearCatalogFormValues(item?: WorkwearCatalogItem | null) {
  return {
    name: item?.name || "",
    category: item?.category || "",
    notes: item?.notes || "",
  } satisfies WorkwearCatalogFormValues;
}
