import { normalizeEmployeeText } from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  findEmployeeByKey,
} from "@/features/employees/mappers";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import {
  formatPlanningAbsenceLabel,
  formatPlanningContractLabel,
  formatPlanningDate,
  formatPlanningStaffingStatus,
  normalizePlanningText,
} from "@/features/planning/formatters";
import type {
  PlanningAbsenceInfo,
  PlanningAssignmentEntry,
  PlanningBootstrapData,
  PlanningCalendarCell,
  PlanningContractOption,
  PlanningContractSummaryRow,
  PlanningDaySummary,
  PlanningEmployeeRow,
  PlanningHistoricalRow,
  PlanningSummaryCard,
} from "@/features/planning/types";
import { getVacationRequestsForEmployee, vacationRangesOverlap } from "@/features/vacations/mappers";
import { normalizeVacationStatus, normalizeVacationType } from "@/features/vacations/formatters";
import type { ContractRecord } from "@/features/contracts/types";
import type { PlanningAssignmentRecord, PlanningStore, VacationStore } from "@/features/vacations/types";

function findEmployeesByName(
  employees: EmployeeDirectoryRecord[],
  employeeName: string | null | undefined
) {
  const normalizedName = normalizePlanningText(employeeName).toLowerCase();
  if (!normalizedName) return [];

  return employees.filter(
    (employee) => normalizePlanningText(employee.name).toLowerCase() === normalizedName
  );
}

function findContractByReference(args: {
  contracts: ContractRecord[];
  contractId?: string | null;
  contractName?: string | null;
}) {
  const contracts = Array.isArray(args.contracts) ? args.contracts : [];
  const normalizedContractId = normalizePlanningText(args.contractId);
  if (normalizedContractId) {
    const byId =
      contracts.find(
        (contract) => normalizePlanningText(contract.id) === normalizedContractId
      ) ?? null;
    if (byId) return byId;
  }

  const normalizedContractName = normalizePlanningText(args.contractName).toLowerCase();
  if (!normalizedContractName) return null;

  const sameNameContracts = contracts.filter(
    (contract) =>
      normalizePlanningText(contract.name).toLowerCase() === normalizedContractName
  );

  return sameNameContracts.length === 1 ? sameNameContracts[0] : null;
}

function resolvePlanningAssignmentEntry(args: {
  rawKey: string;
  assignment: PlanningAssignmentRecord;
  employees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
}): PlanningAssignmentEntry {
  const assignmentEmployeeKey = normalizePlanningText(args.assignment.employee_key);
  const assignmentEmployeeId = normalizeEmployeeText(args.assignment.employee_id);
  const employeeName =
    normalizePlanningText(args.assignment.employee_name) ||
    normalizePlanningText(args.rawKey);

  if (assignmentEmployeeKey) {
    const employeeByKey = findEmployeeByKey(args.employees, assignmentEmployeeKey);
    const contract = findContractByReference({
      contracts: args.contracts,
      contractId: args.assignment.contract_id,
      contractName: args.assignment.contract_name,
    });

    return {
      rawKey: args.rawKey,
      employee: employeeByKey,
      employeeName: employeeByKey?.name || employeeName,
      employeeId: employeeByKey?.id || assignmentEmployeeId || null,
      employeeKey: employeeByKey?.key || assignmentEmployeeKey,
      contractId: normalizePlanningText(args.assignment.contract_id) || contract?.id || null,
      contractName: normalizePlanningText(args.assignment.contract_name) || contract?.name || "",
      contract,
      note: normalizePlanningText(args.assignment.note),
      resolution: employeeByKey
        ? employeeByKey.status === "inactive"
          ? "historical_inactive"
          : "exact"
        : "unmatched",
      resolutionLabel: employeeByKey
        ? employeeByKey.status === "inactive"
          ? "Nieaktywny pracownik"
          : "Dopasowany po kluczu"
        : "Brak pracownika w kartotece",
    };
  }

  if (assignmentEmployeeId) {
    const employeeById =
      args.employees.find(
        (employee) => normalizeEmployeeText(employee.id) === assignmentEmployeeId
      ) ?? null;
    const contract = findContractByReference({
      contracts: args.contracts,
      contractId: args.assignment.contract_id,
      contractName: args.assignment.contract_name,
    });

    return {
      rawKey: args.rawKey,
      employee: employeeById,
      employeeName: employeeById?.name || employeeName,
      employeeId: employeeById?.id || assignmentEmployeeId,
      employeeKey: employeeById?.key || null,
      contractId: normalizePlanningText(args.assignment.contract_id) || contract?.id || null,
      contractName: normalizePlanningText(args.assignment.contract_name) || contract?.name || "",
      contract,
      note: normalizePlanningText(args.assignment.note),
      resolution: employeeById
        ? employeeById.status === "inactive"
          ? "historical_inactive"
          : "exact"
        : "unmatched",
      resolutionLabel: employeeById
        ? employeeById.status === "inactive"
          ? "Nieaktywny pracownik"
          : "Dopasowany po ID"
        : "Brak pracownika w kartotece",
    };
  }

  const sameNameEmployees = findEmployeesByName(args.employees, employeeName);
  const contract = findContractByReference({
    contracts: args.contracts,
    contractId: args.assignment.contract_id,
    contractName: args.assignment.contract_name,
  });

  if (sameNameEmployees.length === 1) {
    const employee = sameNameEmployees[0];
    return {
      rawKey: args.rawKey,
      employee,
      employeeName: employee.name,
      employeeId: employee.id || null,
      employeeKey: employee.key,
      contractId: normalizePlanningText(args.assignment.contract_id) || contract?.id || null,
      contractName: normalizePlanningText(args.assignment.contract_name) || contract?.name || "",
      contract,
      note: normalizePlanningText(args.assignment.note),
      resolution: employee.status === "inactive" ? "historical_inactive" : "exact",
      resolutionLabel:
        employee.status === "inactive"
          ? "Nieaktywny pracownik"
          : "Legacy rekord po unikalnej nazwie",
    };
  }

  return {
    rawKey: args.rawKey,
    employee: null,
    employeeName: employeeName || "Nieznany pracownik",
    employeeId: null,
    employeeKey: null,
    contractId: normalizePlanningText(args.assignment.contract_id) || contract?.id || null,
    contractName: normalizePlanningText(args.assignment.contract_name) || contract?.name || "",
    contract,
    note: normalizePlanningText(args.assignment.note),
    resolution: sameNameEmployees.length > 1 ? "ambiguous" : "unmatched",
    resolutionLabel:
      sameNameEmployees.length > 1
        ? "Niejednoznaczny rekord legacy"
        : "Brak pracownika w kartotece",
  };
}

export function buildPlanningDirectory(bootstrap: PlanningBootstrapData) {
  return buildEmployeeDirectory({
    directoryEmployees: bootstrap.directoryEmployees,
    storeEmployees: bootstrap.storeEmployees,
    timeEntries: bootstrap.timeEntries,
    workCardStore: bootstrap.workCardStore,
  });
}

export function getActivePlanningEmployees(employees: EmployeeDirectoryRecord[]) {
  return employees.filter((employee) => employee.status !== "inactive");
}

export function getHistoricalPlanningEmployees(employees: EmployeeDirectoryRecord[]) {
  return employees.filter((employee) => employee.status === "inactive");
}

export function buildPlanningStorageKey(
  employee: EmployeeDirectoryRecord,
  employees: EmployeeDirectoryRecord[]
) {
  const sameNameEmployees = findEmployeesByName(employees, employee.name);
  if (sameNameEmployees.length <= 1) {
    return employee.name;
  }

  const employeeId = normalizeEmployeeText(employee.id);
  if (employeeId) {
    return `employee:${employeeId}`;
  }

  return employee.key;
}

export function matchesPlanningEmployeeReference(args: {
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  rawKey?: string | null;
  assignment?: PlanningAssignmentRecord | null;
}) {
  const assignment = args.assignment;
  const referenceEmployeeKey = normalizePlanningText(assignment?.employee_key);
  if (referenceEmployeeKey) {
    return referenceEmployeeKey === args.employee.key;
  }

  const referenceEmployeeId = normalizeEmployeeText(assignment?.employee_id);
  const employeeId = normalizeEmployeeText(args.employee.id);
  if (referenceEmployeeId && employeeId) {
    return referenceEmployeeId === employeeId;
  }

  const referenceEmployeeName =
    normalizePlanningText(assignment?.employee_name) ||
    normalizePlanningText(args.rawKey);
  if (!referenceEmployeeName) {
    return false;
  }

  const sameNameEmployees = findEmployeesByName(args.employees, referenceEmployeeName);
  if (sameNameEmployees.length !== 1) {
    return false;
  }

  return sameNameEmployees[0]?.key === args.employee.key;
}

export function buildPlanningAssignmentEntries(args: {
  dateKey: string;
  employees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
  store: PlanningStore;
}) {
  const contracts = Array.isArray(args.contracts) ? args.contracts : [];
  const dayAssignments =
    args.store.assignments?.[args.dateKey] &&
    typeof args.store.assignments[args.dateKey] === "object"
      ? args.store.assignments[args.dateKey]
      : {};

  return Object.entries(dayAssignments)
    .map(([rawKey, assignment]) =>
      resolvePlanningAssignmentEntry({
        rawKey,
        assignment,
        employees: args.employees,
        contracts,
      })
    )
    .sort((left, right) =>
      `${left.employeeName} ${left.employeeId || left.employeeKey || ""}`.localeCompare(
        `${right.employeeName} ${right.employeeId || right.employeeKey || ""}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    );
}

export function findPlanningEntryForEmployee(args: {
  entries: PlanningAssignmentEntry[];
  employee: EmployeeDirectoryRecord;
}) {
  return args.entries.find((entry) => entry.employee?.key === args.employee.key) ?? null;
}

export function getPlanningAbsenceForDate(args: {
  dateKey: string;
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  vacationStore: VacationStore;
}): PlanningAbsenceInfo | null {
  const matchingRequest = getVacationRequestsForEmployee({
    employee: args.employee,
    employees: args.employees,
    store: args.vacationStore,
  }).find((request) => {
    return (
      normalizeVacationStatus(request.status) === "approved" &&
      vacationRangesOverlap(args.dateKey, args.dateKey, request.start_date, request.end_date)
    );
  });

  if (!matchingRequest) {
    return null;
  }

  const type = normalizeVacationType(matchingRequest.type);
  return {
    requestId: matchingRequest.id,
    type,
    label: formatPlanningAbsenceLabel(type),
  };
}

export function buildPlanningEmployeeRows(args: {
  dateKey: string;
  employees: EmployeeDirectoryRecord[];
  allEmployees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
  planningStore: PlanningStore;
  vacationStore: VacationStore;
  search?: string;
}) {
  const planningEntries = buildPlanningAssignmentEntries({
    dateKey: args.dateKey,
    employees: args.allEmployees,
    contracts: args.contracts,
    store: args.planningStore,
  });
  const searchTerm = normalizePlanningText(args.search).toLowerCase();

  return args.employees
    .filter((employee) => {
      if (!searchTerm) return true;

      const haystack = [
        employee.name,
        employee.worker_code,
        employee.position,
      ]
        .map((value) => normalizePlanningText(value).toLowerCase())
        .join(" ");

      return haystack.includes(searchTerm);
    })
    .map((employee, index) => {
      const assignment =
        findPlanningEntryForEmployee({
          entries: planningEntries,
          employee,
        }) ?? null;
      const absence = getPlanningAbsenceForDate({
        dateKey: args.dateKey,
        employee,
        employees: args.allEmployees,
        vacationStore: args.vacationStore,
      });
      const hasConflict = Boolean(absence && assignment?.contractName);

      let statusLabel = "Dostępny";
      let statusTone: PlanningEmployeeRow["statusTone"] = "neutral";

      if (hasConflict && absence) {
        statusLabel = `${absence.label} / konflikt z przypisaniem`;
        statusTone = "danger";
      } else if (absence) {
        statusLabel = absence.label;
        statusTone = "warning";
      } else if (assignment?.contractName) {
        statusLabel = "Przypisany";
        statusTone = "ok";
      } else if (assignment?.note) {
        statusLabel = "Uwagi bez przypisania";
        statusTone = "neutral";
      }

      return {
        index: index + 1,
        employee,
        assignment,
        absence,
        hasConflict,
        statusLabel,
        statusTone,
      } satisfies PlanningEmployeeRow;
    });
}

export function buildPlanningDaySummary(args: {
  dateKey: string;
  rows: PlanningEmployeeRow[];
  contracts: ContractRecord[];
}) {
  const contracts = Array.isArray(args.contracts) ? args.contracts : [];
  const unassignedRows = args.rows.filter(
    (row) => !row.absence && !normalizePlanningText(row.assignment?.contractName)
  );
  const unavailableRows = args.rows.filter((row) => row.absence);

  return {
    selectedDate: args.dateKey,
    activeContractsCount: contracts.filter((contract) => contract.status !== "archived").length,
    assignedCount: args.rows.filter((row) => normalizePlanningText(row.assignment?.contractName)).length,
    unavailableCount: unavailableRows.length,
    unassignedCount: unassignedRows.length,
    unassignedNames: unassignedRows.map((row) => row.employee.name),
    unavailableNames: unavailableRows.map((row) =>
      row.assignment?.contractName
        ? `${row.employee.name} (${row.absence?.label}; ${row.assignment.contractName})`
        : `${row.employee.name} (${row.absence?.label})`
    ),
  } satisfies PlanningDaySummary;
}

export function buildPlanningSummaryCards(args: {
  daySummary: PlanningDaySummary;
  historicalCount: number;
}): PlanningSummaryCard[] {
  return [
    {
      id: "planning-date",
      label: "Data planu",
      value: formatPlanningDate(args.daySummary.selectedDate),
    },
    {
      id: "planning-contracts",
      label: "Kontrakty aktywne",
      value: String(args.daySummary.activeContractsCount),
    },
    {
      id: "planning-assigned",
      label: "Pracownicy przypisani",
      value: String(args.daySummary.assignedCount),
    },
    {
      id: "planning-unavailable",
      label: "Niedostępni",
      value: String(args.daySummary.unavailableCount),
    },
    {
      id: "planning-unassigned",
      label: "Bez przypisania",
      value: String(args.daySummary.unassignedCount),
      accent: args.daySummary.unassignedCount > 0,
    },
    {
      id: "planning-history",
      label: "Historia / uwaga",
      value: String(args.historicalCount),
    },
  ];
}

export function buildPlanningContractSummaryRows(args: {
  rows: PlanningEmployeeRow[];
  contracts: ContractRecord[];
}) {
  const activeContracts = (Array.isArray(args.contracts) ? args.contracts : []).filter(
    (contract) => contract.status !== "archived"
  );

  return activeContracts
    .map((contract, index) => {
      const assignedEmployees = args.rows
        .filter(
          (row) =>
            !row.absence &&
            ((row.assignment?.contract?.id && row.assignment.contract.id === contract.id) ||
              (!row.assignment?.contract?.id &&
                normalizePlanningText(row.assignment?.contractName) ===
                  normalizePlanningText(contract.name)))
        )
        .map((row) => row.employee.name);

      return {
        index: index + 1,
        contract,
        assignedEmployees,
        staffingStatus: formatPlanningStaffingStatus(assignedEmployees.length),
      } satisfies PlanningContractSummaryRow;
    })
    .sort((left, right) =>
      `${left.contract.contract_number} ${left.contract.name}`.localeCompare(
        `${right.contract.contract_number} ${right.contract.name}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((row, index) => ({
      ...row,
      index: index + 1,
    }));
}

export function buildPlanningHistoricalRows(args: {
  dateKey: string;
  employees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
  planningStore: PlanningStore;
}) {
  return buildPlanningAssignmentEntries({
    dateKey: args.dateKey,
    employees: args.employees,
    contracts: args.contracts,
    store: args.planningStore,
  })
    .filter((entry) => entry.resolution !== "exact")
    .map((entry, index) => ({
      index: index + 1,
      entry,
    })) satisfies PlanningHistoricalRow[];
}

export function buildPlanningContractOptions(contracts: ContractRecord[]) {
  return (Array.isArray(contracts) ? contracts : [])
    .filter((contract) => contract.status !== "archived")
    .sort((left, right) =>
      `${left.contract_number} ${left.name}`.localeCompare(
        `${right.contract_number} ${right.name}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((contract) => ({
      id: contract.id,
      label: formatPlanningContractLabel(contract.contract_number, contract.name),
      subtitle: contract.investor || "Bez inwestora",
      contract,
    })) satisfies PlanningContractOption[];
}

export function resolveInitialPlanningDate(store: PlanningStore) {
  const dateKeys = Object.keys(store.assignments || {})
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort((left, right) => right.localeCompare(left, "pl"));

  return dateKeys[0] || new Date().toISOString().slice(0, 10);
}

export function shiftPlanningMonth(monthKey: string, offset: number) {
  const normalized = normalizePlanningText(monthKey);
  const fallback = new Date();
  const parsed = /^\d{4}-\d{2}$/.test(normalized)
    ? new Date(`${normalized}-01T00:00:00`)
    : fallback;

  if (Number.isNaN(parsed.getTime())) {
    return fallback.toISOString().slice(0, 7);
  }

  parsed.setMonth(parsed.getMonth() + offset);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function buildPlanningCalendarCells(args: {
  monthKey: string;
  selectedDate: string;
  activeEmployees: EmployeeDirectoryRecord[];
  allEmployees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
  planningStore: PlanningStore;
  vacationStore: VacationStore;
}) {
  const parsedMonth = /^\d{4}-\d{2}$/.test(args.monthKey)
    ? new Date(`${args.monthKey}-01T00:00:00`)
    : new Date(`${new Date().toISOString().slice(0, 7)}-01T00:00:00`);
  const monthDate = Number.isNaN(parsedMonth.getTime()) ? new Date() : parsedMonth;
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(year, monthIndex, 1 - startOffset + index);
    const dateKey = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(cellDate.getDate()).padStart(2, "0")}`;
    const entries = buildPlanningAssignmentEntries({
      dateKey,
      employees: args.allEmployees,
      contracts: args.contracts,
      store: args.planningStore,
    });
    const absenceCount = args.activeEmployees.filter((employee) =>
      Boolean(
        getPlanningAbsenceForDate({
          dateKey,
          employee,
          employees: args.allEmployees,
          vacationStore: args.vacationStore,
        })
      )
    ).length;

    return {
      dateKey,
      dayNumber: cellDate.getDate(),
      isOutsideMonth: cellDate.getMonth() !== monthIndex,
      isSelected: dateKey === args.selectedDate,
      assignmentCount: entries.filter((entry) => normalizePlanningText(entry.contractName)).length,
      absenceCount,
      historicalCount: entries.filter((entry) => entry.resolution !== "exact").length,
    } satisfies PlanningCalendarCell;
  });
}

export function removePlanningAssignmentsForEmployee(args: {
  dateKey: string;
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: PlanningStore;
}) {
  const dayAssignments =
    args.store.assignments?.[args.dateKey] &&
    typeof args.store.assignments[args.dateKey] === "object"
      ? args.store.assignments[args.dateKey]
      : {};

  const nextAssignments = Object.fromEntries(
    Object.entries(dayAssignments).filter(([rawKey, assignment]) => {
      return !matchesPlanningEmployeeReference({
        employee: args.employee,
        employees: args.employees,
        rawKey,
        assignment,
      });
    })
  );

  return {
    ...args.store,
    assignments: {
      ...args.store.assignments,
      [args.dateKey]: nextAssignments,
    },
  } satisfies PlanningStore;
}

export function upsertPlanningAssignmentForEmployee(args: {
  dateKey: string;
  employee: EmployeeDirectoryRecord;
  employees: EmployeeDirectoryRecord[];
  store: PlanningStore;
  contract: ContractRecord | null;
  note: string;
}) {
  const withoutCurrent = removePlanningAssignmentsForEmployee({
    dateKey: args.dateKey,
    employee: args.employee,
    employees: args.employees,
    store: args.store,
  });
  const storageKey = buildPlanningStorageKey(args.employee, args.employees);

  return {
    ...withoutCurrent,
    assignments: {
      ...withoutCurrent.assignments,
      [args.dateKey]: {
        ...(withoutCurrent.assignments[args.dateKey] || {}),
        [storageKey]: {
          employee_id: args.employee.id,
          employee_key: args.employee.key,
          employee_name: args.employee.name,
          contract_id: args.contract?.id || "",
          contract_name: args.contract?.name || "",
          note: normalizePlanningText(args.note),
        },
      },
    },
  } satisfies PlanningStore;
}

export function buildPlanningHistoricalCardRows(args: {
  dateKey: string;
  employees: EmployeeDirectoryRecord[];
  contracts: ContractRecord[];
  planningStore: PlanningStore;
}) {
  return buildPlanningHistoricalRows(args).map((row) => ({
    ...row,
    contractLabel: row.entry.contract
      ? formatPlanningContractLabel(
          row.entry.contract.contract_number,
          row.entry.contract.name
        )
      : row.entry.contractName || "Brak kontraktu",
    employeeLabel:
      row.entry.employee?.name ||
      `${row.entry.employeeName} • ${row.entry.resolutionLabel}`,
  }));
}

export function buildPlanningAbsenceRows(args: {
  dateKey: string;
  activeEmployees: EmployeeDirectoryRecord[];
  allEmployees: EmployeeDirectoryRecord[];
  vacationStore: VacationStore;
}) {
  return args.activeEmployees
    .map((employee) => ({
      employee,
      absence: getPlanningAbsenceForDate({
        dateKey: args.dateKey,
        employee,
        employees: args.allEmployees,
        vacationStore: args.vacationStore,
      }),
    }))
    .filter((item) => item.absence)
    .map((item) => ({
      name: item.employee.name,
      label: item.absence?.label || "",
    }));
}
