"use client";

import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { PdfExportDialog } from "@/components/ui/pdf-export-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { togglePdfColumn, togglePdfSection, type PdfConfigState } from "@/lib/print/pdf-config";
import type { ContractRecord } from "@/features/contracts/types";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import {
  fetchHoursBootstrapSummary,
  fetchHoursContracts,
  fetchHoursData,
  fetchHoursEmployeeDirectory,
  findHoursEntryById,
  removeHoursMonth,
  saveHoursEntry,
  saveHoursMonth,
} from "@/features/hours/api";
import { formatMonthLabel, parseDecimalInput } from "@/features/hours/formatters";
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
  resolveHoursMonthSwitch,
} from "@/features/hours/mappers";
import type {
  HoursBootstrapData,
  HoursEmployeeRecord,
  HoursEntryFormValues,
  HoursFinanceDraft,
  HoursListResponse,
  TimeEntryRecord,
} from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";
import { HoursToolbar } from "@/features/hours/hours-toolbar";
import { HoursMonthSettingsPanel } from "@/features/hours/hours-month-settings-panel";
import { HoursEmployeeTablePanel, hoursContractSummaryColumns } from "@/features/hours/hours-employee-table-panel";
import { HoursCorrectionPanel } from "@/features/hours/hours-correction-panel";
import {
  buildHoursPdfConfig,
  buildHoursPdfSections,
  printHoursReport,
  type HoursPdfContext,
} from "@/features/hours/hours-pdf";
import type { HoursContractSummaryRow, HoursEmployeeRow } from "@/features/hours/view-types";
import { canManageView } from "@/lib/auth/permissions";

type HoursState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: HoursListResponse };

const emptyEntryFormValues: HoursEntryFormValues = {
  employee_name: "",
  contract_id: UNASSIGNED_TIME_CONTRACT_ID,
  hours: "",
};

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
    const employeeLabel =
      formatEmployeeDisplayName(employee, employeeName) || "Nieznany pracownik";
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
        employeeLabel,
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
        row.employeeLabel,
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
      `${left.employeeLabel} ${left.employeeId}`.localeCompare(
        `${right.employeeLabel} ${right.employeeId}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    )
    .map((row, index) => ({
      ...row,
      index: index + 1,
    }));
}

export function HoursView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: HoursBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "hoursView");
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
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [hoursPdfConfig, setHoursPdfConfig] = useState<PdfConfigState>({});

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
      const [bootstrapSummary, nextContracts, nextHistoricalEmployees] = await Promise.all([
        fetchHoursBootstrapSummary(),
        options?.refreshRelations ? fetchHoursContracts() : Promise.resolve(contracts),
        options?.refreshRelations
          ? fetchHoursEmployeeDirectory()
            : Promise.resolve(historicalEmployees),
      ]);

      const fallbackMonthKey =
        bootstrapSummary.selectedMonthKey ||
        bootstrapSummary.months[0]?.month_key ||
        "";
      const requestedMonthKey =
        options?.preferredMonthKey && options.preferredMonthKey.trim().length > 0
          ? options.preferredMonthKey
          : selectedMonthKey;
      const nextMonthKey =
        requestedMonthKey &&
        bootstrapSummary.months.some((month) => month.month_key === requestedMonthKey)
          ? requestedMonthKey
          : fallbackMonthKey;
      const payload = await fetchHoursData(
        nextMonthKey ? { month: nextMonthKey } : {}
      );

      if (options?.refreshRelations) {
        setContracts(nextContracts);
        setHistoricalEmployees(nextHistoricalEmployees);
        setEmployees(nextHistoricalEmployees.filter((employee) => employee.status !== "inactive"));
      }

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

  const loadInitialHours = useEffectEvent(() => {
    void reloadHours({ refreshRelations: true });
  });

  useEffect(() => {
    const shouldUseInitialData = Boolean(initialBootstrap?.payload);
    if (shouldUseInitialData) {
      return;
    }

    loadInitialHours();
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
  const activeEmployeeRecord = useMemo(() => {
    if (activeEmployeeId) {
      const matchedById =
        historicalEmployees.find(
          (employee) => String(employee.id || "").trim() === activeEmployeeId
        ) ?? null;
      if (matchedById) {
        return matchedById;
      }
    }

    if (!activeEmployeeName) {
      return null;
    }

    return (
      roster.find((employee) => employee.name === activeEmployeeName) ??
      historicalEmployees.find((employee) => employee.name === activeEmployeeName) ??
      null
    );
  }, [activeEmployeeId, activeEmployeeName, historicalEmployees, roster]);
  const activeEmployeeLabel = useMemo(() => {
    return (
      formatEmployeeDisplayName(activeEmployeeRecord, activeEmployeeName) ||
      selectedEmployeeRow?.employeeLabel ||
      activeEmployeeName
    );
  }, [activeEmployeeName, activeEmployeeRecord, selectedEmployeeRow?.employeeLabel]);
  const activeEmployeeMeta = useMemo(() => {
    const position =
      String(activeEmployeeRecord?.position || selectedEmployeeRow?.employeePosition || "").trim() ||
      "Bez stanowiska";
    const employeeCode = formatEmployeeCodeLabel(
      activeEmployeeRecord?.worker_code || selectedEmployeeRow?.employeeCode,
      "—"
    );

    return `${position} | Kod ${employeeCode}`;
  }, [
    activeEmployeeRecord?.position,
    activeEmployeeRecord?.worker_code,
    selectedEmployeeRow?.employeeCode,
    selectedEmployeeRow?.employeePosition,
  ]);
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

  const hoursPdfContext = useMemo<HoursPdfContext | null>(() => {
    if (!selectedMonth) return null;
    return {
      selectedMonth,
      selectedEmployeeRow,
      employeeEntries,
      monthEntries,
      hoursRows,
      contractSummaryRows,
      contractOptions,
      employeeHoursTotal,
    };
  }, [
    contractOptions,
    contractSummaryRows,
    employeeEntries,
    employeeHoursTotal,
    hoursRows,
    monthEntries,
    selectedEmployeeRow,
    selectedMonth,
  ]);

  const hoursPdfSections = useMemo(
    () => (hoursPdfContext ? buildHoursPdfSections(hoursPdfContext, hoursPdfConfig) : []),
    [hoursPdfConfig, hoursPdfContext]
  );

  function handleOpenHoursPdf() {
    if (!hoursPdfContext) return;
    setHoursPdfConfig(buildHoursPdfConfig(hoursPdfContext));
    setIsPdfDialogOpen(true);
  }

  function handleConfirmHoursPdf() {
    if (!hoursPdfContext) return;
    printHoursReport(hoursPdfContext, hoursPdfConfig);
    setIsPdfDialogOpen(false);
  }

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
    setMonthError(null);
    setMonthStatus(null);
    setFormError(null);
    setFormStatus(null);

    if (state.status !== "success") {
      return;
    }

    const monthSwitch = resolveHoursMonthSwitch({
      months: state.data.months,
      currentMonthKey: selectedMonthKey,
      nextMonthKey,
    });

    if (!monthSwitch.nextMonth || monthSwitch.isSameMonth) {
      return;
    }

    setSelectedMonthKey(nextMonthKey);

    if (!canWrite) {
      await reloadHours({ preserveState: true, preferredMonthKey: nextMonthKey });
      return;
    }

    try {
      const { currentMonth, nextMonth } = monthSwitch;
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
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Ewidencja czasu pracy">
          <p className="status-message">Ładuję miesiące i wpisy.</p>
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
          <div className="module-actions">
            <div className="module-actions__primary">
              {canWrite ? (
                <ActionButton
                  type="button"
                  onClick={() =>
                    handleStartNewEntryForEmployee(selectedEmployeeRow?.employeeName ?? "")
                  }
                  disabled={!selectedMonthKey || selectedEmployeeRow?.employeeStatus === "inactive"}
                >
                  Nowy wpis
                </ActionButton>
              ) : null}
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleOpenHoursPdf}
                disabled={!selectedMonth}
              >
                PDF raportu
              </ActionButton>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void reloadHours({ preserveState: true, refreshRelations: true })}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <HoursToolbar
        monthOptions={monthOptions}
        selectedMonthKey={selectedMonthKey}
        search={search}
        showMonthSettings={showMonthSettings}
        monthError={monthError}
        monthStatus={monthStatus}
        onSelectMonth={(monthKey) => void handleSelectMonth(monthKey)}
        onSearchChange={setSearch}
        onToggleMonthSettings={() => setShowMonthSettings((current) => !current)}
      />

      {selectedMonth ? (
        <div className="hours-layout">
          <div className="module-page__stack">
            {showMonthSettings ? (
              <HoursMonthSettingsPanel
                canWrite={canWrite}
                selectedMonth={selectedMonth}
                activeContracts={activeContracts}
                monthContractIds={monthContractIds}
                newMonthYear={newMonthYear}
                newMonthNumber={newMonthNumber}
                financeDraft={financeDraft}
                onToggleContractId={(contractId, checked) =>
                  setMonthContractIds((current) =>
                    checked
                      ? Array.from(new Set([...current, contractId]))
                      : current.filter((item) => item !== contractId)
                  )
                }
                onSetNewMonthYear={setNewMonthYear}
                onSetNewMonthNumber={setNewMonthNumber}
                onSetFinanceDraft={setFinanceDraft}
                onCreateMonth={() => void handleCreateMonth()}
                onDeleteMonth={() => void handleDeleteMonth()}
                onSaveMonthSettings={() => void handleSaveMonthSettings()}
              />
            ) : null}

            <HoursEmployeeTablePanel
              rows={hoursRows}
              canWrite={canWrite}
              selectedEmployeeRowKey={selectedEmployeeRowKey}
              monthEntriesCount={monthEntries.length}
              onOpenCorrection={(row) => {
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
              }}
              onSelectRow={(row) => {
                setSelectedEmployeeRowKey(row.key);
                setSelectedEntryId(null);
              }}
            />

            <Panel title="Podsumowanie kontraktów w miesiącu">
              <DataTable
                columns={hoursContractSummaryColumns}
                rows={contractSummaryRows}
                rowKey={(row) => row.aggregate.contract_id || row.aggregate.contract_name}
                tableClassName="hours-summary-table"
                emptyMessage="Brak agregacji kontraktów dla wybranego miesiąca."
              />
            </Panel>
          </div>

          <div className="hours-side-stack">
            <HoursCorrectionPanel
              canWrite={canWrite}
              showManualCorrection={showManualCorrection}
              editingEntry={editingEntry}
              selectedEmployeeRow={selectedEmployeeRow}
              selectedEmployeeAllowsNewEntries={selectedEmployeeAllowsNewEntries}
              activeEmployeeName={activeEmployeeName}
              activeEmployeeLabel={activeEmployeeLabel}
              activeEmployeeMeta={activeEmployeeMeta}
              employeeEntries={employeeEntries}
              employeeHoursTotal={employeeHoursTotal}
              employeeContractsCount={employeeContractsCount}
              roster={roster}
              contractOptions={contractOptions}
              entryFormValues={entryFormValues}
              isSubmitting={isSubmitting}
              formError={formError}
              formStatus={formStatus}
              onStartNewEntryForEmployee={handleStartNewEntryForEmployee}
              onSetShowManualCorrection={setShowManualCorrection}
              onSetFormError={setFormError}
              onSetFormStatus={setFormStatus}
              onSetEntryFormValues={setEntryFormValues}
              onEditEntry={handleEditEntry}
              onSaveEntry={handleSaveEntry}
            />
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

      <PdfExportDialog
        open={isPdfDialogOpen}
        title="PDF ewidencji czasu"
        description="Skonfiguruj sekcje raportu i kolumny tabel przed wydrukiem."
        context={
          selectedMonth
            ? [
                selectedMonth.month_label || formatMonthLabel(selectedMonth.month_key),
                selectedEmployeeRow?.employeeLabel || "Wszyscy pracownicy",
                selectedEmployeeRow ? "Raport pracownika" : "Raport miesiąca",
              ]
            : []
        }
        sections={hoursPdfSections}
        onClose={() => setIsPdfDialogOpen(false)}
        onToggleSection={(sectionId) => setHoursPdfConfig((current) => togglePdfSection(current, sectionId))}
        onToggleColumn={(sectionId, columnId) =>
          setHoursPdfConfig((current) => togglePdfColumn(current, sectionId, columnId))
        }
        onReset={() => {
          if (!hoursPdfContext) return;
          setHoursPdfConfig(buildHoursPdfConfig(hoursPdfContext));
        }}
        onConfirm={handleConfirmHoursPdf}
      />
    </div>
  );
}
