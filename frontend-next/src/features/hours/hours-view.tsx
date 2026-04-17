"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import type { ContractRecord } from "@/features/contracts/types";
import {
  fetchHoursContracts,
  fetchHoursData,
  fetchHoursEmployeeDirectory,
  findHoursEntryById,
  removeHoursEntry,
  removeHoursMonth,
  saveHoursEntry,
  saveHoursMonth,
} from "@/features/hours/api";
import {
  formatContractStatusLabel,
  formatHours,
  HOURS_FINANCE_FIELDS,
  formatMonthLabel,
  formatMoney,
  formatNumber,
  parseDecimalInput,
} from "@/features/hours/formatters";
import {
  buildContractAggregates,
  buildContractOptions,
  buildEmployeeRoster,
  buildFinanceDraft,
  buildMonthOptions,
  buildSummaryCards,
  findEmployeeRecord,
  getMonthEntries,
  getSelectedMonth,
  normalizeFinanceDraft,
} from "@/features/hours/mappers";
import type {
  HoursBootstrapData,
  HoursContractAggregate,
  HoursContractOption,
  HoursEmployeeRecord,
  HoursEntryDetails,
  HoursEntryFormValues,
  HoursFinanceDraft,
  HoursListResponse,
  TimeEntryRecord,
} from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";

type HoursState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: HoursListResponse };

type HoursEmployeeContractCell = {
  key: string;
  label: string;
  code: string;
  status: HoursEntryDetails["contractStatus"];
  hours: number;
  cost: number;
  entriesCount: number;
};

type HoursEmployeeRow = {
  key: string;
  index: number;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  employeePosition: string;
  employeeStatus: HoursEmployeeRecord["status"];
  contracts: HoursEmployeeContractCell[];
  totalHours: number;
  totalCost: number;
  entriesCount: number;
};

type HoursContractSummaryRow = {
  index: number;
  aggregate: HoursContractAggregate;
  option: HoursContractOption;
};

const emptyEntryFormValues: HoursEntryFormValues = {
  employee_name: "",
  contract_id: UNASSIGNED_TIME_CONTRACT_ID,
  hours: "",
};

function hasWriteAccess(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "kierownik";
}

function buildMonthKey(year: string, month: string) {
  const normalizedYear = String(year || "").trim();
  const normalizedMonth = String(month || "").trim();

  if (!/^\d{4}$/.test(normalizedYear)) return "";
  if (!/^(0[1-9]|1[0-2])$/.test(normalizedMonth)) return "";

  return `${normalizedYear}-${normalizedMonth}`;
}

function buildHoursEmployeeRows(args: {
  entries: TimeEntryRecord[];
  historicalEmployees: HoursEmployeeRecord[];
  contracts: ContractRecord[];
  search: string;
}): HoursEmployeeRow[] {
  const buckets = new Map<string, Omit<HoursEmployeeRow, "index">>();
  const contractDirectory = new Map(args.contracts.map((contract) => [contract.id, contract]));

  args.entries.forEach((entry) => {
    const employee = findEmployeeRecord(
      args.historicalEmployees,
      entry.employee_name,
      entry.employee_id
    );
    const employeeId = String(entry.employee_id || employee?.id || "").trim();
    const employeeName = String(entry.employee_name || employee?.name || "").trim() || "Nieznany pracownik";
    const employeeCode = String(employee?.worker_code || "").trim() || "—";
    const employeePosition = String(employee?.position || "").trim() || "Bez stanowiska";
    const employeeStatus = employee?.status ?? "active";
    const rowKey = employeeId
      ? `id:${employeeId}`
      : [
          "name",
          employeeName.toLowerCase(),
          employeeCode.toLowerCase(),
          employeePosition.toLowerCase(),
        ].join("|");
    const contractKey = String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
    const contractDirectoryItem = contractDirectory.get(String(entry.contract_id || "").trim()) ?? null;
    const contractStatus = entry.contract_id
      ? contractDirectoryItem?.status ?? "missing"
      : "unassigned";

    const current =
      buckets.get(rowKey) ??
      {
        key: rowKey,
        employeeId,
        employeeName,
        employeeCode,
        employeePosition,
        employeeStatus,
        contracts: [],
        totalHours: 0,
        totalCost: 0,
        entriesCount: 0,
      };

    const existingContract = current.contracts.find((item) => item.key === contractKey);

    if (existingContract) {
      existingContract.hours += Number(entry.hours || 0);
      existingContract.cost += Number(entry.cost_amount || 0);
      existingContract.entriesCount += 1;
    } else {
      current.contracts.push({
        key: contractKey,
        label: entry.contract_name || contractDirectoryItem?.name || "Nieprzypisane",
        code: contractDirectoryItem?.contract_number || (entry.contract_id ? "---" : "N/P"),
        status: contractStatus,
        hours: Number(entry.hours || 0),
        cost: Number(entry.cost_amount || 0),
        entriesCount: 1,
      });
    }

    current.totalHours += Number(entry.hours || 0);
    current.totalCost += Number(entry.cost_amount || 0);
    current.entriesCount += 1;
    buckets.set(rowKey, current);
  });

  const searchTerm = String(args.search || "").trim().toLowerCase();

  return [...buckets.values()]
    .map((row) => ({
      ...row,
      contracts: [...row.contracts].sort((left, right) =>
        left.label.localeCompare(right.label, "pl", {
          sensitivity: "base",
          numeric: true,
        })
      ),
    }))
    .filter((row) => {
      if (!searchTerm) return true;
      const haystack = [
        row.employeeName,
        row.employeeCode,
        row.employeePosition,
        ...row.contracts.flatMap((contract) => [contract.label, contract.code]),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchTerm);
    })
    .sort((left, right) =>
      `${left.employeeName} ${left.employeeId}`.localeCompare(
        `${right.employeeName} ${right.employeeId}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((row, index) => ({
      ...row,
      index: index + 1,
    }));
}

const hoursTableColumns = (handlers: {
  canWrite: boolean;
  onOpenCorrection: (row: HoursEmployeeRow) => void;
}): Array<DataTableColumn<HoursEmployeeRow>> => [
  {
    key: "lp",
    header: "Lp.",
    className: "hours-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index,
  },
  {
    key: "employee",
    header: "Pracownik",
    className: "hours-col-employee",
    sortValue: (row) => `${row.employeeName} ${row.employeeCode} ${row.employeePosition}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.employeeName}</span>
        <span className="data-table__secondary">
          {row.employeePosition} • Kod: {row.employeeCode}
        </span>
        {row.employeeStatus === "inactive" ? (
          <span className="data-table__status-pill data-table__status-pill--muted">
            Historia • nieaktywny
          </span>
        ) : null}
      </div>
    ),
  },
  {
    key: "contracts",
    header: "Kontrakty i godziny",
    className: "hours-col-contracts",
    sortValue: (row) => row.contracts.map((contract) => contract.label).join(" "),
    render: (row) => (
      <div className="hours-contract-list">
        {row.contracts.map((contract) => (
          <div
            key={contract.key}
            className={
              contract.status === "active"
                ? "hours-contract-pill"
                : "hours-contract-pill hours-contract-pill--muted"
            }
          >
            <span className="hours-contract-pill__name">{contract.label}</span>
            <span className="hours-contract-pill__meta">
              {contract.code} • {formatHours(contract.hours)}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "hours",
    header: "Suma godzin",
    className: "data-table__numeric hours-col-hours",
    sortValue: (row) => row.totalHours,
    render: (row) => formatHours(row.totalHours),
  },
  {
    key: "cost",
    header: "Koszt",
    className: "data-table__numeric hours-col-money",
    sortValue: (row) => row.totalCost,
    render: (row) => formatMoney(row.totalCost),
  },
  {
    key: "actions",
    header: "Akcje",
    className: "hours-col-actions",
    sortable: false,
    render: (row) =>
      handlers.canWrite ? (
        <div className="contracts-table__actions-stack">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              handlers.onOpenCorrection(row);
            }}
          >
            {row.employeeStatus === "inactive" ? "Historia" : "Korekta"}
          </ActionButton>
        </div>
      ) : (
        <span className="data-table__secondary">Podgląd</span>
      ),
  },
];

const contractSummaryColumns: Array<DataTableColumn<HoursContractSummaryRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "hours-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index,
  },
  {
    key: "contract",
    header: "Kontrakt",
    className: "hours-col-contract",
    sortValue: (row) => `${row.option.label} ${row.option.code}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.option.label}</span>
        <span className="data-table__secondary">ID: {row.option.code}</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "hours-col-status",
    sortValue: (row) => row.option.status,
    render: (row) => (
      <span
        className={
          row.option.status === "active"
            ? "data-table__status-pill"
            : "data-table__status-pill data-table__status-pill--muted"
        }
      >
        {formatContractStatusLabel(row.option.status)}
      </span>
    ),
  },
  {
    key: "entries",
    header: "Wpisy",
    className: "data-table__numeric hours-col-count",
    sortValue: (row) => row.aggregate.entries_count,
    render: (row) => formatNumber(row.aggregate.entries_count),
  },
  {
    key: "hours",
    header: "Godziny",
    className: "data-table__numeric hours-col-hours",
    sortValue: (row) => row.aggregate.hours_total,
    render: (row) => formatHours(row.aggregate.hours_total),
  },
  {
    key: "cost",
    header: "Koszt",
    className: "data-table__numeric hours-col-money",
    sortValue: (row) => row.aggregate.cost_total,
    render: (row) => formatMoney(row.aggregate.cost_total),
  },
];

export function HoursView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: HoursBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = hasWriteAccess(user?.role);
  const [contracts, setContracts] = useState<ContractRecord[]>(initialBootstrap?.contracts ?? []);
  const [employees, setEmployees] = useState<HoursEmployeeRecord[]>(initialBootstrap?.employees ?? []);
  const [historicalEmployees, setHistoricalEmployees] = useState<HoursEmployeeRecord[]>(
    initialBootstrap?.historicalEmployees ?? initialBootstrap?.employees ?? []
  );
  const [state, setState] = useState<HoursState>(() => {
    if (initialBootstrap?.payload) {
      return { status: "success", data: initialBootstrap.payload };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialBootstrap?.selectedMonthKey ?? "");
  const [search, setSearch] = useState("");
  const [selectedEmployeeRowKey, setSelectedEmployeeRowKey] = useState<string | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entryFormValues, setEntryFormValues] = useState<HoursEntryFormValues>(emptyEntryFormValues);
  const [monthContractIds, setMonthContractIds] = useState<string[]>([]);
  const [financeDraft, setFinanceDraft] = useState<HoursFinanceDraft>(buildFinanceDraft(null));
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [monthStatus, setMonthStatus] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showMonthSettings, setShowMonthSettings] = useState(false);
  const [showManualCorrection, setShowManualCorrection] = useState(false);
  const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
  const [newMonthNumber, setNewMonthNumber] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));

  async function reloadHours(options?: {
    preserveState?: boolean;
    refreshRelations?: boolean;
    preferredMonthKey?: string | null;
  }) {
    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const [payload, nextContracts, nextHistoricalEmployees] = await Promise.all([
        fetchHoursData(),
        options?.refreshRelations ? fetchHoursContracts() : Promise.resolve(contracts),
        options?.refreshRelations
          ? fetchHoursEmployeeDirectory()
          : Promise.resolve(historicalEmployees),
      ]);

      if (options?.refreshRelations) {
        setContracts(nextContracts);
        setHistoricalEmployees(nextHistoricalEmployees);
        setEmployees(nextHistoricalEmployees.filter((employee) => employee.status !== "inactive"));
      }

      const fallbackMonthKey =
        payload.months.find((month) => month.selected)?.month_key ||
        payload.months[0]?.month_key ||
        "";
      const nextMonthKey =
        options?.preferredMonthKey &&
        payload.months.some((month) => month.month_key === options.preferredMonthKey)
          ? options.preferredMonthKey
          : payload.months.some((month) => month.month_key === selectedMonthKey)
            ? selectedMonthKey
            : fallbackMonthKey;

      setState({ status: "success", data: payload });
      setSelectedMonthKey(nextMonthKey);
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać ewidencji czasu pracy.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const shouldUseInitialData = Boolean(initialBootstrap?.payload);
    if (shouldUseInitialData) {
      return;
    }

    void reloadHours({ refreshRelations: true });
  }, [initialBootstrap, initialError]);

  const roster = useMemo(() => buildEmployeeRoster(employees), [employees]);

  const selectedMonth = useMemo(() => {
    if (state.status !== "success") return null;
    return getSelectedMonth(state.data.months, selectedMonthKey);
  }, [selectedMonthKey, state]);

  const monthEntries = useMemo(() => {
    if (state.status !== "success") return [];
    return getMonthEntries(state.data.entries, selectedMonthKey);
  }, [selectedMonthKey, state]);

  const summaryCards = useMemo(
    () => buildSummaryCards(monthEntries, selectedMonth),
    [monthEntries, selectedMonth]
  );

  const contractOptions = useMemo(
    () =>
      buildContractOptions({
        contracts,
        selectedMonth,
        currentEntry: findHoursEntryById(monthEntries, editingEntryId),
      }),
    [contracts, editingEntryId, monthEntries, selectedMonth]
  );

  const hoursRows = useMemo<HoursEmployeeRow[]>(
    () =>
      buildHoursEmployeeRows({
        entries: monthEntries,
        historicalEmployees,
        contracts,
        search,
      }),
    [contracts, historicalEmployees, monthEntries, search]
  );
  const inactiveHistoryRowsCount = useMemo(
    () => hoursRows.filter((row) => row.employeeStatus === "inactive").length,
    [hoursRows]
  );

  const selectedEntry = useMemo(
    () => findHoursEntryById(monthEntries, selectedEntryId),
    [monthEntries, selectedEntryId]
  );

  const selectedEmployeeRow = useMemo(
    () => hoursRows.find((row) => row.key === selectedEmployeeRowKey) ?? null,
    [hoursRows, selectedEmployeeRowKey]
  );
  const selectedEmployeeAllowsNewEntries = selectedEmployeeRow?.employeeStatus !== "inactive";

  const editingEntry = useMemo(
    () => findHoursEntryById(monthEntries, editingEntryId),
    [editingEntryId, monthEntries]
  );

  const activeEmployeeId = useMemo(() => {
    const candidate = editingEntry?.employee_id || selectedEmployeeRow?.employeeId || "";
    return String(candidate || "").trim();
  }, [editingEntry, selectedEmployeeRow]);

  const activeEmployeeName = useMemo(() => {
    const candidate =
      entryFormValues.employee_name ||
      editingEntry?.employee_name ||
      selectedEmployeeRow?.employeeName ||
      selectedEntry?.employee_name ||
      "";
    return String(candidate).trim();
  }, [editingEntry, entryFormValues.employee_name, selectedEmployeeRow, selectedEntry]);
  const activeEmployeeAllowsNewEntries = useMemo(
    () => roster.some((employee) => employee.name === activeEmployeeName),
    [activeEmployeeName, roster]
  );

  const employeeEntries = useMemo(() => {
    if (!activeEmployeeId && !activeEmployeeName) return [];
    const normalizedId = activeEmployeeId.toLowerCase();
    const normalizedName = activeEmployeeName.toLowerCase();

    return monthEntries
      .filter((entry) => {
        const entryEmployeeId = String(entry.employee_id || "").trim().toLowerCase();
        if (normalizedId) {
          return entryEmployeeId === normalizedId;
        }

        return String(entry.employee_name || "").trim().toLowerCase() === normalizedName;
      })
      .sort((left, right) =>
        (left.contract_name || "Nieprzypisane").localeCompare(
          right.contract_name || "Nieprzypisane",
          "pl",
          { sensitivity: "base", numeric: true }
        )
      );
  }, [activeEmployeeId, activeEmployeeName, monthEntries]);

  const employeeHoursTotal = useMemo(
    () => employeeEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    [employeeEntries]
  );

  const employeeContractsCount = useMemo(
    () =>
      new Set(
        employeeEntries.map((entry) => String(entry.contract_id || UNASSIGNED_TIME_CONTRACT_ID).trim() || UNASSIGNED_TIME_CONTRACT_ID)
      ).size,
    [employeeEntries]
  );

  const contractSummaryRows = useMemo<HoursContractSummaryRow[]>(
    () =>
      buildContractAggregates(monthEntries).map((aggregate, index) => {
        const option =
          contractOptions.find((item) => item.id === (aggregate.contract_id || UNASSIGNED_TIME_CONTRACT_ID)) ?? {
            id: aggregate.contract_id || UNASSIGNED_TIME_CONTRACT_ID,
            label: aggregate.contract_name || "Nieprzypisane",
            code: aggregate.contract_id ? "---" : "N/P",
            status: aggregate.contract_id ? "missing" : "unassigned",
          };

        return {
          index: index + 1,
          aggregate,
          option,
        };
      }),
    [contractOptions, monthEntries]
  );

  useEffect(() => {
    if (!selectedMonth) {
      setMonthContractIds([]);
      setFinanceDraft(buildFinanceDraft(null));
      return;
    }

    setMonthContractIds(selectedMonth.visible_investments || []);
    setFinanceDraft(buildFinanceDraft(selectedMonth));
  }, [selectedMonth]);

  useEffect(() => {
    setSelectedEntryId((current) => {
      if (current && monthEntries.some((entry) => entry.id === current)) {
        return current;
      }
      return null;
    });
  }, [monthEntries]);

  useEffect(() => {
    setSelectedEmployeeRowKey((current) => {
      if (current && hoursRows.some((row) => row.key === current)) {
        return current;
      }
      return hoursRows[0]?.key ?? null;
    });
  }, [hoursRows]);

  useEffect(() => {
    if (editingEntry && editingEntry.contract_id) {
      return;
    }

    if (!editingEntry && entryFormValues.contract_id !== UNASSIGNED_TIME_CONTRACT_ID) {
      const currentContractStillVisible = contractOptions.some(
        (option) => option.id === entryFormValues.contract_id
      );
      if (!currentContractStillVisible) {
        setEntryFormValues((current) => ({
          ...current,
          contract_id: monthContractIds[0] || UNASSIGNED_TIME_CONTRACT_ID,
        }));
      }
    }
  }, [contractOptions, editingEntry, entryFormValues.contract_id, monthContractIds]);

  function resetEntryForm(
    entry: TimeEntryRecord | null = null,
    options?: { preservedEmployeeName?: string }
  ) {
    setEditingEntryId(entry?.id ?? null);
    setEntryFormValues(
      entry
        ? {
            employee_name: entry.employee_name,
            contract_id: entry.contract_id || UNASSIGNED_TIME_CONTRACT_ID,
            hours: String(entry.hours ?? 0),
          }
        : {
            employee_name: options?.preservedEmployeeName ?? "",
            contract_id: monthContractIds[0] || UNASSIGNED_TIME_CONTRACT_ID,
            hours: "",
          }
    );
    setFormError(null);
    setFormStatus(null);
  }

  function handleStartNewEntryForEmployee(employeeName?: string | null) {
    const preferredEmployeeName = String(
      employeeName || activeEmployeeName || selectedEmployeeRow?.employeeName || ""
    ).trim();
    const canPrefillEmployee =
      preferredEmployeeName.length > 0 &&
      roster.some((employee) => employee.name === preferredEmployeeName);

    setShowManualCorrection(true);
    setSelectedEntryId(null);
    resetEntryForm(null, {
      preservedEmployeeName: canPrefillEmployee ? preferredEmployeeName : "",
    });
  }

  function handleEditEntry(entry: TimeEntryRecord) {
    setShowManualCorrection(true);
    setSelectedEntryId(entry.id);
    const matchingRow =
      hoursRows.find((row) =>
        entry.employee_id
          ? String(row.employeeId || "").trim() === String(entry.employee_id || "").trim()
          : row.employeeName === entry.employee_name
      ) ?? null;
    setSelectedEmployeeRowKey(matchingRow?.key ?? null);
    resetEntryForm(entry);
  }

  async function handleDeleteEntry(entry: TimeEntryRecord) {
    if (!canWrite) return;
    if (
      !window.confirm(
        `Czy na pewno chcesz usunąć wpis ${entry.employee_name} / ${entry.contract_name || "Nieprzypisane"}?`
      )
    ) {
      return;
    }

    try {
      await removeHoursEntry(entry.id);
      if (selectedEntryId === entry.id) {
        setSelectedEntryId(null);
      }
      if (editingEntryId === entry.id) {
        resetEntryForm(null, { preservedEmployeeName: entry.employee_name });
      }
      await reloadHours({ preserveState: true, preferredMonthKey: selectedMonthKey });
      setFormStatus("Wpis czasu pracy został usunięty.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się usunąć wpisu czasu pracy."
      );
    }
  }

  async function handleSaveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormStatus(null);

    if (!canWrite) {
      setFormError("Masz dostęp tylko do podglądu ewidencji czasu pracy.");
      return;
    }

    if (!selectedMonthKey) {
      setFormError("Najpierw wybierz miesiąc.");
      return;
    }

    const employeeName = String(entryFormValues.employee_name || "").trim();
    if (!employeeName) {
      setFormError("Wybierz pracownika.");
      return;
    }

    const employee = findEmployeeRecord(
      editingEntry ? historicalEmployees : roster,
      employeeName,
      editingEntry?.employee_id
    );
    if (!employee) {
      setFormError("Wybierz pracownika z kartoteki.");
      return;
    }

    if ((employee.status ?? "active") === "inactive" && !editingEntryId) {
      setFormError("Nie można dodać wpisu dla nieaktywnego pracownika.");
      return;
    }

    const hoursValue = parseDecimalInput(entryFormValues.hours);
    if (!hoursValue || hoursValue <= 0) {
      setFormError("Podaj liczbę godzin większą od zera.");
      return;
    }

    const contractId =
      entryFormValues.contract_id === UNASSIGNED_TIME_CONTRACT_ID
        ? ""
        : entryFormValues.contract_id;
    const contract = contracts.find((item) => item.id === contractId) ?? null;

    if (contract && contract.status === "archived") {
      setFormError("Nie można przypisać godzin do zarchiwizowanego kontraktu.");
      return;
    }

    setIsSubmitting(true);

    try {
      const savedEntry = await saveHoursEntry(editingEntryId, {
        month_key: selectedMonthKey,
        employee_id: employee.id || editingEntry?.employee_id || "",
        employee_name: employee.name,
        contract_id: contract?.id || "",
        contract_name: contract?.name || "Nieprzypisane",
        hours: hoursValue,
      });

      setSelectedEmployeeRowKey(
        savedEntry.employee_id
          ? `id:${String(savedEntry.employee_id || "").trim()}`
          : `name:${String(savedEntry.employee_name || "").trim().toLowerCase()}`
      );
      await reloadHours({ preserveState: true, preferredMonthKey: selectedMonthKey });
      setSelectedEntryId(savedEntry.id);
      handleStartNewEntryForEmployee(employee.name);
      setFormStatus(
        editingEntryId ? "Zapisano zmiany wpisu czasu pracy." : "Dodano nowy wpis czasu pracy."
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zapisać wpisu czasu pracy."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSaveMonthSettings() {
    if (!canWrite || !selectedMonth) return;

    setMonthError(null);
    setMonthStatus(null);

    try {
      await saveHoursMonth(selectedMonth.month_key, {
        month_key: selectedMonth.month_key,
        month_label: selectedMonth.month_label || formatMonthLabel(selectedMonth.month_key),
        selected: true,
        visible_investments: monthContractIds,
        finance: normalizeFinanceDraft(financeDraft),
      });
      await reloadHours({ preserveState: true, preferredMonthKey: selectedMonth.month_key });
      setMonthStatus("Zapisano ustawienia miesiąca.");
    } catch (error) {
      setMonthError(
        error instanceof Error ? error.message : "Nie udało się zapisać ustawień miesiąca."
      );
    }
  }

  async function handleSelectMonth(nextMonthKey: string) {
    setSelectedMonthKey(nextMonthKey);
    setMonthError(null);
    setMonthStatus(null);
    setFormError(null);
    setFormStatus(null);

    if (!canWrite || state.status !== "success") {
      return;
    }

    const currentMonth = selectedMonth;
    const nextMonth = state.data.months.find((month) => month.month_key === nextMonthKey) ?? null;

    if (!nextMonth || currentMonth?.month_key === nextMonthKey) {
      return;
    }

    try {
      const requests = [];

      if (currentMonth) {
        requests.push(
          saveHoursMonth(currentMonth.month_key, {
            month_key: currentMonth.month_key,
            month_label: currentMonth.month_label || formatMonthLabel(currentMonth.month_key),
            selected: false,
            visible_investments: currentMonth.visible_investments || [],
            finance: currentMonth.finance,
          })
        );
      }

      requests.push(
        saveHoursMonth(nextMonth.month_key, {
          month_key: nextMonth.month_key,
          month_label: nextMonth.month_label || formatMonthLabel(nextMonth.month_key),
          selected: true,
          visible_investments: nextMonth.visible_investments || [],
          finance: nextMonth.finance,
        })
      );

      await Promise.all(requests);
      await reloadHours({ preserveState: true, preferredMonthKey: nextMonthKey });
    } catch {
      // Keep optimistic local month selection even if persistence of the selected flag fails.
    }
  }

  async function handleCreateMonth() {
    if (!canWrite) return;
    const nextMonthKey = buildMonthKey(newMonthYear, newMonthNumber);
    if (!nextMonthKey) {
      setMonthError("Podaj poprawny rok i miesiąc nowego zestawienia.");
      return;
    }

    setMonthError(null);
    setMonthStatus(null);

    try {
      await saveHoursMonth(null, {
        month_key: nextMonthKey,
        month_label: formatMonthLabel(nextMonthKey),
        selected: true,
        visible_investments: [],
        finance: normalizeFinanceDraft(buildFinanceDraft(null)),
      });
      await reloadHours({ preserveState: true, preferredMonthKey: nextMonthKey });
      setSelectedMonthKey(nextMonthKey);
      setMonthStatus(`Dodano miesiąc ${formatMonthLabel(nextMonthKey)}.`);
    } catch (error) {
      setMonthError(
        error instanceof Error ? error.message : "Nie udało się dodać miesiąca."
      );
    }
  }

  async function handleDeleteMonth() {
    if (!canWrite || !selectedMonth) return;
    if (!window.confirm(`Czy na pewno chcesz usunąć miesiąc ${selectedMonth.month_label}?`)) {
      return;
    }

    setMonthError(null);
    setMonthStatus(null);

    try {
      await removeHoursMonth(selectedMonth.month_key);
      await reloadHours({ preserveState: true });
      setMonthStatus(`Usunięto miesiąc ${selectedMonth.month_label}.`);
    } catch (error) {
      setMonthError(
        error instanceof Error ? error.message : "Nie udało się usunąć miesiąca."
      );
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Godziny" title="Ewidencja czasu pracy" />
        <div className="module-page__stats module-page__stats--compact">
          {Array.from({ length: 6 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Ewidencja czasu pracy">
          <p className="status-message">Ładuję miesiące, wpisy i relacje kontraktów.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Godziny"
          title="Ewidencja czasu pracy"
          actions={
            <ActionButton
              type="button"
              onClick={() => void reloadHours({ refreshRelations: true })}
            >
              Spróbuj ponownie
            </ActionButton>
          }
        />
        <Panel title="Błąd odczytu">
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <p className="status-message">
              Sprawdź sesję lub dostępność backendu, a potem odśwież ekran.
            </p>
          </div>
        </Panel>
      </div>
    );
  }

  const monthOptions = buildMonthOptions(state.data.months);
  const activeContracts = contracts
    .filter((contract) => contract.status !== "archived")
    .sort((left, right) =>
      left.name.localeCompare(right.name, "pl", { sensitivity: "base", numeric: true })
    );

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Godziny"
        title="Ewidencja czasu pracy"
        actions={
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => void reloadHours({ preserveState: true, refreshRelations: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
          </ActionButton>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.map((card) => (
          <StatCard
            key={card.id}
            label={card.label}
            value={card.value}
            accent={card.accent}
          />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="hours-toolbar">
          <label className="form-field">
            <span>Miesiąc roboczy</span>
            <select
              value={selectedMonthKey}
              onChange={(event) => void handleSelectMonth(event.target.value)}
              className="select-field"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Szukaj pracownika lub kontraktu</span>
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pracownik lub kontrakt"
              aria-label="Szukaj pracowników i kontraktów w ewidencji czasu pracy"
            />
          </label>

          <div className="hours-toolbar__actions">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => setShowMonthSettings((current) => !current)}
            >
              {showMonthSettings ? "Ukryj ustawienia miesiąca" : "Ustawienia miesiąca"}
            </ActionButton>
          </div>
        </div>

        {monthError ? <p className="status-message status-message--error">{monthError}</p> : null}
        {monthStatus ? <p className="status-message status-message--success">{monthStatus}</p> : null}
      </Panel>

      <Panel className="panel--toolbar panel--info">
        <div className="hours-info-panel">
          <div className="data-table__stack">
            <span className="data-table__primary">Nowe operacje działają tylko na aktywnych pracownikach</span>
            <span className="data-table__secondary">
              Nowe wpisy korzystają z aktywnej kartoteki. Nieaktywni zostają tylko w historii miesiąca.
            </span>
          </div>
          <div className="hours-runtime-legend">
            <span className="hours-runtime-legend__item">
              <strong>{formatNumber(employees.length)}</strong>
              <span>aktywni do operacji</span>
            </span>
            <span className="hours-runtime-legend__item hours-runtime-legend__item--muted">
              <strong>{formatNumber(inactiveHistoryRowsCount)}</strong>
              <span>nieaktywni tylko w historii</span>
            </span>
          </div>
        </div>
      </Panel>

      {selectedMonth ? (
        <div className="hours-layout">
          <div className="module-page__stack">
            {showMonthSettings ? (
              <Panel title="Ustawienia miesiąca">
                <div className="hours-month-meta">
                  <div className="data-table__stack">
                    <span className="data-table__primary">{selectedMonth.month_label}</span>
                    <span className="data-table__secondary">
                      Aktywne kontrakty: {formatNumber(monthContractIds.length)}
                    </span>
                  </div>
                </div>

                <div className="hours-settings-grid">
                  <div className="hours-settings-block">
                    <p className="panel__title">Operacje na miesiącu</p>
                    <div className="hours-inline-controls">
                      <select
                        value={newMonthNumber}
                        onChange={(event) => setNewMonthNumber(event.target.value)}
                        className="select-field"
                      >
                        {Array.from({ length: 12 }, (_, index) => {
                          const value = String(index + 1).padStart(2, "0");
                          return (
                            <option key={value} value={value}>
                              {value}
                            </option>
                          );
                        })}
                      </select>
                      <input
                        className="text-input"
                        inputMode="numeric"
                        value={newMonthYear}
                        onChange={(event) => setNewMonthYear(event.target.value)}
                        placeholder="Rok"
                      />
                      <ActionButton
                        type="button"
                        variant="secondary"
                        onClick={() => void handleCreateMonth()}
                        disabled={!canWrite}
                      >
                        Dodaj miesiąc
                      </ActionButton>
                    </div>

                    <FormGrid columns={4}>
                      {HOURS_FINANCE_FIELDS.map((field) => (
                        <label key={field.key} className="form-field">
                          <span>{field.label}</span>
                          <input
                            className="text-input"
                            inputMode="decimal"
                            value={financeDraft[field.key]}
                            onChange={(event) =>
                              setFinanceDraft((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                            disabled={!canWrite}
                          />
                        </label>
                      ))}
                    </FormGrid>
                  </div>

                  <div className="hours-settings-block">
                    <p className="panel__title">Aktywne kontrakty w miesiącu</p>
                    <div className="hours-contract-checklist">
                      {activeContracts.map((contract) => (
                        <label key={contract.id} className="hours-contract-checklist__item">
                          <input
                            type="checkbox"
                            checked={monthContractIds.includes(contract.id)}
                            onChange={(event) =>
                              setMonthContractIds((current) =>
                                event.target.checked
                                  ? Array.from(new Set([...current, contract.id]))
                                  : current.filter((item) => item !== contract.id)
                              )
                            }
                            disabled={!canWrite}
                          />
                          <div className="data-table__stack">
                            <span className="data-table__primary">{contract.name}</span>
                            <span className="data-table__secondary">{contract.contract_number || "---"}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="contracts-form__actions">
                  <ActionButton
                    type="button"
                    variant="ghost"
                    onClick={() => void handleDeleteMonth()}
                    disabled={!canWrite || !selectedMonth}
                  >
                    Usuń miesiąc
                  </ActionButton>
                  <ActionButton
                    type="button"
                    onClick={() => void handleSaveMonthSettings()}
                    disabled={!canWrite}
                  >
                    Zapisz ustawienia miesiąca
                  </ActionButton>
                </div>
              </Panel>
            ) : null}

            <Panel title="Zbiorcza ewidencja pracowników">
              <DataTable
                columns={hoursTableColumns({
                  canWrite,
                  onOpenCorrection: (row) => {
                    setSelectedEmployeeRowKey(row.key);
                    if (row.employeeStatus === "inactive") {
                      setShowManualCorrection(false);
                      setSelectedEntryId(null);
                      setEditingEntryId(null);
                      setFormError(null);
                      setFormStatus(null);
                      return;
                    }
                    handleStartNewEntryForEmployee(row.employeeName);
                  },
                })}
                rows={hoursRows}
                rowKey={(row) => row.key}
                tableClassName="hours-employee-table"
                onRowClick={(row) => {
                  setSelectedEmployeeRowKey(row.key);
                  setSelectedEntryId(null);
                }}
                getRowClassName={(row) =>
                  row.key === selectedEmployeeRowKey ? "data-table__row--active" : undefined
                }
                emptyMessage={
                  monthEntries.length === 0
                    ? "Brak wpisów czasu pracy w wybranym miesiącu."
                    : "Brak pracowników dla podanego wyszukiwania."
                }
              />
            </Panel>

            <Panel title="Podsumowanie kontraktów w miesiącu">
              <DataTable
                columns={contractSummaryColumns}
                rows={contractSummaryRows}
                rowKey={(row) => row.aggregate.contract_id || row.aggregate.contract_name}
                tableClassName="hours-summary-table"
                emptyMessage="Brak agregacji kontraktów dla wybranego miesiąca."
              />
            </Panel>
          </div>

          <div className="hours-side-stack">
            <Panel
              title={
                showManualCorrection
                  ? editingEntry
                    ? "Korekta wpisu czasu"
                    : "Ręczna korekta wpisów"
                  : "Korekta ręczna"
              }
            >
              {selectedEmployeeRow ? (
                <div className="hours-selected-entry">
                  <div className="hours-selected-entry__meta">
                    <span className="hours-selected-entry__label">Wybrany pracownik</span>
                    <strong>
                      {selectedEmployeeRow.employeeName}
                    </strong>
                    <span>
                      {formatHours(selectedEmployeeRow.totalHours)} • {formatNumber(selectedEmployeeRow.contracts.length)} kontrakty •{" "}
                      {formatNumber(selectedEmployeeRow.entriesCount)} wpisy
                    </span>
                  </div>
                  {canWrite && selectedEmployeeAllowsNewEntries ? (
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={() => handleStartNewEntryForEmployee(selectedEmployeeRow.employeeName)}
                    >
                      Dodaj lub popraw godziny
                    </ActionButton>
                  ) : null}
                </div>
              ) : null}

              {selectedEmployeeRow?.employeeStatus === "inactive" ? (
                <p className="status-message">
                  Pracownik jest nieaktywny. W ewidencji zostają jego wpisy historyczne, ale nie można dodać
                  nowego wpisu z tego panelu.
                </p>
              ) : null}

              {canWrite ? showManualCorrection ? (
                <form className="contracts-form" onSubmit={handleSaveEntry}>
                  <FormGrid columns={1}>
                    <label className="form-field">
                      <span>Pracownik</span>
                      <select
                        value={entryFormValues.employee_name}
                        onChange={(event) =>
                          setEntryFormValues((current) => ({
                            ...current,
                            employee_name: event.target.value,
                          }))
                        }
                        className="select-field"
                      >
                        <option value="">Wybierz pracownika</option>
                        {roster
                          .filter((employee) => employee.status !== "inactive")
                          .map((employee) => (
                            <option key={employee.name} value={employee.name}>
                              {employee.name}
                            </option>
                          ))}
                        {editingEntry && !roster.some((employee) => employee.name === editingEntry.employee_name) ? (
                          <option value={editingEntry.employee_name}>{editingEntry.employee_name}</option>
                        ) : null}
                      </select>
                    </label>

                    {activeEmployeeName ? (
                      <div className="hours-entry-helper">
                        <div className="hours-entry-helper__header">
                          <div className="data-table__stack">
                            <span className="data-table__primary">{activeEmployeeName}</span>
                            <span className="data-table__secondary">
                              Wpisy pracownika w wybranym miesiącu: {formatNumber(employeeEntries.length)}
                            </span>
                          </div>
                          {activeEmployeeAllowsNewEntries ? (
                            <ActionButton
                              type="button"
                              variant="ghost"
                              onClick={() => handleStartNewEntryForEmployee(activeEmployeeName)}
                            >
                              Nowy wpis
                            </ActionButton>
                          ) : null}
                        </div>

                        {employeeEntries.length > 0 ? (
                          <>
                            <div className="hours-entry-helper__summary">
                              <div className="hours-entry-helper__summary-card">
                                <span className="hours-entry-helper__summary-label">Pracownik</span>
                                <strong>{activeEmployeeName}</strong>
                                <span>{formatNumber(employeeEntries.length)} wpisy</span>
                              </div>
                              <div className="hours-entry-helper__summary-card">
                                <span className="hours-entry-helper__summary-label">Kontrakty</span>
                                <strong>{formatNumber(employeeContractsCount)}</strong>
                                <span>aktywny przekrój</span>
                              </div>
                              <div className="hours-entry-helper__summary-card">
                                <span className="hours-entry-helper__summary-label">Suma</span>
                                <strong>{formatHours(employeeHoursTotal)}</strong>
                                <span>Razem w miesiącu</span>
                              </div>
                            </div>

                            <div className="hours-entry-helper__list">
                            {employeeEntries.map((entry) => (
                              <button
                                key={entry.id}
                                type="button"
                                className={
                                  entry.id === editingEntryId
                                    ? "hours-entry-helper__row hours-entry-helper__row--active"
                                    : "hours-entry-helper__row"
                                }
                                onClick={() => handleEditEntry(entry)}
                              >
                                <div className="hours-entry-helper__row-main">
                                  <span className="hours-entry-helper__row-title">
                                    {entry.contract_name || "Nieprzypisane"}
                                  </span>
                                  <span className="hours-entry-helper__row-subtitle">
                                    {entry.contract_id ? "Powiązany kontrakt" : "Bez przypisanego kontraktu"}
                                  </span>
                                </div>
                                <div className="hours-entry-helper__row-side">
                                  <strong>{formatHours(entry.hours)}</strong>
                                  <span>Kliknij, aby poprawić</span>
                                </div>
                              </button>
                            ))}
                            </div>
                          </>
                        ) : (
                          <p className="status-message">
                            Ten pracownik nie ma jeszcze wpisów w wybranym miesiącu.
                          </p>
                        )}
                        {!activeEmployeeAllowsNewEntries && activeEmployeeName ? (
                          <p className="status-message">
                            Ten pracownik jest nieaktywny, więc można przeglądać lub poprawiać historię, ale nie
                            można zacząć nowego wpisu od zera.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <label className="form-field">
                      <span>Kontrakt</span>
                      <select
                        value={entryFormValues.contract_id}
                        onChange={(event) =>
                          setEntryFormValues((current) => ({
                            ...current,
                            contract_id: event.target.value,
                          }))
                        }
                        className="select-field"
                      >
                        {contractOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.code} • {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="form-field">
                      <span>Liczba godzin</span>
                      <input
                        className="text-input"
                        inputMode="decimal"
                        value={entryFormValues.hours}
                        onChange={(event) =>
                          setEntryFormValues((current) => ({
                            ...current,
                            hours: event.target.value,
                          }))
                        }
                        placeholder="Np. 8"
                      />
                    </label>
                  </FormGrid>

                  {formError ? <p className="status-message status-message--error">{formError}</p> : null}
                  {formStatus ? <p className="status-message status-message--success">{formStatus}</p> : null}

                  <div className="contracts-form__actions">
                    <ActionButton
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        if (editingEntry) {
                          handleStartNewEntryForEmployee(activeEmployeeName);
                          return;
                        }

                        setShowManualCorrection(false);
                        setFormError(null);
                        setFormStatus(null);
                      }}
                    >
                      {editingEntry ? "Anuluj edycję" : "Zamknij panel"}
                    </ActionButton>
                    <ActionButton type="submit" disabled={isSubmitting}>
                      {isSubmitting
                        ? "Zapisywanie..."
                        : editingEntry
                          ? "Zapisz zmiany"
                          : "Dodaj wpis"}
                    </ActionButton>
                  </div>

                  <p className="status-message">
                    Obsługiwane jest też przypisanie do opcji "Nieprzypisane". Po zapisie zachowujemy wybranego pracownika,
                    żeby szybciej dodać kolejny wpis na inny kontrakt.
                  </p>
                </form>
              ) : (
                <div className="status-stack">
                  <p className="status-message">
                    Główne godziny wpisujemy teraz przez kartę pracy pracownika. Ten panel zostawiamy do korekt,
                    wyjątków i ręcznego dopisania pojedynczego wpisu.
                  </p>
                  <ActionButton
                    type="button"
                    onClick={() => {
                      setShowManualCorrection(true);
                      handleStartNewEntryForEmployee(
                        activeEmployeeAllowsNewEntries ? activeEmployeeName : ""
                      );
                    }}
                  >
                    Otwórz korektę ręczną
                  </ActionButton>
                </div>
              ) : (
                <p className="status-message">
                  Masz dostęp tylko do podglądu ewidencji czasu pracy.
                </p>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <Panel title="Brak miesięcy w ewidencji">
          <div className="status-stack">
            <p className="status-message">
              Nie ma jeszcze żadnego miesiąca do pracy. Dodaj pierwszy miesiąc z panelu sterowania powyżej.
            </p>
          </div>
        </Panel>
      )}
    </div>
  );
}
