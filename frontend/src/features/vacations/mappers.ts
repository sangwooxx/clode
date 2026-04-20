import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
  normalizeEmployeeText,
} from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  findEmployeeByKey,
  matchesEmployeeReference,
} from "@/features/employees/mappers";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import {
  formatVacationDays,
  normalizeVacationStatus,
  normalizeVacationText,
  normalizeVacationType,
} from "@/features/vacations/formatters";
import type {
  PlanningStore,
  VacationApprovalRow,
  VacationBalanceFormValues,
  VacationBalanceLookup,
  VacationBalanceRecord,
  VacationEmployeeOption,
  VacationEmployeeRow,
  VacationEmployeeStats,
  VacationHistoryRow,
  VacationPlanningConflict,
  VacationRequestFormValues,
  VacationRequestRecord,
  VacationStore,
  VacationSummaryCard,
  VacationType,
  VacationsBootstrapData,
} from "@/features/vacations/types";

export function emptyVacationStore(): VacationStore {
  return {
    version: 1,
    balances: {},
    requests: [],
  };
}

export function emptyPlanningStore(): PlanningStore {
  return {
    assignments: {},
  };
}

export function canApproveVacationWorkflow(args: {
  role: string | null | undefined;
  canApproveVacations: boolean | null | undefined;
  approvalMode: VacationsBootstrapData["workflow"]["vacationApprovalMode"] | null | undefined;
}) {
  const normalizedRole = normalizeVacationText(args.role).toLowerCase();
  const isAdmin =
    normalizedRole === "admin" || normalizedRole === "administrator";

  if (isAdmin) {
    return true;
  }

  if (args.approvalMode === "admin") {
    return false;
  }

  return Boolean(args.canApproveVacations);
}

export function buildVacationApprovalMessage(args: {
  canApprove: boolean;
  approvalMode: VacationsBootstrapData["workflow"]["vacationApprovalMode"];
}) {
  if (args.canApprove) {
    return null;
  }

  if (args.approvalMode === "admin") {
    return "Tryb workflow wymaga akceptacji administratora. To konto zapisuje nowe wpisy jako oczekujace.";
  }

  return "To konto zapisuje nowe wpisy jako oczekujace. Zatwierdzenie pozostaje po stronie uzytkownikow z uprawnieniem akceptacji urlopow.";
}

function parseVacationNumber(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function calculateVacationDays(startDate: string, endDate: string) {
  const normalizedStart = normalizeVacationText(startDate);
  const normalizedEnd = normalizeVacationText(endDate || startDate);

  if (!normalizedStart || !normalizedEnd) return 0;

  const start = new Date(normalizedStart);
  const end = new Date(normalizedEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;

  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86_400_000);
  return diffDays >= 0 ? diffDays + 1 : 0;
}

export function normalizeVacationStore(store: VacationStore | null | undefined): VacationStore {
  const rawStore = store && typeof store === "object" ? store : emptyVacationStore();
  const balancesInput =
    rawStore.balances && typeof rawStore.balances === "object" ? rawStore.balances : {};
  const requestsInput = Array.isArray(rawStore.requests) ? rawStore.requests : [];

  const balances = Object.fromEntries(
    Object.entries(balancesInput).map(([key, value]) => [
      key,
      {
        employee_id: normalizeVacationText(value?.employee_id),
        employee_key: normalizeVacationText(value?.employee_key),
        employee_name: normalizeVacationText(value?.employee_name),
        base_days: parseVacationNumber(value?.base_days),
        carryover_days: parseVacationNumber(value?.carryover_days),
        extra_days: parseVacationNumber(value?.extra_days),
      } satisfies VacationBalanceRecord,
    ])
  );

  const requests = requestsInput
    .map((request) => {
      const startDate = normalizeVacationText(request?.start_date);
      const endDate = normalizeVacationText(request?.end_date || request?.start_date);
      const days = parseVacationNumber(request?.days) || calculateVacationDays(startDate, endDate);

      return {
        id: normalizeVacationText(request?.id) || `vac-${Date.now()}-${Math.random()}`,
        employee_id: normalizeVacationText(request?.employee_id) || undefined,
        employee_key: normalizeVacationText(request?.employee_key) || undefined,
        employee_name: normalizeVacationText(request?.employee_name),
        type: normalizeVacationType(request?.type),
        start_date: startDate,
        end_date: endDate,
        days,
        status: normalizeVacationStatus(request?.status),
        requested_by: normalizeVacationText(request?.requested_by),
        notes: normalizeVacationText(request?.notes),
        created_at: normalizeVacationText(request?.created_at) || new Date().toISOString(),
      } satisfies VacationRequestRecord;
    })
    .filter((request) => request.employee_name && request.start_date);

  return {
    version: 1,
    balances,
    requests,
  };
}

export function normalizePlanningStore(
  store: PlanningStore | null | undefined
): PlanningStore {
  const rawAssignments =
    store?.assignments && typeof store.assignments === "object" ? store.assignments : {};

  const assignments: PlanningStore["assignments"] = {};

  Object.entries(rawAssignments).forEach(([date, employees]) => {
    if (!employees || typeof employees !== "object") return;

    assignments[date] = Object.fromEntries(
      Object.entries(employees).map(([employeeName, assignment]) => [
        normalizeVacationText(employeeName),
        {
          contract_id: normalizeVacationText(assignment?.contract_id),
          employee_id: normalizeVacationText(assignment?.employee_id),
          employee_key: normalizeVacationText(assignment?.employee_key),
          employee_name:
            normalizeVacationText(assignment?.employee_name) ||
            normalizeVacationText(employeeName),
          contract_name: normalizeVacationText(assignment?.contract_name),
          note: normalizeVacationText(assignment?.note),
        },
      ])
    );
  });

  return { assignments };
}

export function buildVacationDirectory(bootstrap: VacationsBootstrapData) {
  return buildEmployeeDirectory({
    directoryEmployees: bootstrap.directoryEmployees,
    storeEmployees: bootstrap.storeEmployees,
    timeEntries: bootstrap.timeEntries,
    workCardStore: bootstrap.workCardStore,
  });
}

export function buildVacationEmployeeOptions(
  employees: EmployeeDirectoryRecord[]
): VacationEmployeeOption[] {
  return employees
    .map((employee) => {
      const displayName = formatEmployeeDisplayName(employee, employee.name);
      const details = [
        employee.position || "Bez stanowiska",
        `Kod ${formatEmployeeCodeLabel(employee.worker_code)}`,
      ];

      if (employee.status === "inactive") {
        details.push("Historia");
      }

      return {
        key: employee.key,
        label: displayName,
        description: details.join(" | "),
        employee,
        status: employee.status === "inactive" ? "inactive" : "active",
      } satisfies VacationEmployeeOption;
    })
    .sort((left, right) =>
      `${left.label} ${left.employee.id || ""}`.localeCompare(
        `${right.label} ${right.employee.id || ""}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    );
}

function findEmployeesByNormalizedName(
  employees: EmployeeDirectoryRecord[],
  employeeName: string
) {
  const normalizedName = normalizeVacationText(employeeName).toLowerCase();
  if (!normalizedName) return [];

  return employees.filter(
    (employee) => normalizeVacationText(employee.name).toLowerCase() === normalizedName
  );
}

export function matchesVacationEmployeeReference(
  reference: {
    employee_id?: string | null;
    employee_key?: string | null;
    employee_name?: string | null;
  },
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const referenceEmployeeKey = normalizeVacationText(reference.employee_key);
  if (referenceEmployeeKey) {
    return referenceEmployeeKey === normalizeVacationText(employee.key);
  }

  return matchesEmployeeReference(
    {
      employee_id: reference.employee_id,
      employee_name: reference.employee_name,
    },
    employee,
    employees
  );
}

export function resolveVacationEditingEmployee(args: {
  employees: EmployeeDirectoryRecord[];
  employee_id?: string | null;
  employee_key?: string | null;
  employee_name?: string | null;
}): {
  employee: EmployeeDirectoryRecord | null;
  status: "resolved" | "legacy_name_only" | "ambiguous" | "missing";
  message: string | null;
} {
  const referenceEmployeeKey = normalizeVacationText(args.employee_key);
  if (referenceEmployeeKey) {
    const employeeByKey = findEmployeeByKey(args.employees, referenceEmployeeKey);
    if (employeeByKey) {
      return {
        employee: employeeByKey,
        status: "resolved",
        message: null,
      };
    }

    return {
      employee: null,
      status: "missing",
      message:
        "Wpis wskazuje pracownika po stabilnym kluczu, ale tego rekordu nie ma juz w kartotece.",
    };
  }

  const referenceEmployeeId = normalizeEmployeeText(args.employee_id);
  if (referenceEmployeeId) {
    const employeeById =
      args.employees.find(
        (employee) => normalizeEmployeeText(employee.id) === referenceEmployeeId
      ) ?? null;

    if (employeeById) {
      return {
        employee: employeeById,
        status: "resolved",
        message: null,
      };
    }

    return {
      employee: null,
      status: "missing",
      message:
        "Wpis wskazuje pracownika po identyfikatorze, ale tego rekordu nie ma juz w kartotece.",
    };
  }

  const referenceEmployeeName = normalizeVacationText(args.employee_name);
  if (!referenceEmployeeName) {
    return {
      employee: null,
      status: "missing",
      message: "Wpis legacy nie zawiera stabilnego identyfikatora pracownika ani czytelnej nazwy.",
    };
  }

  const sameNameEmployees = findEmployeesByNormalizedName(args.employees, referenceEmployeeName);
  if (sameNameEmployees.length > 1) {
    return {
      employee: null,
      status: "ambiguous",
      message:
        "Ten wpis legacy zawiera tylko nazwe pracownika, a w kartotece istnieje wiecej niz jedna osoba o tej samej nazwie. Wybierz wlasciwa osobe recznie przed zapisem.",
    };
  }

  return {
    employee: null,
    status: "legacy_name_only",
    message:
      "Ten wpis legacy zawiera tylko nazwe pracownika. Rekord nie jest juz przypinany automatycznie po nazwie; wybierz wlasciwa osobe recznie przed zapisem.",
  };
}

function resolveVacationEmployeeFromReference(args: {
  employees: EmployeeDirectoryRecord[];
  employee_id?: string | null;
  employee_key?: string | null;
  employee_name?: string | null;
}) {
  return (
    args.employees.find((employee) =>
      matchesVacationEmployeeReference(
        {
          employee_id: args.employee_id,
          employee_key: args.employee_key,
          employee_name: args.employee_name,
        },
        employee,
        args.employees
      )
    ) ?? null
  );
}

export function findVacationEmployeeByKey(
  employees: EmployeeDirectoryRecord[],
  key: string | null
) {
  return findEmployeeByKey(employees, key);
}

export function findVacationRequestById(
  store: VacationStore,
  requestId: string | null
) {
  if (!requestId) return null;
  return store.requests.find((request) => request.id === requestId) ?? null;
}

function buildVacationBalanceStorageKey(employee: EmployeeDirectoryRecord) {
  const employeeId = normalizeEmployeeText(employee.id);
  if (employeeId) {
    return `employee:${employeeId}`;
  }

  return `employee-key:${normalizeVacationText(employee.key)}`;
}

export function findVacationBalanceRecord(
  store: VacationStore,
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
): VacationBalanceLookup {
  const employeeId = normalizeEmployeeText(employee.id);
  const employeeKey = normalizeVacationText(employee.key);

  const byKey = Object.entries(store.balances).find(([balanceKey, balance]) => {
    return (
      normalizeVacationText(balance.employee_key) === employeeKey ||
      normalizeVacationText(balanceKey) === `employee-key:${employeeKey}`
    );
  });
  if (byKey) {
    return {
      key: byKey[0],
      record: byKey[1],
      status: "resolved",
      source: "key",
    };
  }

  if (employeeId) {
    const byId = Object.entries(store.balances).find(([balanceKey, balance]) => {
      return (
        normalizeVacationText(balance.employee_id) === employeeId ||
        normalizeVacationText(balanceKey) === `employee:${employeeId}`
      );
    });
    if (byId) {
      return {
        key: byId[0],
        record: byId[1],
        status: "resolved",
        source: "id",
      };
    }
  }

  const sameNameEmployees = findEmployeesByNormalizedName(employees, employee.name);
  const legacyNameMatches = Object.entries(store.balances).filter(([balanceKey, balance]) => {
    const normalizedBalanceEmployeeId = normalizeVacationText(balance.employee_id);
    const normalizedBalanceEmployeeKey = normalizeVacationText(balance.employee_key);

    if (normalizedBalanceEmployeeId || normalizedBalanceEmployeeKey) {
      return false;
    }

    return (
      normalizeVacationText(balanceKey).toLowerCase() ===
        normalizeVacationText(employee.name).toLowerCase() ||
      normalizeVacationText(balance.employee_name).toLowerCase() ===
        normalizeVacationText(employee.name).toLowerCase()
    );
  });

  if (sameNameEmployees.length === 1 && legacyNameMatches.length === 1) {
    return {
      key: legacyNameMatches[0][0],
      record: legacyNameMatches[0][1],
      status: "resolved",
      source: "legacy_name",
    };
  }

  if (legacyNameMatches.length > 0) {
    return {
      key: null,
      record: {
        employee_id: employee.id,
        employee_key: employee.key,
        employee_name: employee.name,
        base_days: 0,
        carryover_days: 0,
        extra_days: 0,
      },
      status: "ambiguous",
      source: "legacy_name",
    };
  }

  return {
    key: null,
    record: {
      employee_id: employee.id,
      employee_key: employee.key,
      employee_name: employee.name,
      base_days: 0,
      carryover_days: 0,
      extra_days: 0,
    },
    status: "missing",
    source: "none",
  };
}

export function getVacationBalanceForEmployee(
  store: VacationStore,
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const lookup = findVacationBalanceRecord(store, employee, employees);
  const balance = lookup.key ? store.balances[lookup.key] : lookup.record;
  return {
    ...lookup,
    record: {
      employee_id: normalizeVacationText(balance?.employee_id) || employee.id,
      employee_key: normalizeVacationText(balance?.employee_key) || employee.key,
      employee_name: normalizeVacationText(balance?.employee_name) || employee.name,
      base_days: parseVacationNumber(balance?.base_days),
      carryover_days: parseVacationNumber(balance?.carryover_days),
      extra_days: parseVacationNumber(balance?.extra_days),
    } satisfies VacationBalanceRecord,
  };
}

export function getVacationRequestsForEmployee(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
}) {
  return args.store.requests
    .filter((request) =>
      matchesVacationEmployeeReference(
        {
          employee_id: request.employee_id,
          employee_key: request.employee_key,
          employee_name: request.employee_name,
        },
        args.employee,
        args.employees
      )
    )
    .sort((left, right) =>
      `${right.start_date}|${right.created_at || ""}`.localeCompare(
        `${left.start_date}|${left.created_at || ""}`,
        "pl"
      )
    );
}

export function isVacationPoolType(type: VacationType | string) {
  const normalized = normalizeVacationType(type);
  return normalized === "vacation" || normalized === "on_demand";
}

export function buildVacationStatsForEmployee(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
}): VacationEmployeeStats {
  const { record } = getVacationBalanceForEmployee(args.store, args.employee, args.employees);
  const requests = getVacationRequestsForEmployee(args);
  const totalPool =
    parseVacationNumber(record.base_days) +
    parseVacationNumber(record.carryover_days) +
    parseVacationNumber(record.extra_days);

  const usedDays = requests
    .filter(
      (request) =>
        normalizeVacationStatus(request.status) === "approved" && isVacationPoolType(request.type)
    )
    .reduce((sum, request) => sum + parseVacationNumber(request.days), 0);

  const pendingDays = requests
    .filter(
      (request) =>
        normalizeVacationStatus(request.status) === "pending" && isVacationPoolType(request.type)
    )
    .reduce((sum, request) => sum + parseVacationNumber(request.days), 0);

  return {
    balance: {
      base_days: parseVacationNumber(record.base_days),
      carryover_days: parseVacationNumber(record.carryover_days),
      extra_days: parseVacationNumber(record.extra_days),
    },
    total_pool: totalPool,
    used_days: usedDays,
    pending_days: pendingDays,
    remaining_days: totalPool - usedDays,
    requests_count: requests.length,
    approved_requests: requests.filter(
      (request) => normalizeVacationStatus(request.status) === "approved"
    ).length,
  };
}

export function buildVacationSummaryCards(args: {
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
}): VacationSummaryCard[] {
  const totalRemaining = args.employees.reduce(
    (sum, employee) =>
      sum +
      buildVacationStatsForEmployee({
        employee,
        employees: args.employees,
        store: args.store,
      }).remaining_days,
    0
  );

  const requests = args.store.requests;
  const pendingCount = requests.filter(
    (request) => normalizeVacationStatus(request.status) === "pending"
  ).length;
  const approvedDays = requests
    .filter(
      (request) =>
        normalizeVacationStatus(request.status) === "approved" && isVacationPoolType(request.type)
    )
    .reduce((sum, request) => sum + parseVacationNumber(request.days), 0);

  return [
    {
      id: "vacations-employees",
      label: "Pracownicy",
      value: String(args.employees.length),
    },
    {
      id: "vacations-pending",
      label: "Wnioski oczekujace",
      value: String(pendingCount),
      accent: true,
    },
    {
      id: "vacations-approved-days",
      label: "Dni zatwierdzone",
      value: formatVacationDays(approvedDays),
    },
    {
      id: "vacations-remaining-pool",
      label: "Pozostala pula",
      value: formatVacationDays(totalRemaining),
    },
    {
      id: "vacations-inactive",
      label: "Nieaktywni w historii",
      value: String(args.employees.filter((employee) => employee.status === "inactive").length),
    },
  ];
}

export function buildVacationEmployeeRows(args: {
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
  search: string;
  filter: "all" | "active" | "inactive";
}): VacationEmployeeRow[] {
  const searchTerm = normalizeVacationText(args.search).toLowerCase();

  return args.employees
    .filter((employee) => {
      if (args.filter === "active" && employee.status === "inactive") return false;
      if (args.filter === "inactive" && employee.status !== "inactive") return false;

      if (!searchTerm) return true;

      const haystack = [
        employee.name,
        employee.worker_code,
        employee.position,
        employee.status,
      ]
        .map((value) => normalizeVacationText(value).toLowerCase())
        .join(" ");

      return haystack.includes(searchTerm);
    })
    .map((employee, index) => ({
      index: index + 1,
      employee,
      stats: buildVacationStatsForEmployee({
        employee,
        employees: args.employees,
        store: args.store,
      }),
    }));
}

export function buildVacationHistoryRows(args: {
  employee: EmployeeDirectoryRecord | null;
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
}): VacationHistoryRow[] {
  if (!args.employee) return [];

  return getVacationRequestsForEmployee({
    employee: args.employee,
    employees: args.employees,
    store: args.store,
  }).map((request, index) => ({
    index: index + 1,
    request,
    employee: args.employee,
  }));
}

export function buildVacationApprovalRows(args: {
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
}): VacationApprovalRow[] {
  return [...args.store.requests]
    .sort((left, right) =>
      `${right.start_date}|${right.created_at || ""}`.localeCompare(
        `${left.start_date}|${left.created_at || ""}`,
        "pl"
      )
    )
    .map((request, index) => {
      const employee =
        resolveVacationEmployeeFromReference({
          employees: args.employees,
          employee_id: request.employee_id,
          employee_key: request.employee_key,
          employee_name: request.employee_name,
        }) ?? null;

      return {
        index: index + 1,
        request,
        employee,
        displayName: employee?.name || request.employee_name || "Brak dopasowania",
        subtitle: employee
          ? [employee.worker_code ? `Kod ${employee.worker_code}` : "", employee.position]
              .filter(Boolean)
              .join(" • ") || (employee.status === "inactive" ? "Nieaktywny" : "Aktywny")
          : "Historyczny wpis bez dopasowania do kartoteki",
      };
    });
}

export function buildVacationBalanceFormValues(
  stats?: VacationEmployeeStats | null
): VacationBalanceFormValues {
  return {
    base_days: stats ? String(stats.balance.base_days || "") : "",
    carryover_days: stats ? String(stats.balance.carryover_days || "") : "",
    extra_days: stats ? String(stats.balance.extra_days || "") : "",
  };
}

export function buildVacationRequestFormValues(args: {
  request?: VacationRequestRecord | null;
  employees: EmployeeDirectoryRecord[];
  selectedEmployeeKey?: string | null;
  currentUserDisplayName?: string | null;
  resolvedRequestEmployee?: EmployeeDirectoryRecord | null;
}): VacationRequestFormValues {
  const requestEmployee = args.request ? args.resolvedRequestEmployee ?? null : null;

  const fallbackEmployee =
    findEmployeeByKey(args.employees, args.selectedEmployeeKey || null) ??
    args.employees.find((employeeItem) => employeeItem.status !== "inactive") ??
    args.employees[0] ??
    null;

  const employee = requestEmployee ?? (args.request ? null : fallbackEmployee);

  return {
    employee_key: employee?.key || "",
    type: normalizeVacationType(args.request?.type),
    start_date: normalizeVacationText(args.request?.start_date),
    end_date: normalizeVacationText(args.request?.end_date || args.request?.start_date),
    days: args.request ? String(parseVacationNumber(args.request.days) || "") : "",
    status: normalizeVacationStatus(args.request?.status),
    requested_by:
      normalizeVacationText(args.request?.requested_by) ||
      normalizeVacationText(args.currentUserDisplayName) ||
      "",
    notes: normalizeVacationText(args.request?.notes),
  };
}

export function vacationRangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string
) {
  const rangeAStart = new Date(startA);
  const rangeAEnd = new Date(endA || startA);
  const rangeBStart = new Date(startB);
  const rangeBEnd = new Date(endB || startB);
  if (
    [rangeAStart, rangeAEnd, rangeBStart, rangeBEnd].some((item) =>
      Number.isNaN(item.getTime())
    )
  ) {
    return false;
  }

  return (
    rangeAStart.getTime() <= rangeBEnd.getTime() &&
    rangeBStart.getTime() <= rangeAEnd.getTime()
  );
}

export function findVacationConflicts(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
  startDate: string;
  endDate: string;
  excludeRequestId?: string | null;
}) {
  return getVacationRequestsForEmployee({
    employee: args.employee,
    employees: args.employees,
    store: args.store,
  }).filter((request) => {
    if (request.id === args.excludeRequestId) return false;
    if (normalizeVacationStatus(request.status) === "rejected") return false;
    return vacationRangesOverlap(
      args.startDate,
      args.endDate,
      request.start_date,
      request.end_date
    );
  });
}

export function getApprovedVacationDaysExcluding(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: VacationStore;
  excludeRequestId?: string | null;
}) {
  return getVacationRequestsForEmployee({
    employee: args.employee,
    employees: args.employees,
    store: args.store,
  })
    .filter((request) => {
      return (
        request.id !== args.excludeRequestId &&
        normalizeVacationStatus(request.status) === "approved" &&
        isVacationPoolType(request.type)
      );
    })
    .reduce((sum, request) => sum + parseVacationNumber(request.days), 0);
}

export function getPlanningConflictsForRange(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  planningStore: PlanningStore;
  startDate: string;
  endDate: string;
}): VacationPlanningConflict[] {
  return Object.entries(args.planningStore.assignments).flatMap(([dateValue, assignments]) => {
    if (!vacationRangesOverlap(args.startDate, args.endDate, dateValue, dateValue)) {
      return [];
    }

    const normalizedEmployeeId = normalizeEmployeeText(args.employee.id);
    const normalizedEmployeeKey = normalizeVacationText(args.employee.key);
    const sameNameEmployees = findEmployeesByNormalizedName(args.employees, args.employee.name);

    const matchingAssignments = Object.entries(assignments || {}).flatMap<VacationPlanningConflict>(
      ([assignmentEmployeeNameKey, assignment]) => {
        const contractName = normalizeVacationText(assignment?.contract_name);
        if (!contractName) return [];

        const assignmentEmployeeId = normalizeVacationText(assignment?.employee_id);
        const assignmentEmployeeKey = normalizeVacationText(assignment?.employee_key);
        const assignmentEmployeeName =
          normalizeVacationText(assignment?.employee_name) ||
          normalizeVacationText(assignmentEmployeeNameKey);

        if (assignmentEmployeeKey && assignmentEmployeeKey === normalizedEmployeeKey) {
          return [
            {
              date: dateValue,
              contract_name: contractName,
              kind: "exact" as const,
              employee_name: assignmentEmployeeName,
            },
          ];
        }

        if (
          normalizedEmployeeId &&
          assignmentEmployeeId &&
          assignmentEmployeeId === normalizedEmployeeId
        ) {
          return [
            {
              date: dateValue,
              contract_name: contractName,
              kind: "exact" as const,
              employee_name: assignmentEmployeeName,
            },
          ];
        }

        if (
          assignmentEmployeeId ||
          assignmentEmployeeKey ||
          normalizeVacationText(assignmentEmployeeName).toLowerCase() !==
            normalizeVacationText(args.employee.name).toLowerCase()
        ) {
          return [];
        }

        if (sameNameEmployees.length === 1 && sameNameEmployees[0]?.key === args.employee.key) {
          return [
            {
              date: dateValue,
              contract_name: contractName,
              kind: "exact" as const,
              employee_name: assignmentEmployeeName,
            },
          ];
        }

        if (sameNameEmployees.some((employee) => employee.key === args.employee.key)) {
          return [
            {
              date: dateValue,
              contract_name: contractName,
              kind: "ambiguous" as const,
              employee_name: assignmentEmployeeName,
            },
          ];
        }

        return [];
      }
    );

    return matchingAssignments;
  });
}

export { buildVacationBalanceStorageKey };
