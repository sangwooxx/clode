import {
  composeEmployeeName,
  formatEmployeeMedicalState,
  normalizeEmployeeText,
  splitEmployeeName,
} from "@/features/employees/formatters";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeeRelationSnapshot,
  EmployeeSummaryCard,
  EmployeeTableRow,
} from "@/features/employees/types";
import type { HoursEmployeeRecord, TimeEntryRecord } from "@/features/hours/types";
import type { WorkCardStore } from "@/features/work-cards/types";

function normalizeEmployeeStatus(status: HoursEmployeeRecord["status"]) {
  return status === "inactive" ? "inactive" : "active";
}

function normalizeOptionalText(value: unknown) {
  const normalized = normalizeEmployeeText(value);
  return normalized || undefined;
}

export function buildEmployeeDirectoryKey(
  employee: Pick<
    HoursEmployeeRecord,
    "id" | "name" | "worker_code" | "position" | "status"
  >,
  index: number
) {
  const employeeId = normalizeEmployeeText(employee.id);
  if (employeeId) {
    return `id:${employeeId}`;
  }

  return [
    "employee",
    normalizeEmployeeText(employee.name).toLowerCase(),
    normalizeEmployeeText(employee.worker_code).toLowerCase(),
    normalizeEmployeeText(employee.position).toLowerCase(),
    normalizeEmployeeStatus(employee.status),
    String(index),
  ].join("|");
}

function normalizeEmployeeRecord(
  employee: HoursEmployeeRecord,
  source: EmployeeDirectoryRecord["source"],
  index: number
): EmployeeDirectoryRecord | null {
  const firstName = normalizeEmployeeText(employee.first_name);
  const lastName = normalizeEmployeeText(employee.last_name);
  const fallbackName = composeEmployeeName(firstName, lastName);
  const name = normalizeEmployeeText(employee.name) || fallbackName;
  const employeeId = normalizeEmployeeText(employee.id) || undefined;

  if (!name && !employeeId) {
    return null;
  }

  const splitName = splitEmployeeName(name);

  return {
    key: buildEmployeeDirectoryKey(
      {
        id: employeeId,
        name,
        worker_code: normalizeOptionalText(employee.worker_code),
        position: normalizeOptionalText(employee.position),
        status: normalizeEmployeeStatus(employee.status),
      },
      index
    ),
    id: employeeId,
    name: name || composeEmployeeName(splitName.first_name, splitName.last_name),
    first_name: firstName || splitName.first_name || undefined,
    last_name: lastName || splitName.last_name || undefined,
    worker_code: normalizeOptionalText(employee.worker_code),
    position: normalizeOptionalText(employee.position),
    status: normalizeEmployeeStatus(employee.status),
    employment_date: normalizeOptionalText(employee.employment_date),
    employment_end_date: normalizeOptionalText(employee.employment_end_date),
    street: normalizeOptionalText(employee.street),
    city: normalizeOptionalText(employee.city),
    phone: normalizeOptionalText(employee.phone),
    medical_exam_valid_until: normalizeOptionalText(employee.medical_exam_valid_until),
    source,
    isPersisted: source !== "operational",
  };
}

function mergeEmployeeRecord(
  current: EmployeeDirectoryRecord | null,
  incoming: EmployeeDirectoryRecord
) {
  if (!current) {
    return incoming;
  }

  const sourceRank: Record<EmployeeDirectoryRecord["source"], number> = {
    operational: 1,
    directory: 2,
    store: 3,
  };
  const incomingWins = sourceRank[incoming.source] >= sourceRank[current.source];
  const preferValue = <T,>(currentValue: T, incomingValue: T) => {
    if (incomingWins) {
      return incomingValue || currentValue;
    }
    return currentValue || incomingValue;
  };

  return {
    ...current,
    ...incoming,
    key: current.key || incoming.key,
    id: preferValue(current.id, incoming.id),
    name: preferValue(current.name, incoming.name),
    first_name: preferValue(current.first_name, incoming.first_name),
    last_name: preferValue(current.last_name, incoming.last_name),
    worker_code: preferValue(current.worker_code, incoming.worker_code),
    position: preferValue(current.position, incoming.position),
    status: preferValue(current.status, incoming.status),
    employment_date: preferValue(current.employment_date, incoming.employment_date),
    employment_end_date: preferValue(current.employment_end_date, incoming.employment_end_date),
    street: preferValue(current.street, incoming.street),
    city: preferValue(current.city, incoming.city),
    phone: preferValue(current.phone, incoming.phone),
    medical_exam_valid_until: preferValue(
      current.medical_exam_valid_until,
      incoming.medical_exam_valid_until
    ),
    source:
      incomingWins ? incoming.source : current.source,
    isPersisted: current.isPersisted || incoming.isPersisted,
  };
}

function findExistingEmployeeKey(
  employees: Map<string, EmployeeDirectoryRecord>,
  candidate: EmployeeDirectoryRecord
) {
  if (candidate.id) {
    for (const [key, employee] of employees.entries()) {
      if (String(employee.id || "").trim() === candidate.id) {
        return key;
      }
    }
  }

  const normalizedName = normalizeEmployeeText(candidate.name).toLowerCase();
  if (!normalizedName) {
    return null;
  }

  const matches = [...employees.values()].filter(
    (employee) => normalizeEmployeeText(employee.name).toLowerCase() === normalizedName
  );

  if (matches.length === 1) {
    return matches[0]?.key ?? null;
  }

  return null;
}

function buildOperationalEmployees(
  timeEntries: TimeEntryRecord[],
  workCardStore: WorkCardStore
) {
  const operational: HoursEmployeeRecord[] = [];

  timeEntries.forEach((entry) => {
    operational.push({
      id: String(entry.employee_id || "").trim() || undefined,
      name: String(entry.employee_name || "").trim(),
      status: "active",
    });
  });

  workCardStore.cards.forEach((card) => {
    operational.push({
      id: String(card.employee_id || "").trim() || undefined,
      name: String(card.employee_name || "").trim(),
      status: "active",
    });
  });

  return operational;
}

export function buildEmployeeDirectory(args: {
  directoryEmployees: HoursEmployeeRecord[];
  storeEmployees: HoursEmployeeRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
}) {
  const employees = new Map<string, EmployeeDirectoryRecord>();

  const upsert = (
    employee: HoursEmployeeRecord,
    source: EmployeeDirectoryRecord["source"],
    index: number
  ) => {
    const normalized = normalizeEmployeeRecord(employee, source, index);
    if (!normalized) return;

    const existingKey = findExistingEmployeeKey(employees, normalized) ?? normalized.key;
    const current = employees.get(existingKey) ?? null;
    const merged = mergeEmployeeRecord(current, {
      ...normalized,
      key: existingKey,
    });
    employees.set(existingKey, merged);
  };

  args.storeEmployees.forEach((employee, index) => upsert(employee, "store", index));
  args.directoryEmployees.forEach((employee, index) =>
    upsert(employee, "directory", index + args.storeEmployees.length)
  );

  const operationalEmployees = buildOperationalEmployees(args.timeEntries, args.workCardStore);
  operationalEmployees.forEach((employee, index) =>
    upsert(
      employee,
      "operational",
      index + args.storeEmployees.length + args.directoryEmployees.length
    )
  );

  return [...employees.values()].sort((left, right) =>
    `${left.name} ${left.id || ""}`.localeCompare(
      `${right.name} ${right.id || ""}`,
      "pl",
      { sensitivity: "base", numeric: true }
    )
  );
}

function countSameNameEmployees(
  employees: EmployeeDirectoryRecord[],
  employee: EmployeeDirectoryRecord
) {
  const normalizedName = normalizeEmployeeText(employee.name).toLowerCase();
  if (!normalizedName) return 0;
  return employees.filter(
    (candidate) =>
      normalizeEmployeeText(candidate.name).toLowerCase() === normalizedName
  ).length;
}

export function matchesEmployeeReference(
  reference: { employee_id?: string | null; employee_name?: string | null },
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const employeeId = normalizeEmployeeText(employee.id);
  const referenceEmployeeId = normalizeEmployeeText(reference.employee_id);

  if (employeeId && referenceEmployeeId) {
    return employeeId === referenceEmployeeId;
  }

  const normalizedName = normalizeEmployeeText(reference.employee_name).toLowerCase();
  if (!normalizedName) {
    return false;
  }

  const uniqueName = countSameNameEmployees(employees, employee) <= 1;
  if (!uniqueName) {
    return false;
  }

  return normalizeEmployeeText(employee.name).toLowerCase() === normalizedName;
}

export function buildEmployeeRelations(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
}): EmployeeRelationSnapshot {
  const matchedEntries = args.timeEntries.filter((entry) =>
    matchesEmployeeReference(
      {
        employee_id: entry.employee_id,
        employee_name: entry.employee_name,
      },
      args.employee,
      args.employees
    )
  );
  const matchedCards = args.workCardStore.cards.filter((card) =>
    matchesEmployeeReference(
      {
        employee_id: card.employee_id,
        employee_name: card.employee_name,
      },
      args.employee,
      args.employees
    )
  );

  const monthKeys = new Set<string>();

  matchedEntries.forEach((entry) => {
    if (entry.month_key) {
      monthKeys.add(entry.month_key);
    }
  });
  matchedCards.forEach((card) => {
    if (card.month_key) {
      monthKeys.add(card.month_key);
    }
  });

  return {
    hoursEntries: matchedEntries.length,
    workCards: matchedCards.length,
    monthsCount: monthKeys.size,
    totalHours: matchedEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    totalCost: matchedEntries.reduce(
      (sum, entry) => sum + Number(entry.cost_amount || 0),
      0
    ),
  };
}

export function buildEmployeeSummaryCards(args: {
  employees: EmployeeDirectoryRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
}): EmployeeSummaryCard[] {
  const relationMap = new Map<string, EmployeeRelationSnapshot>();

  args.employees.forEach((employee) => {
    relationMap.set(
      employee.key,
      buildEmployeeRelations({
        employee,
        employees: args.employees,
        timeEntries: args.timeEntries,
        workCardStore: args.workCardStore,
      })
    );
  });

  const activeEmployees = args.employees.filter((employee) => employee.status !== "inactive");
  const inactiveEmployees = args.employees.filter((employee) => employee.status === "inactive");
  const withHours = args.employees.filter(
    (employee) => (relationMap.get(employee.key)?.hoursEntries || 0) > 0
  );
  const withCards = args.employees.filter(
    (employee) => (relationMap.get(employee.key)?.workCards || 0) > 0
  );
  const expiringMedical = args.employees.filter((employee) => {
    const medical = formatEmployeeMedicalState(employee.medical_exam_valid_until);
    return medical.tone === "warning" || medical.tone === "danger";
  });

  return [
    {
      id: "employees-total",
      label: "Wszyscy pracownicy",
      value: String(args.employees.length),
    },
    {
      id: "employees-active",
      label: "Aktywni",
      value: String(activeEmployees.length),
      accent: true,
    },
    {
      id: "employees-inactive",
      label: "Nieaktywni",
      value: String(inactiveEmployees.length),
    },
    {
      id: "employees-hours",
      label: "Ze wpisami czasu",
      value: String(withHours.length),
    },
    {
      id: "employees-cards",
      label: "Z kartami pracy",
      value: String(withCards.length),
    },
    {
      id: "employees-medical",
      label: "Badania do odnowienia",
      value: String(expiringMedical.length),
    },
  ];
}

export function buildEmployeeTableRows(args: {
  employees: EmployeeDirectoryRecord[];
  timeEntries: TimeEntryRecord[];
  workCardStore: WorkCardStore;
  search: string;
  filter: "all" | "active" | "inactive";
}) {
  const term = normalizeEmployeeText(args.search).toLowerCase();

  return args.employees
    .filter((employee) => {
      if (args.filter === "active" && employee.status === "inactive") return false;
      if (args.filter === "inactive" && employee.status !== "inactive") return false;

      if (!term) return true;

      const haystack = [
        employee.name,
        employee.worker_code,
        employee.position,
        employee.city,
        employee.phone,
      ]
        .map((value) => normalizeEmployeeText(value).toLowerCase())
        .join(" ");

      return haystack.includes(term);
    })
    .map((employee, index) => {
      const relations = buildEmployeeRelations({
        employee,
        employees: args.employees,
        timeEntries: args.timeEntries,
        workCardStore: args.workCardStore,
      });

      return {
        index: index + 1,
        employee,
        relations,
        medical: formatEmployeeMedicalState(employee.medical_exam_valid_until),
      } satisfies EmployeeTableRow;
    });
}

export function findEmployeeByKey(
  employees: EmployeeDirectoryRecord[],
  key: string | null
) {
  if (!key) return null;
  return employees.find((employee) => employee.key === key) ?? null;
}

export function buildEmployeeFormValues(
  employee?: EmployeeDirectoryRecord | null
): EmployeeFormValues {
  return {
    first_name: employee?.first_name || "",
    last_name: employee?.last_name || "",
    worker_code: employee?.worker_code || "",
    position: employee?.position || "",
    status: employee?.status === "inactive" ? "inactive" : "active",
    employment_date: employee?.employment_date || "",
    employment_end_date: employee?.employment_end_date || "",
    street: employee?.street || "",
    city: employee?.city || "",
    phone: employee?.phone || "",
    medical_exam_valid_until: employee?.medical_exam_valid_until || "",
  };
}

export function toEmployeeStoreRecord(args: {
  employeeId: string;
  values: EmployeeFormValues;
}) {
  const firstName = normalizeEmployeeText(args.values.first_name);
  const lastName = normalizeEmployeeText(args.values.last_name);
  const status = args.values.status === "inactive" ? "inactive" : "active";
  const employmentEndDate =
    status === "inactive"
      ? normalizeEmployeeText(args.values.employment_end_date) ||
        new Date().toISOString().slice(0, 10)
      : normalizeEmployeeText(args.values.employment_end_date);

  return {
    id: args.employeeId,
    name: composeEmployeeName(firstName, lastName),
    first_name: firstName,
    last_name: lastName,
    worker_code: normalizeOptionalText(args.values.worker_code),
    position: normalizeOptionalText(args.values.position),
    status,
    employment_date: normalizeOptionalText(args.values.employment_date),
    employment_end_date: employmentEndDate || undefined,
    street: normalizeOptionalText(args.values.street),
    city: normalizeOptionalText(args.values.city),
    phone: normalizeOptionalText(args.values.phone),
    medical_exam_valid_until: normalizeOptionalText(args.values.medical_exam_valid_until),
  } satisfies HoursEmployeeRecord;
}
