import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import type { ContractRecord } from "@/features/contracts/types";
import { getSelectedMonth } from "@/features/hours/mappers";
import type { HoursEmployeeRecord, HoursMonthRecord } from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";
import type { TimeEntryPayload } from "@/lib/api/time-entries";
import {
  formatHours,
  formatMonthLabel,
  formatNumber,
  formatWorkCardDayNumber,
  formatWorkCardUpdatedAt,
  formatWorkCardWeekdayLabel,
  parseDecimalInput,
} from "@/features/work-cards/formatters";
import type {
  WorkCardBootstrapData,
  WorkCardContractOption,
  WorkCardDayRecord,
  WorkCardDayViewModel,
  WorkCardEmployeeOption,
  WorkCardEntryRecord,
  WorkCardHistorySummary,
  WorkCardRecord,
  WorkCardStore,
  WorkCardSummaryCard,
} from "@/features/work-cards/types";

function normalizeName(value: string) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmployeeStatus(status: HoursEmployeeRecord["status"]) {
  return status === "inactive" ? "inactive" : "active";
}

export function mergeWorkCardEmployeeDirectory(args: {
  employeeDirectory: HoursEmployeeRecord[];
  historicalCards: WorkCardHistorySummary[];
}) {
  const employeesByKey = new Map<string, HoursEmployeeRecord>();

  args.employeeDirectory.forEach((employee, index) => {
    employeesByKey.set(buildWorkCardEmployeeKey(employee, index), employee);
  });

  args.historicalCards.forEach((card, index) => {
    const employeeName = String(card.employee_name || "").trim();
    const employeeId = String(card.employee_id || "").trim();
    if (!employeeName && !employeeId) {
      return;
    }

    const fallbackEmployee = {
      id: employeeId || undefined,
      name: employeeName,
      status: "active" as const,
    } satisfies HoursEmployeeRecord;
    const key = buildWorkCardEmployeeKey(
      fallbackEmployee,
      args.employeeDirectory.length + index
    );

    if (!employeesByKey.has(key)) {
      employeesByKey.set(key, fallbackEmployee);
    }
  });

  return [...employeesByKey.values()];
}

export function buildWorkCardEmployeeKey(
  employee: HoursEmployeeRecord,
  index: number
) {
  const employeeId = String(employee.id || "").trim();
  if (employeeId) {
    return `id:${employeeId}`;
  }

  return [
    "employee",
    normalizeName(employee.name || ""),
    String(employee.worker_code || "").trim().toLowerCase(),
    String(employee.position || "").trim().toLowerCase(),
    normalizeEmployeeStatus(employee.status),
    String(index),
  ].join("|");
}

export function buildWorkCardEmployeeOptions(
  employees: HoursEmployeeRecord[]
): WorkCardEmployeeOption[] {
  return employees
    .map((employee, index) => {
      const employeeId = String(employee.id || "").trim();
      const status = normalizeEmployeeStatus(employee.status);
      const workerCode = String(employee.worker_code || "").trim();
      const position = String(employee.position || "").trim() || "Bez stanowiska";
      const displayName = formatEmployeeDisplayName(employee, String(employee.name || "").trim());

      return {
        key: buildWorkCardEmployeeKey(employee, index),
        name: String(employee.name || "").trim(),
        label: displayName,
        description: `${position} | Kod ${formatEmployeeCodeLabel(workerCode)}`,
        status,
        employee: {
          ...employee,
          id: employeeId || undefined,
          name: String(employee.name || "").trim(),
          status,
        },
      } satisfies WorkCardEmployeeOption;
    })
    .filter((option) => option.name)
    .sort((left, right) =>
      `${left.label} ${left.employee.worker_code || ""} ${left.employee.id || ""}`.localeCompare(
        `${right.label} ${right.employee.worker_code || ""} ${right.employee.id || ""}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    );
}

export function findWorkCardEmployeeOption(
  employees: HoursEmployeeRecord[],
  employeeKey: string
) {
  const normalizedKey = String(employeeKey || "").trim();
  if (!normalizedKey) return null;
  return (
    buildWorkCardEmployeeOptions(employees).find((option) => option.key === normalizedKey) ??
    null
  );
}

function buildCardId(monthKey: string, employee: HoursEmployeeRecord) {
  const base = String(employee.id || employee.name || "employee")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `work-card-${monthKey}-${base || "employee"}`;
}

export function findWorkCard(
  store: WorkCardStore,
  monthKey: string,
  employeeName: string,
  employeeId?: string
) {
  const normalizedName = normalizeName(employeeName);
  const normalizedEmployeeId = String(employeeId || "").trim();

  return (
    store.cards.find((card) => {
      if (card.month_key !== monthKey) return false;

      const cardEmployeeId = String(card.employee_id || "").trim();
      if (normalizedEmployeeId && cardEmployeeId) {
        return cardEmployeeId === normalizedEmployeeId;
      }

      return normalizeName(card.employee_name) === normalizedName;
    }) ?? null
  );
}

export function upsertWorkCard(store: WorkCardStore, nextCard: WorkCardRecord): WorkCardStore {
  const nextCards = [...store.cards];
  const existingIndex = nextCards.findIndex((card) => card.id === nextCard.id);

  if (existingIndex >= 0) {
    nextCards.splice(existingIndex, 1, nextCard);
  } else {
    nextCards.push(nextCard);
  }

  nextCards.sort((left, right) => {
    if (left.month_key !== right.month_key) {
      return right.month_key.localeCompare(left.month_key);
    }
    return left.employee_name.localeCompare(right.employee_name, "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });

  return {
    version: 1,
    cards: nextCards,
  };
}

export function buildWorkCardContractOptions(args: {
  contracts: ContractRecord[];
  selectedMonth: HoursMonthRecord | null;
  card: WorkCardRecord | null;
}): WorkCardContractOption[] {
  const contractsById = new Map(args.contracts.map((contract) => [contract.id, contract]));
  const visibleContractIds = (args.selectedMonth?.visible_investments || []).filter((contractId) => {
    const contract = contractsById.get(contractId);
    return Boolean(contract && contract.status !== "archived");
  });

  const fallbackContractIds =
    visibleContractIds.length > 0
      ? visibleContractIds
      : args.contracts
          .filter((contract) => contract.status !== "archived")
          .map((contract) => contract.id);

  const primaryOptions = fallbackContractIds
    .map((contractId) => contractsById.get(contractId))
    .filter((contract): contract is ContractRecord => Boolean(contract))
    .sort((left, right) =>
      `${left.contract_number || ""} ${left.name}`.localeCompare(
        `${right.contract_number || ""} ${right.name}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((contract) => ({
      id: contract.id,
      label: contract.name,
      code: contract.contract_number || contract.name,
      status: contract.status,
    }));

  const extraOptions: WorkCardContractOption[] = [];

  args.card?.rows.forEach((row) => {
    row.entries.forEach((entry) => {
      const contractId = String(entry.contract_id || "").trim();
      if (!contractId) return;
      if (primaryOptions.some((option) => option.id === contractId)) return;
      if (extraOptions.some((option) => option.id === contractId)) return;

      const currentContract = contractsById.get(contractId);
      extraOptions.push({
        id: contractId,
        label: currentContract?.name || entry.contract_name || "Kontrakt spoza rejestru",
        code: currentContract?.contract_number || contractId,
        status: currentContract?.status ?? "missing",
      });
    });
  });

  return [
    ...primaryOptions,
    ...extraOptions,
    {
      id: UNASSIGNED_TIME_CONTRACT_ID,
      label: "Nieprzypisane",
      code: "N/P",
      status: "unassigned",
    },
  ];
}

export function buildWorkCardDraftRows(args: {
  monthKey: string;
  contractOptions: WorkCardContractOption[];
  card: WorkCardRecord | null;
}): WorkCardDayViewModel[] {
  const [yearRaw, monthRaw] = String(args.monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!year || !month) {
    return [];
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const rowsByDate = new Map(args.card?.rows.map((row) => [row.date, row]) || []);

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${args.monthKey}-${String(day).padStart(2, "0")}`;
    const parsedDate = new Date(year, month - 1, day);
    const existingRow = rowsByDate.get(date);
    const hoursByContract = args.contractOptions.reduce<Record<string, string>>((accumulator, option) => {
      const matchingEntry =
        existingRow?.entries.find((entry) => {
          const entryContractId = String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
          return entryContractId === option.id;
        }) ?? null;

      accumulator[option.id] =
        matchingEntry && Number(matchingEntry.hours || 0) > 0
          ? String(matchingEntry.hours)
          : "";
      return accumulator;
    }, {});

    const totalHours = (existingRow?.entries || []).reduce(
      (sum, entry) => sum + Number(entry.hours || 0),
      0
    );

    return {
      date,
      dayNumber: formatWorkCardDayNumber(date),
      weekdayLabel: formatWorkCardWeekdayLabel(date),
      isWeekend: parsedDate.getDay() === 0 || parsedDate.getDay() === 6,
      note: String(existingRow?.note || "").trim(),
      entries: existingRow?.entries || [],
      hoursByContract,
      totalHours,
    };
  });
}

export function serializeWorkCard(args: {
  rows: WorkCardDayViewModel[];
  employee: HoursEmployeeRecord;
  monthKey: string;
  monthLabel: string;
  contractOptions: WorkCardContractOption[];
  existingCard: WorkCardRecord | null;
}) {
  const optionsById = new Map(args.contractOptions.map((option) => [option.id, option]));

  const rows: WorkCardDayRecord[] = args.rows
    .map((row) => {
      const entries: WorkCardEntryRecord[] = Object.entries(row.hoursByContract)
        .map(([contractId, value]) => {
          const hours = parseDecimalInput(value);
          if (!hours || hours <= 0) return null;

          const option = optionsById.get(contractId);
          if (!option) return null;

          return {
            id: `${row.date}:${contractId}`,
            contract_id: contractId === UNASSIGNED_TIME_CONTRACT_ID ? "" : contractId,
            contract_name: option.label,
            hours,
          };
        })
        .filter((entry): entry is WorkCardEntryRecord => Boolean(entry));

      if (entries.length === 0 && !row.note.trim()) {
        return null;
      }

      return {
        date: row.date,
        note: row.note.trim(),
        entries,
      };
    })
    .filter((row): row is WorkCardDayRecord => Boolean(row));

  return {
    id: args.existingCard?.id || buildCardId(args.monthKey, args.employee),
    employee_id: String(args.employee.id || "").trim(),
    employee_name: args.employee.name,
    month_key: args.monthKey,
    month_label: args.monthLabel || formatMonthLabel(args.monthKey),
    updated_at: new Date().toISOString(),
    rows,
  } satisfies WorkCardRecord;
}

export function buildWorkCardSummaryCards(args: {
  rows: WorkCardDayViewModel[];
  contractOptions: WorkCardContractOption[];
  card: WorkCardRecord | null;
}): WorkCardSummaryCard[] {
  const totalHours = args.rows.reduce((sum, row) => sum + row.totalHours, 0);
  const filledDays = args.rows.filter((row) => row.totalHours > 0).length;
  const usedContracts = new Set<string>();

  args.rows.forEach((row) => {
    Object.entries(row.hoursByContract).forEach(([contractId, value]) => {
      if (parseDecimalInput(value) > 0) {
        usedContracts.add(contractId);
      }
    });
  });

  return [
    {
      id: "days",
      label: "Dni miesiaca",
      value: formatNumber(args.rows.length),
    },
    {
      id: "filled-days",
      label: "Dni z godzinami",
      value: formatNumber(filledDays),
    },
    {
      id: "hours",
      label: "Laczne godziny",
      value: formatHours(totalHours),
      accent: true,
    },
    {
      id: "contracts",
      label: "Kontrakty w uzyciu",
      value: formatNumber(usedContracts.size),
    },
    {
      id: "updated-at",
      label: "Ostatni zapis",
      value: formatWorkCardUpdatedAt(args.card?.updated_at || ""),
    },
  ];
}

export function buildWorkCardContractTotals(
  rows: WorkCardDayViewModel[],
  contractOptions: WorkCardContractOption[]
) {
  const totals = new Map(contractOptions.map((option) => [option.id, 0]));

  rows.forEach((row) => {
    Object.entries(row.hoursByContract).forEach(([contractId, value]) => {
      totals.set(contractId, (totals.get(contractId) || 0) + parseDecimalInput(value));
    });
  });

  return totals;
}

export function buildWorkCardSyncPayloads(args: {
  card: WorkCardRecord;
  employee: HoursEmployeeRecord;
}) {
  const aggregates = new Map<string, TimeEntryPayload>();

  args.card.rows.forEach((row) => {
    row.entries.forEach((entry) => {
      const contractKey = String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
      const existing = aggregates.get(contractKey) || {
        month_key: args.card.month_key,
        employee_id: String(args.employee.id || "").trim(),
        employee_name: args.employee.name,
        contract_id: contractKey === UNASSIGNED_TIME_CONTRACT_ID ? "" : contractKey,
        contract_name: entry.contract_name || "Nieprzypisane",
        hours: 0,
      };

      existing.hours += Number(entry.hours || 0);
      aggregates.set(contractKey, existing);
    });
  });

  return [...aggregates.values()].filter((payload) => payload.hours > 0);
}

export function buildWorkCardBootstrapSelection(bootstrap: WorkCardBootstrapData) {
  const selectedMonth =
    getSelectedMonth(bootstrap.months, bootstrap.selectedMonthKey) ?? bootstrap.months[0] ?? null;
  const employeeOptions = buildWorkCardEmployeeOptions(bootstrap.employees);
  const selectedEmployee =
    employeeOptions.find((option) => option.key === bootstrap.selectedEmployeeKey) ??
    employeeOptions.find((option) => option.status !== "inactive") ??
    employeeOptions[0] ??
    null;

  return {
    monthKey: selectedMonth?.month_key || "",
    employeeKey: selectedEmployee?.key || "",
  };
}
