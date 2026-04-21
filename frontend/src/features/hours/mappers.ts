import type { ContractRecord } from "@/features/contracts/types";
import {
  formatContractStatusLabel,
  formatHours,
  formatMonthLabel,
  formatMoney,
  formatNumber,
  parseDecimalInput,
} from "@/features/hours/formatters";
import type {
  HoursCard,
  HoursContractAggregate,
  HoursContractOption,
  HoursEmployeeRecord,
  HoursEntryDetails,
  HoursFinanceDraft,
  HoursMonthOption,
  HoursMonthRecord,
  TimeEntryRecord,
} from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";

function normalizeEmployeeStatus(status: HoursEmployeeRecord["status"]) {
  return status === "inactive" ? "inactive" : "active";
}

function normalizeEmployeeRecord(employee: HoursEmployeeRecord): HoursEmployeeRecord {
  const firstName = String(employee.first_name || "").trim();
  const lastName = String(employee.last_name || "").trim();
  const fallbackName = [lastName, firstName].filter(Boolean).join(" ").trim();
  const name = String(employee.name || fallbackName || "").trim();

  return {
    ...employee,
    id: String(employee.id || "").trim() || undefined,
    name,
    first_name: firstName || undefined,
    last_name: lastName || undefined,
    position: String(employee.position || "").trim() || undefined,
    status: normalizeEmployeeStatus(employee.status),
    employment_date: String(employee.employment_date || "").trim() || undefined,
    employment_end_date: String(employee.employment_end_date || "").trim() || undefined,
    street: String(employee.street || "").trim() || undefined,
    city: String(employee.city || "").trim() || undefined,
    phone: String(employee.phone || "").trim() || undefined,
    medical_exam_valid_until:
      String(employee.medical_exam_valid_until || "").trim() || undefined,
    worker_code: String(employee.worker_code || "").trim() || undefined,
  };
}

export function mergeEmployeeRecords(args: {
  canonicalEmployees: HoursEmployeeRecord[];
  supplementalEmployees?: HoursEmployeeRecord[];
}) {
  const supplementalById = new Map<string, HoursEmployeeRecord>();
  const mergedById = new Set<string>();

  (args.supplementalEmployees || []).forEach((employee) => {
    const normalized = normalizeEmployeeRecord(employee);
    if (normalized.id) {
      supplementalById.set(normalized.id, normalized);
    }
  });

  const merged: HoursEmployeeRecord[] = args.canonicalEmployees.map((employee) => {
    const normalized = normalizeEmployeeRecord(employee);
    const supplemental = normalized.id ? supplementalById.get(normalized.id) : null;

    if (normalized.id) {
      mergedById.add(normalized.id);
    }

    return normalizeEmployeeRecord({
      ...supplemental,
      ...normalized,
      name: normalized.name || supplemental?.name || "",
      first_name: normalized.first_name || supplemental?.first_name || "",
      last_name: normalized.last_name || supplemental?.last_name || "",
      worker_code: normalized.worker_code || supplemental?.worker_code || "",
      position: normalized.position || supplemental?.position || "",
      status: normalized.status || supplemental?.status || "active",
    });
  });

  (args.supplementalEmployees || []).forEach((employee) => {
    const normalized = normalizeEmployeeRecord(employee);
    if (normalized.id && mergedById.has(normalized.id)) {
      return;
    }
    merged.push(normalized);
  });

  return merged.sort((left, right) =>
    `${left.name} ${left.id || ""}`.localeCompare(
      `${right.name} ${right.id || ""}`,
      "pl",
      { sensitivity: "base", numeric: true }
    )
  );
}

export function getSelectedMonth(
  months: HoursMonthRecord[],
  selectedMonthKey: string
) {
  return months.find((month) => month.month_key === selectedMonthKey) ?? null;
}

export function resolveHoursMonthSwitch(args: {
  months: HoursMonthRecord[];
  currentMonthKey: string;
  nextMonthKey: string;
}) {
  const currentMonth = getSelectedMonth(args.months, args.currentMonthKey);
  const nextMonth = getSelectedMonth(args.months, args.nextMonthKey);

  return {
    currentMonth,
    nextMonth,
    isSameMonth:
      String(args.currentMonthKey || "").trim() === String(args.nextMonthKey || "").trim(),
  };
}

export function buildMonthOptions(months: HoursMonthRecord[]): HoursMonthOption[] {
  return months.map((month) => ({
    value: month.month_key,
    label: month.month_label || formatMonthLabel(month.month_key),
  }));
}

export function buildFinanceDraft(month: HoursMonthRecord | null): HoursFinanceDraft {
  const finance = month?.finance ?? {
    zus_company_1: 0,
    zus_company_2: 0,
    zus_company_3: 0,
    pit4_company_1: 0,
    pit4_company_2: 0,
    pit4_company_3: 0,
    payouts: 0,
  };

  return {
    zus_company_1: String(finance.zus_company_1 ?? 0),
    zus_company_2: String(finance.zus_company_2 ?? 0),
    zus_company_3: String(finance.zus_company_3 ?? 0),
    pit4_company_1: String(finance.pit4_company_1 ?? 0),
    pit4_company_2: String(finance.pit4_company_2 ?? 0),
    pit4_company_3: String(finance.pit4_company_3 ?? 0),
    payouts: String(finance.payouts ?? 0),
  };
}

export function normalizeFinanceDraft(draft: HoursFinanceDraft) {
  return {
    zus_company_1: parseDecimalInput(draft.zus_company_1),
    zus_company_2: parseDecimalInput(draft.zus_company_2),
    zus_company_3: parseDecimalInput(draft.zus_company_3),
    pit4_company_1: parseDecimalInput(draft.pit4_company_1),
    pit4_company_2: parseDecimalInput(draft.pit4_company_2),
    pit4_company_3: parseDecimalInput(draft.pit4_company_3),
    payouts: parseDecimalInput(draft.payouts),
  };
}

export function buildEmployeeRoster(employees: HoursEmployeeRecord[]) {
  const uniqueEmployees = new Map<string, HoursEmployeeRecord>();

  employees.forEach((employee, index) => {
    const normalized = normalizeEmployeeRecord(employee);
    if (!normalized.name) return;

    const key =
      normalized.id ||
      [
        normalized.name.toLowerCase(),
        String(normalized.worker_code || "").trim().toLowerCase(),
        String(normalized.position || "").trim().toLowerCase(),
        String(normalized.status || "active").trim().toLowerCase(),
        String(index),
      ].join("|");

    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, normalized);
    }
  });

  return [...uniqueEmployees.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "pl", { sensitivity: "base", numeric: true })
  );
}

export function getMonthEntries(entries: TimeEntryRecord[], monthKey: string) {
  return entries.filter((entry) => entry.month_key === monthKey);
}

export function buildSummaryCards(entries: TimeEntryRecord[], month: HoursMonthRecord | null): HoursCard[] {
  const hoursTotal = entries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const costTotal = entries.reduce((sum, entry) => sum + Number(entry.cost_amount || 0), 0);
  const employeesCount = new Set(
    entries
      .map((entry) => String(entry.employee_id || "").trim() || String(entry.employee_name || "").trim())
      .filter(Boolean)
  ).size;
  const contractIds = new Set(entries.map((entry) => String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID));
  const activeContractsCount = (month?.visible_investments || []).length;

  return [
    {
      id: "entries",
      label: "Wpisy w miesiącu",
      value: formatNumber(entries.length),
    },
    {
      id: "hours",
      label: "Roboczogodziny",
      value: formatHours(hoursTotal),
      accent: true,
    },
    {
      id: "cost",
      label: "Koszt wynagrodzeń",
      value: formatMoney(costTotal),
    },
    {
      id: "employees",
      label: "Pracownicy",
      value: formatNumber(employeesCount),
    },
    {
      id: "contracts",
      label: "Kontrakty we wpisach",
      value: formatNumber(contractIds.size),
    },
    {
      id: "active-contracts",
      label: "Aktywne kontrakty miesiąca",
      value: formatNumber(activeContractsCount),
    },
  ];
}

export function buildContractAggregates(entries: TimeEntryRecord[]): HoursContractAggregate[] {
  const buckets = new Map<string, HoursContractAggregate>();

  entries.forEach((entry) => {
    const key = String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
    const current = buckets.get(key) ?? {
      contract_id: key === UNASSIGNED_TIME_CONTRACT_ID ? "" : key,
      contract_name: entry.contract_name || "Nieprzypisane",
      hours_total: 0,
      cost_total: 0,
      entries_count: 0,
    };

    current.hours_total += Number(entry.hours || 0);
    current.cost_total += Number(entry.cost_amount || 0);
    current.entries_count += 1;
    buckets.set(key, current);
  });

  return [...buckets.values()].sort((left, right) =>
    left.contract_name.localeCompare(right.contract_name, "pl", {
      sensitivity: "base",
      numeric: true,
    })
  );
}

export function buildContractOptions(args: {
  contracts: ContractRecord[];
  selectedMonth: HoursMonthRecord | null;
  currentEntry?: TimeEntryRecord | null;
}): HoursContractOption[] {
  const contractMap = new Map(args.contracts.map((contract) => [contract.id, contract]));
  const activeVisibleIds =
    args.selectedMonth?.visible_investments.filter((contractId) => {
      const contract = contractMap.get(contractId);
      return contract?.status !== "archived";
    }) ?? [];

  const options: HoursContractOption[] = [
    {
      id: UNASSIGNED_TIME_CONTRACT_ID,
      label: "Nieprzypisane",
      code: "N/P",
      status: "unassigned",
    },
    ...activeVisibleIds
      .map((contractId) => contractMap.get(contractId))
      .filter((contract): contract is ContractRecord => Boolean(contract))
      .map((contract) => ({
        id: contract.id,
        label: contract.name,
        code: contract.contract_number || "---",
        status: contract.status,
      })),
  ];

  const currentContractId = String(args.currentEntry?.contract_id || "").trim();
  if (currentContractId && !options.some((option) => option.id === currentContractId)) {
    const currentContract = contractMap.get(currentContractId);
    options.push({
      id: currentContractId,
      label: currentContract?.name || args.currentEntry?.contract_name || "Archiwalny kontrakt",
      code: currentContract?.contract_number || "---",
      status: currentContract?.status ?? "missing",
    });
  }

  return options;
}

export function findEmployeeRecord(
  employees: HoursEmployeeRecord[],
  employeeName: string,
  employeeId?: string | null
) {
  const normalizedId = String(employeeId || "").trim();
  if (normalizedId) {
    const byId = buildEmployeeRoster(employees).find(
      (employee) => String(employee.id || "").trim() === normalizedId
    );
    if (byId) return byId;
  }

  const normalized = String(employeeName || "").trim().toLowerCase();
  if (!normalized) return null;
  const matches = buildEmployeeRoster(employees).filter(
    (employee) => employee.name.toLowerCase() === normalized
  );

  if (matches.length === 1) {
    return matches[0];
  }

  return matches.find((employee) => employee.status !== "inactive") ?? matches[0] ?? null;
}

export function buildEntryDetails(args: {
  entry: TimeEntryRecord;
  employees: HoursEmployeeRecord[];
  contracts: ContractRecord[];
}): HoursEntryDetails {
  const employee = findEmployeeRecord(
    args.employees,
    args.entry.employee_name,
    args.entry.employee_id
  );
  const contract = args.contracts.find((item) => item.id === args.entry.contract_id) ?? null;
  const contractStatus = args.entry.contract_id
    ? contract?.status ?? "missing"
    : "unassigned";

  return {
    employeeName: args.entry.employee_name || "-",
    employeeCode: employee?.worker_code || "-",
    employeePosition: employee?.position || "-",
    contractLabel: args.entry.contract_name || contract?.name || "Nieprzypisane",
    contractStatus,
    contractCode: contract?.contract_number || (args.entry.contract_id ? "---" : "N/P"),
  };
}

export function buildContractBadgeLabel(status: HoursEntryDetails["contractStatus"]) {
  return formatContractStatusLabel(status);
}
