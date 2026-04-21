"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { PdfExportDialog } from "@/components/ui/pdf-export-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import {
  buildPdfDialogSections,
  createPdfConfigState,
  getEnabledPdfColumnIds,
  togglePdfColumn,
  togglePdfSection,
  type PdfConfigState,
  type PdfSectionDefinition,
} from "@/lib/print/pdf-config";
import {
  compactPrintSections,
  pickPrintTableColumns,
  printDocument,
  type PrintTable,
} from "@/lib/print/print-document";
import { saveHoursMonth } from "@/features/hours/api";
import { buildMonthOptions, getSelectedMonth } from "@/features/hours/mappers";
import type { HoursEmployeeRecord, HoursMonthRecord } from "@/features/hours/types";
import {
  fetchWorkCardBootstrapClient,
  fetchWorkCardCard,
  saveWorkCardAndSync,
} from "@/features/work-cards/api";
import {
  formatHours,
  formatMonthLabel,
  formatNumber,
  parseDecimalInput,
} from "@/features/work-cards/formatters";
import {
  buildWorkCardBootstrapSelection,
  buildWorkCardContractOptions,
  buildWorkCardContractTotals,
  buildWorkCardDraftRows,
  buildWorkCardEmployeeOptions,
  buildWorkCardSummaryCards,
  serializeWorkCard,
} from "@/features/work-cards/mappers";
import type {
  WorkCardBootstrapData,
  WorkCardDayViewModel,
  WorkCardHistorySummary,
  WorkCardRecord,
} from "@/features/work-cards/types";

type LoadState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

type WorkCardHistoryPreview = {
  cardId: string;
  summary: WorkCardHistorySummary;
  employee: HoursEmployeeRecord | null;
  employeeLabel: string;
  employeeMeta: string;
  monthKey: string;
  monthLabel: string;
  totalHours: number;
  filledDays: number;
};

function recalculateRow(row: WorkCardDayViewModel) {
  const totalHours = Object.values(row.hoursByContract).reduce(
    (sum, value) => sum + parseDecimalInput(value),
    0
  );

  return {
    ...row,
    totalHours,
  };
}

function normalizeEmployeeLookupKey(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

function buildMonthKey(year: string, month: string) {
  const normalizedYear = String(year || "").trim();
  const normalizedMonth = String(month || "").trim();

  if (!/^\d{4}$/.test(normalizedYear)) return "";
  if (!/^(0[1-9]|1[0-2])$/.test(normalizedMonth)) return "";

  return `${normalizedYear}-${normalizedMonth}`;
}

export function WorkCardView({
  initialBootstrap,
  initialCard,
  initialError,
}: {
  initialBootstrap?: WorkCardBootstrapData | null;
  initialCard?: WorkCardRecord | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "hoursView");

  const [contracts, setContracts] = useState(initialBootstrap?.contracts ?? []);
  const [employees, setEmployees] = useState(initialBootstrap?.employees ?? []);
  const [historicalEmployees, setHistoricalEmployees] = useState(
    initialBootstrap?.historicalEmployees ?? initialBootstrap?.employees ?? []
  );
  const [historicalCards, setHistoricalCards] = useState<WorkCardHistorySummary[]>(
    initialBootstrap?.historicalCards ?? []
  );
  const [months, setMonths] = useState<HoursMonthRecord[]>(initialBootstrap?.months ?? []);
  const [loadedCard, setLoadedCard] = useState<WorkCardRecord | null>(initialCard ?? null);
  const [loadState, setLoadState] = useState<LoadState>(() => {
    if (initialBootstrap) return { status: "success" };
    if (initialError) return { status: "error", message: initialError };
    return { status: "loading" };
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState(initialBootstrap?.selectedMonthKey ?? "");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState(
    initialBootstrap?.selectedEmployeeKey ?? ""
  );
  const [draftRows, setDraftRows] = useState<WorkCardDayViewModel[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCardLoading, setIsCardLoading] = useState(false);
  const [isCreatingMonth, setIsCreatingMonth] = useState(false);
  const [monthStatus, setMonthStatus] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
  const [newMonthNumber, setNewMonthNumber] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0")
  );
  const [selectedHistoricalCardId, setSelectedHistoricalCardId] = useState<string | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [workCardPdfConfig, setWorkCardPdfConfig] = useState<PdfConfigState>({});
  const initialCardRequestKeyRef = useRef<string | null>(
    initialBootstrap?.selectedMonthKey && initialBootstrap?.selectedEmployeeKey
      ? `${initialBootstrap.selectedMonthKey}|${initialBootstrap.selectedEmployeeKey}`
      : null
  );

  async function reloadWorkCards(options?: { preserveSelection?: boolean }) {
    if (options?.preserveSelection) {
      setIsRefreshing(true);
    } else {
      setLoadState({ status: "loading" });
    }

    try {
      const bootstrap = await fetchWorkCardBootstrapClient();
      const defaults = buildWorkCardBootstrapSelection(bootstrap);
      const nextEmployeeOptions = buildWorkCardEmployeeOptions(bootstrap.employees);
      const nextSelectedMonthKey =
        options?.preserveSelection &&
        bootstrap.months.some((month) => month.month_key === selectedMonthKey)
          ? selectedMonthKey
          : defaults.monthKey;
      const nextSelectedEmployeeKey =
        options?.preserveSelection &&
        nextEmployeeOptions.some((option) => option.key === selectedEmployeeKey)
          ? selectedEmployeeKey
          : defaults.employeeKey;
      const nextHistoricalCardId =
        options?.preserveSelection &&
        selectedHistoricalCardId &&
        bootstrap.historicalCards.some((item) => item.card_id === selectedHistoricalCardId)
          ? selectedHistoricalCardId
          : null;

      setContracts(bootstrap.contracts);
      setEmployees(bootstrap.employees);
      setHistoricalEmployees(bootstrap.historicalEmployees);
      setHistoricalCards(bootstrap.historicalCards);
      setMonths(bootstrap.months);
      setLoadedCard(null);
      setCardError(null);
      setSelectedMonthKey(nextSelectedMonthKey);
      setSelectedEmployeeKey(nextSelectedEmployeeKey);
      setSelectedHistoricalCardId(nextHistoricalCardId);
      setLoadState({ status: "success" });
    } catch (error) {
      setLoadState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się przygotować kart pracy.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  const loadInitialWorkCards = useEffectEvent(() => {
    void reloadWorkCards();
  });

  useEffect(() => {
    if (initialBootstrap) {
      return;
    }

    loadInitialWorkCards();
  }, [initialBootstrap, initialError]);

  const employeeOptions = useMemo(
    () => buildWorkCardEmployeeOptions(employees),
    [employees]
  );
  const historicalWorkCards = useMemo<WorkCardHistoryPreview[]>(() => {
    return historicalCards
      .map((summary) => {
        const normalizedEmployeeId = String(summary.employee_id || "").trim();
        const employee =
          historicalEmployees.find((candidate) => {
            const candidateId = String(candidate.id || "").trim();
            if (normalizedEmployeeId && candidateId) {
              return candidateId === normalizedEmployeeId;
            }

            return (
              normalizeEmployeeLookupKey(candidate.name) ===
              normalizeEmployeeLookupKey(summary.employee_name)
            );
          }) ?? null;

        if ((employee?.status ?? "active") !== "inactive") {
          return null;
        }
        const employeeOption = employee
          ? buildWorkCardEmployeeOptions([employee])[0] ?? null
          : null;

        return {
          cardId: summary.card_id,
          summary,
          employee,
          employeeLabel:
            formatEmployeeDisplayName(
              employee,
              String(summary.employee_name || "Nieznany pracownik").trim()
            ) || "Nieznany pracownik",
          employeeMeta:
            employeeOption?.description ||
            "Pracownik nieaktywny",
          monthKey: summary.month_key,
          monthLabel: summary.month_label || formatMonthLabel(summary.month_key),
          totalHours: Number(summary.total_hours || 0),
          filledDays: Number(summary.filled_days || 0),
        } satisfies WorkCardHistoryPreview;
      })
      .filter((item): item is WorkCardHistoryPreview => Boolean(item))
      .sort((left, right) => {
        if (left.monthKey !== right.monthKey) {
          return right.monthKey.localeCompare(left.monthKey);
        }

        return left.employeeLabel.localeCompare(right.employeeLabel, "pl", {
          sensitivity: "base",
          numeric: true,
        });
      });
  }, [historicalCards, historicalEmployees]);
  const inactiveHistoricalEmployeesCount = useMemo(() => {
    return new Set(
      historicalWorkCards.map((item) =>
        String(item.employee?.id || "").trim() ||
        `${normalizeEmployeeLookupKey(item.employeeLabel)}|${normalizeEmployeeLookupKey(item.employeeMeta)}`
      )
    ).size;
  }, [historicalWorkCards]);

  useEffect(() => {
    if (selectedEmployeeKey) return;
    const fallbackEmployee =
      employeeOptions.find((option) => option.status !== "inactive")?.key ||
      employeeOptions[0]?.key ||
      "";
    if (fallbackEmployee) {
      setSelectedEmployeeKey(fallbackEmployee);
    }
  }, [employeeOptions, selectedEmployeeKey]);

  useEffect(() => {
    if (selectedMonthKey) return;
    const fallbackMonth =
      months.find((month) => month.selected)?.month_key || months[0]?.month_key || "";
    if (fallbackMonth) {
      setSelectedMonthKey(fallbackMonth);
    }
  }, [months, selectedMonthKey]);

  const selectedEmployeeOption = useMemo(
    () =>
      employeeOptions.find((option) => option.key === selectedEmployeeKey) ?? null,
    [employeeOptions, selectedEmployeeKey]
  );
  const selectedEmployee = selectedEmployeeOption?.employee ?? null;
  const selectedHistoricalCard = useMemo(
    () =>
      historicalWorkCards.find((item) => item.cardId === selectedHistoricalCardId) ?? null,
    [historicalWorkCards, selectedHistoricalCardId]
  );
  const isHistoricalPreview = Boolean(selectedHistoricalCard);
  const displayedEmployeeLabel =
    selectedHistoricalCard?.employeeLabel ||
    formatEmployeeDisplayName(selectedEmployee, selectedEmployee?.name || "") ||
    "";
  const displayedEmployeeMeta =
    selectedHistoricalCard?.employeeMeta ||
    selectedEmployeeOption?.description ||
    (selectedEmployee
      ? `${String(selectedEmployee.position || "").trim() || "Bez stanowiska"} | Kod ${formatEmployeeCodeLabel(selectedEmployee.worker_code)}`
      : "");
  const hasDisplayContext = Boolean(selectedHistoricalCard || selectedEmployee);

  const selectedMonth = useMemo(
    () => getSelectedMonth(months, selectedMonthKey),
    [months, selectedMonthKey]
  );
  const selectedCardRequest = useMemo(() => {
    if (selectedHistoricalCard) {
      return {
        monthKey: selectedHistoricalCard.monthKey,
        employee: {
          id:
            String(selectedHistoricalCard.employee?.id || "").trim() ||
            String(selectedHistoricalCard.summary.employee_id || "").trim(),
          name:
            String(selectedHistoricalCard.employee?.name || "").trim() ||
            String(selectedHistoricalCard.summary.employee_name || "").trim(),
        },
      };
    }

    if (!selectedEmployee || !selectedMonthKey) {
      return null;
    }

    return {
      monthKey: selectedMonthKey,
      employee: {
        id: String(selectedEmployee.id || "").trim(),
        name: String(selectedEmployee.name || "").trim(),
      },
    };
  }, [selectedEmployee, selectedHistoricalCard, selectedMonthKey]);
  const selectedCardRequestKey = useMemo(() => {
    if (selectedHistoricalCard) {
      return `${selectedHistoricalCard.monthKey}|${
        String(selectedHistoricalCard.employee?.id || "").trim() ||
        normalizeEmployeeLookupKey(selectedHistoricalCard.summary.employee_name)
      }`;
    }

    if (!selectedEmployee || !selectedMonthKey) {
      return null;
    }

    return `${selectedMonthKey}|${
      String(selectedEmployee.id || "").trim() ||
      normalizeEmployeeLookupKey(selectedEmployee.name)
    }`;
  }, [selectedEmployee, selectedHistoricalCard, selectedMonthKey]);
  const previewCard = loadedCard;
  const activeCard = selectedHistoricalCard ? null : loadedCard;

  useEffect(() => {
    if (!selectedCardRequest) {
      setLoadedCard(null);
      setCardError(null);
      setIsCardLoading(false);
      return;
    }

    if (
      initialCardRequestKeyRef.current &&
      selectedCardRequestKey &&
      selectedCardRequestKey === initialCardRequestKeyRef.current
    ) {
      initialCardRequestKeyRef.current = null;
      setCardError(null);
      setIsCardLoading(false);
      return;
    }

    let cancelled = false;
    setIsCardLoading(true);
    setCardError(null);

    void fetchWorkCardCard(selectedCardRequest)
      .then((card) => {
        if (cancelled) return;
        setLoadedCard(card);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadedCard(null);
        setCardError(
          error instanceof Error
            ? error.message
            : "Nie udało się odczytać karty pracy."
        );
      })
      .finally(() => {
        if (cancelled) return;
        setIsCardLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedCardRequest, selectedCardRequestKey]);

  const contractOptions = useMemo(
    () =>
      buildWorkCardContractOptions({
        contracts,
        selectedMonth,
        card: previewCard,
      }),
    [contracts, previewCard, selectedMonth]
  );

  useEffect(() => {
    if (!selectedMonthKey || (!selectedEmployeeKey && !selectedHistoricalCard)) {
      setDraftRows([]);
      return;
    }

    setDraftRows(
      buildWorkCardDraftRows({
        monthKey: selectedMonthKey,
        contractOptions,
        card: previewCard,
      })
    );
  }, [contractOptions, previewCard, selectedEmployeeKey, selectedHistoricalCard, selectedMonthKey]);

  const summaryCards = useMemo(
    () =>
      buildWorkCardSummaryCards({
        rows: draftRows,
        contractOptions,
        card: previewCard,
      }),
    [contractOptions, draftRows, previewCard]
  );
  const visibleSummaryCards = useMemo(
    () =>
      summaryCards.filter((card) =>
        ["filled-days", "hours", "contracts"].includes(card.id)
      ),
    [summaryCards]
  );

  const contractTotals = useMemo(
    () => buildWorkCardContractTotals(draftRows, contractOptions),
    [contractOptions, draftRows]
  );

  const monthTotalHours = useMemo(
    () => draftRows.reduce((sum, row) => sum + row.totalHours, 0),
    [draftRows]
  );

  const filledDaysCount = useMemo(
    () => draftRows.filter((row) => row.totalHours > 0).length,
    [draftRows]
  );

  const gridTemplate = useMemo(() => {
    const contractCount = Math.max(contractOptions.length, 1);
    const contractMinWidth = contractCount > 10 ? 54 : contractCount > 7 ? 60 : 72;
    const noteMinWidth = contractCount > 8 ? 180 : 220;

    return `minmax(168px, 1.05fr) repeat(${contractCount}, minmax(${contractMinWidth}px, 0.72fr)) minmax(92px, 0.55fr) minmax(${noteMinWidth}px, 1.55fr)`;
  }, [contractOptions.length]);

  useEffect(() => {
    if (!selectedHistoricalCardId) return;
    if (historicalWorkCards.some((item) => item.cardId === selectedHistoricalCardId)) return;
    setSelectedHistoricalCardId(null);
  }, [historicalWorkCards, selectedHistoricalCardId]);

  function updateDayRow(date: string, updater: (row: WorkCardDayViewModel) => WorkCardDayViewModel) {
    setDraftRows((current) =>
      current.map((row) => {
        if (row.date !== date) return row;
        return recalculateRow(updater(row));
      })
    );
  }

  function handleHoursChange(date: string, contractId: string, value: string) {
    updateDayRow(date, (row) => ({
      ...row,
      hoursByContract: {
        ...row.hoursByContract,
        [contractId]: value,
      },
    }));
  }

  function handleNoteChange(date: string, value: string) {
    updateDayRow(date, (row) => ({
      ...row,
      note: value,
    }));
  }

  async function handleCreateMonth() {
    if (!canWrite) return;
    const nextMonthKey = buildMonthKey(newMonthYear, newMonthNumber);

    if (!nextMonthKey) {
      setMonthError("Podaj poprawny rok i miesiąc karty pracy.");
      return;
    }

    setMonthError(null);
    setMonthStatus(null);

    try {
      setIsCreatingMonth(true);
      await saveHoursMonth(null, {
        month_key: nextMonthKey,
        month_label: formatMonthLabel(nextMonthKey),
        selected: true,
        visible_investments: [],
        finance: {
          zus_company_1: 0,
          zus_company_2: 0,
          zus_company_3: 0,
          pit4_company_1: 0,
          pit4_company_2: 0,
          pit4_company_3: 0,
          payouts: 0,
        },
      });
      await reloadWorkCards({ preserveSelection: true });
      setSelectedMonthKey(nextMonthKey);
      setMonthStatus(`Dodano miesiąc ${formatMonthLabel(nextMonthKey)}.`);
    } catch (error) {
      setMonthError(error instanceof Error ? error.message : "Nie udało się dodać miesiąca.");
    } finally {
      setIsCreatingMonth(false);
    }
  }

  async function handleSaveCard() {
    if (!canWrite || !selectedEmployee || !selectedMonth) return;

    setSaveError(null);
    setSaveStatus(null);

    try {
      setIsSaving(true);
      const nextCard = serializeWorkCard({
        rows: draftRows,
        employee: selectedEmployee,
        monthKey: selectedMonthKey,
        monthLabel: selectedMonth.month_label || formatMonthLabel(selectedMonthKey),
        contractOptions,
        existingCard: activeCard,
      });

      const result = await saveWorkCardAndSync({
        card: nextCard,
        employee: selectedEmployee,
      });

      setLoadedCard(result.card);
      if (result.syncError) {
        setSaveError(result.syncError);
        setSaveStatus("Karta pracy została zapisana.");
      } else {
        setSaveStatus("Zapisano kartę pracy i odświeżono dane ewidencji czasu pracy.");
      }
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać karty pracy."
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (loadState.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Godziny" title="Karty pracy" />
        <div className="module-page__stats module-page__stats--compact">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Karty pracy">
          <p className="status-message">Ładuję pracowników i miesiące.</p>
        </Panel>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Godziny"
          title="Karty pracy"
          actions={
            <ActionButton
              type="button"
              onClick={() => void reloadWorkCards()}
            >
              Spróbuj ponownie
            </ActionButton>
          }
        />
        <Panel title="Błąd odczytu">
          <p className="status-message status-message--error">{loadState.message}</p>
        </Panel>
      </div>
    );
  }

  const monthOptions = buildMonthOptions(months);
  const monthCreatorField = canWrite ? (
    <label className="form-field">
      <span>Dodaj miesiąc</span>
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
          disabled={isCreatingMonth}
        >
          {isCreatingMonth ? "Dodawanie..." : "Dodaj miesiąc"}
        </ActionButton>
      </div>
    </label>
  ) : null;
  const currentMonthLabel =
    selectedMonth?.month_label ||
    (selectedMonthKey ? formatMonthLabel(selectedMonthKey) : "Wybierz miesiąc");

  const workCardPdfDefinitions: PdfSectionDefinition[] =
    !selectedMonthKey || !displayedEmployeeLabel
      ? []
      : [
          {
            id: "card",
            label: "Dane karty",
            description: "Pracownik, miesiąc i podsumowanie miesięczne.",
            preview: [displayedEmployeeLabel, currentMonthLabel, formatHours(monthTotalHours)],
          },
          {
            id: "days",
            label: "Rozpiska dzienna",
            description: "Tabela dni roboczych i przypisań kontraktowych.",
            preview: [`${formatNumber(filledDaysCount)} dni z wpisami`],
            columns: [
              { id: "day", label: "Dzień" },
              { id: "assignments", label: "Kontrakty i godziny" },
              { id: "total", label: "Razem" },
              { id: "note", label: "Opis pracy" },
            ],
          },
          {
            id: "contracts",
            label: "Podsumowanie kontraktów",
            description: "Sumy godzin według kontraktów w karcie pracy.",
            preview: [`${contractOptions.length} dostępnych kontraktów`],
            columns: [
              { id: "contract", label: "Kontrakt" },
              { id: "code", label: "Kod" },
              { id: "hours", label: "Suma godzin" },
            ],
          },
        ];

  const workCardPdfSections = buildPdfDialogSections(workCardPdfDefinitions, workCardPdfConfig);

  function handleOpenWorkCardPdf() {
    if (!selectedMonthKey || !displayedEmployeeLabel) return;
    setWorkCardPdfConfig(createPdfConfigState(workCardPdfDefinitions));
    setIsPdfDialogOpen(true);
  }

  function handleConfirmWorkCardPdf() {
    if (!selectedMonthKey || !displayedEmployeeLabel) return;

    const enabledSectionIds = new Set(
      workCardPdfSections.filter((section) => section.enabled).map((section) => section.id)
    );

    const contractsTable: PrintTable = {
      columns: [
        { id: "contract", label: "Kontrakt", width: "54%" },
        { id: "code", label: "Kod", width: "18%" },
        { id: "hours", label: "Suma godzin", width: "28%", align: "right" },
      ],
      rows: Array.from(contractTotals.entries())
        .filter(([, hours]) => hours > 0)
        .map(([contractId, hours]) => {
          const option = contractOptions.find((candidate) => candidate.id === contractId);
          return {
            contract: option?.label || "Nieprzypisane",
            code: option?.code || "—",
            hours: formatHours(hours),
          };
        }),
      emptyText: "Brak kontraktów z godzinami w wybranej karcie.",
    };

    const dailyTable: PrintTable = {
      columns: [
        { id: "day", label: "Dzień", width: "16%" },
        { id: "assignments", label: "Kontrakty i godziny", width: "48%" },
        { id: "total", label: "Razem", width: "14%", align: "right" },
        { id: "note", label: "Opis pracy", width: "22%" },
      ],
      rows: draftRows.map((row) => {
        const assignments = contractOptions
          .map((option) => {
            const value = parseDecimalInput(row.hoursByContract[option.id] || "");
            if (!value) return "";
            return `${option.label}: ${formatHours(value)}`;
          })
          .filter(Boolean)
          .join(" | ");

        return {
          day: `${row.dayNumber} ${row.weekdayLabel}`,
          assignments: assignments || "—",
          total: formatHours(row.totalHours),
          note: row.note || "—",
        };
      }),
      emptyText: "Brak wpisów dziennych do wydruku.",
    };

    printDocument({
      title: "Karta pracy",
      subtitle: displayedEmployeeLabel,
      context: currentMonthLabel,
      filename: `clode-karta-pracy-${displayedEmployeeLabel}-${selectedMonthKey}`,
      meta: [
        currentModeLabel,
        `Dni z wpisami: ${formatNumber(filledDaysCount)}`,
        `Suma godzin: ${formatHours(monthTotalHours)}`,
      ],
      sections: compactPrintSections([
        enabledSectionIds.has("card")
          ? {
              title: "Dane karty",
              details: [
                { label: "Pracownik", value: displayedEmployeeLabel },
                { label: "Miesiąc", value: currentMonthLabel },
                { label: "Tryb", value: currentModeLabel },
                { label: "Kontekst", value: displayedEmployeeMeta || "Aktywny pracownik" },
                { label: "Dni z wpisami", value: formatNumber(filledDaysCount) },
                { label: "Suma godzin", value: formatHours(monthTotalHours) },
              ],
            }
          : null,
        enabledSectionIds.has("days")
          ? {
              title: "Rozpiska dzienna",
              table: pickPrintTableColumns(
                dailyTable,
                getEnabledPdfColumnIds(workCardPdfConfig, "days")
              ),
            }
          : null,
        enabledSectionIds.has("contracts")
          ? {
              title: "Podsumowanie kontraktów",
              table: pickPrintTableColumns(
                contractsTable,
                getEnabledPdfColumnIds(workCardPdfConfig, "contracts")
              ),
            }
          : null,
      ]),
    });

    setIsPdfDialogOpen(false);
  }
  const currentModeLabel = isHistoricalPreview ? "Historia pracownika" : "Aktywna karta";
  const currentContextLabel = displayedEmployeeLabel || "Wybierz pracownika";
  const currentContextMeta = [currentMonthLabel, displayedEmployeeMeta]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Godziny"
        title="Karty pracy"
        actions={
          <div className="module-actions">
            {canWrite ? (
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void handleCreateMonth()}
                disabled={isCreatingMonth}
              >
                {isCreatingMonth ? "Dodawanie..." : "Dodaj miesiąc"}
              </ActionButton>
            ) : null}
            {canWrite ? (
              <ActionButton
                type="button"
                onClick={() => void handleSaveCard()}
                disabled={isSaving || !selectedEmployee || !selectedMonthKey || isHistoricalPreview}
              >
                {isSaving ? "Zapisywanie..." : "Zapisz kartę pracy"}
              </ActionButton>
            ) : null}
            <ActionButton
              type="button"
              variant="secondary"
              onClick={handleOpenWorkCardPdf}
              disabled={!selectedMonthKey || !displayedEmployeeLabel}
            >
              PDF karty
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void reloadWorkCards({ preserveSelection: true })}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
            </ActionButton>
            <Link className="action-button action-button--ghost" href="/hours">
              Otwórz ewidencję
            </Link>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {visibleSummaryCards.map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <FormGrid columns={canWrite ? 3 : 2}>
          <label className="form-field">
            <span>Pracownik</span>
            <select
              className="select-field"
              value={selectedEmployeeKey}
              onChange={(event) => {
                setSelectedEmployeeKey(event.target.value);
                setSelectedHistoricalCardId(null);
                setSaveError(null);
                setSaveStatus(null);
              }}
            >
              <option value="">Wybierz pracownika</option>
              {employeeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.description ? `${option.label} - ${option.description}` : option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Miesiąc karty</span>
            <select
              className="select-field"
              value={selectedMonthKey}
              onChange={(event) => {
                setSelectedMonthKey(event.target.value);
                setSelectedHistoricalCardId(null);
                setSaveError(null);
                setSaveStatus(null);
              }}
            >
              <option value="">Wybierz miesiąc</option>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {monthCreatorField}
        </FormGrid>

        <div className="summary-strip">
          <div className="summary-strip__primary">
            <span className="summary-strip__label">{currentModeLabel}</span>
            <strong className="summary-strip__value">{currentContextLabel}</strong>
            <span className="summary-strip__meta">{currentContextMeta}</span>
          </div>
          <span className="summary-strip__side">
            {formatNumber(employees.length)} aktywnych • {formatNumber(inactiveHistoricalEmployeesCount)} w historii
          </span>
        </div>

        {monthError ? <p className="status-message status-message--error">{monthError}</p> : null}
        {monthStatus ? <p className="status-message status-message--success">{monthStatus}</p> : null}
        {cardError ? <p className="status-message status-message--error">{cardError}</p> : null}
        {isCardLoading ? <p className="status-message">Ładuję wybraną kartę pracy.</p> : null}
        {saveError ? <p className="status-message status-message--error">{saveError}</p> : null}
        {saveStatus ? <p className="status-message status-message--success">{saveStatus}</p> : null}
      </Panel>
      {months.length === 0 ? (
        <Panel title="Brak miesięcy roboczych">
          <div className="status-stack">
            <p className="status-message">
              Najpierw przygotuj miesiąc roboczy w ewidencji czasu pracy. Karta pracy korzysta z tych samych miesięcy.
            </p>
            {monthCreatorField}
            <Link className="action-button action-button--secondary" href="/hours">
              Przejdź do ewidencji czasu pracy
            </Link>
          </div>
        </Panel>
      ) : !hasDisplayContext ? (
        <Panel title="Wybierz pracownika">
          <p className="status-message">
            Wybierz pracownika i miesiąc, aby otworzyć kartę pracy.
          </p>
        </Panel>
      ) : isHistoricalPreview && isCardLoading && !previewCard ? (
        <Panel title="Historyczna karta pracy">
          <p className="status-message">Ładuję historyczną kartę pracy.</p>
        </Panel>
      ) : isHistoricalPreview && !previewCard ? (
        <Panel title="Historyczna karta pracy">
          <p className="status-message">
            Nie udało się odnaleźć zapisanej karty dla wybranego pracownika.
          </p>
        </Panel>
      ) : (
        <Panel title={isHistoricalPreview ? "Historyczna karta pracy" : "Miesięczna karta pracy"}>
          <div className="work-card-meta">
            <div className="data-table__stack">
              <span className="data-table__primary">
                {displayedEmployeeLabel} | {selectedMonth?.month_label || formatMonthLabel(selectedMonthKey)}
              </span>
              {displayedEmployeeMeta ? (
                <span className="data-table__secondary">{displayedEmployeeMeta}</span>
              ) : null}
            </div>
            <div className="work-card-meta__legend">
              <span className="work-card-meta__badge">Weekend</span>
              <span className="work-card-meta__badge work-card-meta__badge--muted">
                Nieprzypisane
              </span>
            </div>
          </div>

          {isHistoricalPreview ? (
            <p className="status-message">
              To jest karta historyczna pracownika nieaktywnego. Ten widok pozostaje tylko do odczytu.
            </p>
          ) : null}

          <div className="work-card-grid">
            <div className="work-card-grid__row work-card-grid__row--head" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="work-card-grid__cell work-card-grid__cell--date">Dzień</div>
              {contractOptions.map((option) => (
                <div
                  key={`head-${option.id}`}
                  className={`work-card-grid__cell work-card-grid__cell--contract-head work-card-grid__cell--status-${option.status}`}
                  title={`${option.code} | ${option.label}`}
                >
                  <span className="work-card-grid__contract-code">{option.code}</span>
                  <span className="work-card-grid__contract-name">{option.label}</span>
                </div>
              ))}
              <div className="work-card-grid__cell work-card-grid__cell--total">Razem</div>
              <div className="work-card-grid__cell work-card-grid__cell--note">Opis pracy</div>
            </div>

            {draftRows.map((row) => (
              <div
                key={row.date}
                className={`work-card-grid__row${row.isWeekend ? " work-card-grid__row--weekend" : ""}${row.totalHours > 0 ? " work-card-grid__row--filled" : ""}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div className="work-card-grid__cell work-card-grid__cell--date">
                  <div className="work-card-grid__day">
                    <strong>{row.dayNumber}</strong>
                    <span>{row.weekdayLabel}</span>
                    {row.isWeekend ? <em>Weekend</em> : null}
                  </div>
                </div>

                {contractOptions.map((option) => {
                  const isLocked = option.status === "archived" || option.status === "missing";
                  return (
                    <div key={`${row.date}-${option.id}`} className="work-card-grid__cell">
                      <input
                        className={`text-input work-card-grid__hours-input${isLocked ? " work-card-grid__hours-input--locked" : ""}`}
                        inputMode="decimal"
                        value={row.hoursByContract[option.id] || ""}
                        onChange={(event) => handleHoursChange(row.date, option.id, event.target.value)}
                        placeholder="0"
                        disabled={!canWrite || isHistoricalPreview || isLocked}
                        title={
                          isLocked
                            ? `${option.label} jest archiwalny lub niedostępny do nowych wpisów.`
                            : `${option.label}`
                        }
                      />
                    </div>
                  );
                })}

                <div className="work-card-grid__cell work-card-grid__cell--total">
                  {formatHours(row.totalHours)}
                </div>

                <div className="work-card-grid__cell work-card-grid__cell--note">
                  <input
                    className="text-input work-card-grid__note-input"
                    value={row.note}
                    onChange={(event) => handleNoteChange(row.date, event.target.value)}
                    placeholder={row.isWeekend ? "Opcjonalna adnotacja weekendowa" : "Opcjonalny opis pracy"}
                    disabled={!canWrite || isHistoricalPreview}
                  />
                </div>
              </div>
            ))}

            <div className="work-card-grid__row work-card-grid__row--footer" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="work-card-grid__cell work-card-grid__cell--date">
                <div className="work-card-grid__day work-card-grid__day--summary">
                  <strong>Podsumowanie</strong>
                  <span>{formatNumber(filledDaysCount)} dni z wpisami</span>
                </div>
              </div>
              {contractOptions.map((option) => (
                <div key={`total-${option.id}`} className="work-card-grid__cell work-card-grid__cell--footer-value">
                  {formatHours(contractTotals.get(option.id) || 0)}
                </div>
              ))}
              <div className="work-card-grid__cell work-card-grid__cell--total work-card-grid__cell--footer-value">
                {formatHours(monthTotalHours)}
              </div>
              <div className="work-card-grid__cell work-card-grid__cell--note work-card-grid__cell--footer-note">
                {isHistoricalPreview
                  ? "Historia pracownika nieaktywnego zostaje zachowana tylko do odczytu."
                  : "Zapis tej karty aktualizuje miesięczną ewidencję czasu pracy bez podwójnego wprowadzania danych."}
              </div>
            </div>
          </div>
        </Panel>
      )}

      {historicalWorkCards.length > 0 ? (
        <Panel title="Historia pracowników nieaktywnych">
          <div className="work-card-history">
            {isHistoricalPreview ? (
              <div className="contracts-form__actions">
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedHistoricalCardId(null)}
                >
                  Wróć do aktywnej karty
                </ActionButton>
              </div>
            ) : null}

            <div className="work-card-history__list">
              {historicalWorkCards.map((item) => (
                <button
                  key={item.cardId}
                  type="button"
                  className={`work-card-history__item${selectedHistoricalCardId === item.cardId ? " work-card-history__item--active" : ""}`}
                  onClick={() => {
                    setSelectedHistoricalCardId(item.cardId);
                    setSelectedMonthKey(item.monthKey);
                    setSaveError(null);
                    setSaveStatus(null);
                  }}
                >
                  <span className="work-card-history__item-main">
                    <strong>{item.employeeLabel}</strong>
                    <span>{item.employeeMeta}</span>
                  </span>
                  <span className="work-card-history__item-side">
                    <strong>{item.monthLabel}</strong>
                    <span>
                      {formatHours(item.totalHours)} | {formatNumber(item.filledDays)} dni
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}

      <PdfExportDialog
        open={isPdfDialogOpen}
        title="PDF karty pracy"
        description="Wybierz sekcje dokumentu i kolumny tabel przed wydrukiem."
        context={[currentMonthLabel, displayedEmployeeLabel || "Brak pracownika", currentModeLabel].filter(Boolean)}
        sections={workCardPdfSections}
        onClose={() => setIsPdfDialogOpen(false)}
        onToggleSection={(sectionId) =>
          setWorkCardPdfConfig((current) => togglePdfSection(current, sectionId))
        }
        onToggleColumn={(sectionId, columnId) =>
          setWorkCardPdfConfig((current) => togglePdfColumn(current, sectionId, columnId))
        }
        onReset={() => setWorkCardPdfConfig(createPdfConfigState(workCardPdfDefinitions))}
        onConfirm={handleConfirmWorkCardPdf}
      />
    </div>
  );
}
