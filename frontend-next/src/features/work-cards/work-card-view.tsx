"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { saveHoursMonth } from "@/features/hours/api";
import { buildMonthOptions, getSelectedMonth } from "@/features/hours/mappers";
import type { HoursEmployeeRecord, HoursMonthRecord } from "@/features/hours/types";
import { fetchWorkCardBootstrapClient, saveWorkCardAndSync } from "@/features/work-cards/api";
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
  findWorkCard,
  serializeWorkCard,
  upsertWorkCard,
} from "@/features/work-cards/mappers";
import type {
  WorkCardBootstrapData,
  WorkCardDayViewModel,
  WorkCardStore,
} from "@/features/work-cards/types";

type LoadState =
  | { status: "loading" }
  | { status: "success" }
  | { status: "error"; message: string };

type WorkCardHistoryPreview = {
  cardId: string;
  card: WorkCardBootstrapData["store"]["cards"][number];
  employee: HoursEmployeeRecord | null;
  employeeLabel: string;
  employeeMeta: string;
  monthKey: string;
  monthLabel: string;
  totalHours: number;
  filledDays: number;
};

function hasWriteAccess(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "kierownik";
}

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
  initialError,
}: {
  initialBootstrap?: WorkCardBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = hasWriteAccess(user?.role);

  const [contracts, setContracts] = useState(initialBootstrap?.contracts ?? []);
  const [employees, setEmployees] = useState(initialBootstrap?.employees ?? []);
  const [historicalEmployees, setHistoricalEmployees] = useState(
    initialBootstrap?.historicalEmployees ?? initialBootstrap?.employees ?? []
  );
  const [months, setMonths] = useState<HoursMonthRecord[]>(initialBootstrap?.months ?? []);
  const [store, setStore] = useState<WorkCardStore>(
    initialBootstrap?.store ?? {
      version: 1,
      cards: [],
    }
  );
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
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingMonth, setIsCreatingMonth] = useState(false);
  const [monthStatus, setMonthStatus] = useState<string | null>(null);
  const [monthError, setMonthError] = useState<string | null>(null);
  const [newMonthYear, setNewMonthYear] = useState(String(new Date().getFullYear()));
  const [newMonthNumber, setNewMonthNumber] = useState(
    String(new Date().getMonth() + 1).padStart(2, "0")
  );
  const [selectedHistoricalCardId, setSelectedHistoricalCardId] = useState<string | null>(null);

  async function reloadWorkCards(options?: { preserveSelection?: boolean }) {
    if (options?.preserveSelection) {
      setIsRefreshing(true);
    } else {
      setLoadState({ status: "loading" });
    }

    try {
      const bootstrap = await fetchWorkCardBootstrapClient();
      const defaults = buildWorkCardBootstrapSelection(bootstrap);

      setContracts(bootstrap.contracts);
      setEmployees(bootstrap.employees);
      setHistoricalEmployees(bootstrap.historicalEmployees);
      setMonths(bootstrap.months);
      setStore(bootstrap.store);
      setSelectedMonthKey((current) =>
        bootstrap.months.some((month) => month.month_key === current)
          ? current
          : defaults.monthKey
      );
      const employeeOptions = buildWorkCardEmployeeOptions(bootstrap.employees);
      setSelectedEmployeeKey((current) =>
        employeeOptions.some((option) => option.key === current)
          ? current
          : defaults.employeeKey
      );
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

  useEffect(() => {
    if (initialBootstrap) {
      return;
    }

    void reloadWorkCards();
  }, [initialBootstrap, initialError]);

  const employeeOptions = useMemo(
    () => buildWorkCardEmployeeOptions(employees),
    [employees]
  );
  const historicalWorkCards = useMemo<WorkCardHistoryPreview[]>(() => {
    return store.cards
      .map((card) => {
        const normalizedEmployeeId = String(card.employee_id || "").trim();
        const employee =
          historicalEmployees.find((candidate) => {
            const candidateId = String(candidate.id || "").trim();
            if (normalizedEmployeeId && candidateId) {
              return candidateId === normalizedEmployeeId;
            }

            return (
              normalizeEmployeeLookupKey(candidate.name) ===
              normalizeEmployeeLookupKey(card.employee_name)
            );
          }) ?? null;

        if ((employee?.status ?? "active") !== "inactive") {
          return null;
        }

        const totals = card.rows.reduce(
          (result, row) => {
            const rowHours = row.entries.reduce(
              (sum, entry) => sum + Number(entry.hours || 0),
              0
            );
            return {
              totalHours: result.totalHours + rowHours,
              filledDays: result.filledDays + (rowHours > 0 ? 1 : 0),
            };
          },
          { totalHours: 0, filledDays: 0 }
        );
        const employeeOption = employee
          ? buildWorkCardEmployeeOptions([employee])[0] ?? null
          : null;

        return {
          cardId: card.id,
          card,
          employee,
          employeeLabel: String(employee?.name || card.employee_name || "Nieznany pracownik").trim(),
          employeeMeta:
            employeeOption?.description ||
            (card.employee_id ? `ID ${card.employee_id}` : "Pracownik nieaktywny"),
          monthKey: card.month_key,
          monthLabel: card.month_label || formatMonthLabel(card.month_key),
          totalHours: totals.totalHours,
          filledDays: totals.filledDays,
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
  }, [historicalEmployees, store.cards]);
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
    selectedHistoricalCard?.employeeLabel || selectedEmployee?.name || "";
  const displayedEmployeeMeta =
    selectedHistoricalCard?.employeeMeta || selectedEmployeeOption?.description || "";
  const hasDisplayContext = Boolean(selectedHistoricalCard || selectedEmployee);

  const selectedMonth = useMemo(
    () => getSelectedMonth(months, selectedMonthKey),
    [months, selectedMonthKey]
  );

  const activeCard = useMemo(
    () =>
      selectedEmployee
        ? findWorkCard(store, selectedMonthKey, selectedEmployee.name, selectedEmployee.id)
        : null,
    [selectedEmployee, selectedMonthKey, store]
  );
  const previewCard = selectedHistoricalCard?.card ?? activeCard;

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
      setMonthError("Podaj poprawny rok i miesiąc nowej karty.");
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
      setSelectedHistoricalCardId(null);
      setMonthStatus(`Dodano miesiąc ${formatMonthLabel(nextMonthKey)}.`);
    } catch (error) {
      setMonthError(
        error instanceof Error ? error.message : "Nie udało się dodać miesiąca."
      );
    } finally {
      setIsCreatingMonth(false);
    }
  }

  async function handleSaveCard() {
    setSaveError(null);
    setSaveStatus(null);

    if (!canWrite) {
      setSaveError("Masz dostęp tylko do podglądu kart pracy.");
      return;
    }

    if (isHistoricalPreview) {
      setSaveError("Historyczne karty pracowników nieaktywnych są tylko do odczytu.");
      return;
    }

    if (!selectedEmployee || !selectedMonthKey || !selectedMonth) {
      setSaveError("Wybierz pracownika i miesiąc karty pracy.");
      return;
    }

    try {
      const nextCard = serializeWorkCard({
        rows: draftRows,
        employee: selectedEmployee,
        monthKey: selectedMonthKey,
        monthLabel: selectedMonth.month_label || formatMonthLabel(selectedMonthKey),
        contractOptions,
        existingCard: activeCard,
      });
      const nextStore = upsertWorkCard(store, nextCard);

      setIsSaving(true);
      const result = await saveWorkCardAndSync({
        store: nextStore,
        card: nextCard,
        employee: selectedEmployee,
        employees,
        syncableContractIds: contractOptions
          .filter((option) => option.status === "active")
          .map((option) => option.id),
      });

      setStore(result.store);
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
          {Array.from({ length: 5 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Karty pracy">
          <p className="status-message">Ładuję pracowników, miesiące i aktywne kontrakty.</p>
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
  const monthCreator = canWrite ? (
    <div className="status-stack">
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
      {monthError ? <p className="status-message status-message--error">{monthError}</p> : null}
      {monthStatus ? <p className="status-message status-message--success">{monthStatus}</p> : null}
    </div>
  ) : null;

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Godziny"
        title="Karty pracy"
        actions={
          <div className="section-header__actions-stack">
            <Link className="action-button action-button--ghost" href="/hours">
              Otwórz ewidencję
            </Link>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void reloadWorkCards({ preserveSelection: true })}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
            </ActionButton>
            {canWrite ? (
              <ActionButton
                type="button"
                onClick={() => void handleSaveCard()}
                disabled={isSaving || !selectedEmployee || !selectedMonthKey || isHistoricalPreview}
              >
                {isSaving ? "Zapisywanie..." : "Zapisz kartę pracy"}
              </ActionButton>
            ) : null}
          </div>
        }
      />

      <Panel className="panel--toolbar panel--info">
        {monthCreator}

        <div className="hours-info-panel">
          <div className="data-table__stack">
            <span className="data-table__primary">To jest główny moduł wpisywania godzin</span>
            <span className="data-table__secondary">
              Wybierasz pracownika i miesiąc, wpisujesz godziny przy aktywnych kontraktach dla kolejnych dni, a Ewidencja czasu pracy aktualizuje się automatycznie jako widok zbiorczy.
            </span>
          </div>
          <Link className="action-button action-button--secondary" href="/hours">
            Zobacz ewidencję zbiorczą
          </Link>
        </div>
      </Panel>

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <FormGrid columns={3}>
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
                    {option.description
                      ? `${option.label} — ${option.description}`
                      : option.label}
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

          <div className="work-card-toolbar__meta">
            <span className="work-card-toolbar__title">Tryb pracy</span>
            <span className="work-card-toolbar__value">
              Nowe karty tworzysz tylko dla aktywnych pracowników, a historia nieaktywnych zostaje niżej w osobnym widoku.
            </span>
          </div>
        </FormGrid>

        <div className="hours-info-panel">
          <div className="data-table__stack">
            <span className="data-table__primary">
              Aktywna pula do nowych kart i historia nieaktywnych sÄ… rozdzielone
            </span>
            <span className="data-table__secondary">
              NowÄ… kartÄ™ pracy tworzysz tylko dla aktywnych pracownikÃ³w. Nieaktywni zostajÄ… poniÅ¼ej wyÅ‚Ä…cznie
              w warstwie historii i odczytu.
            </span>
          </div>
          <div className="hours-runtime-legend">
            <span className="hours-runtime-legend__item">
              <strong>{formatNumber(employees.length)}</strong>
              <span>aktywni do nowych kart</span>
            </span>
            <span className="hours-runtime-legend__item hours-runtime-legend__item--muted">
              <strong>{formatNumber(inactiveHistoricalEmployeesCount)}</strong>
              <span>nieaktywni tylko w historii</span>
            </span>
          </div>
        </div>

        {saveError ? <p className="status-message status-message--error">{saveError}</p> : null}
        {saveStatus ? <p className="status-message status-message--success">{saveStatus}</p> : null}
      </Panel>

      {historicalWorkCards.length > 0 ? (
        <Panel title="Historia pracowników nieaktywnych">
          <div className="work-card-history">
            <div className="hours-info-panel">
              <div className="data-table__stack">
                <span className="data-table__primary">Nieaktywni pracownicy są dostępni tylko historycznie</span>
                <span className="data-table__secondary">
                  Nie pojawiają się już w selektorze nowych kart pracy, ale ich zapisane miesiące możesz tutaj otworzyć do odczytu.
                </span>
              </div>
              {isHistoricalPreview ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  onClick={() => setSelectedHistoricalCardId(null)}
                >
                  Wróć do aktywnej karty
                </ActionButton>
              ) : null}
            </div>

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
                      {formatHours(item.totalHours)} • {formatNumber(item.filledDays)} dni
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </Panel>
      ) : null}

      {months.length === 0 ? (
        <Panel title="Brak miesięcy roboczych">
          <div className="status-stack">
            <p className="status-message">
              Najpierw przygotuj miesiąc roboczy w ewidencji czasu pracy. Karta pracy wykorzystuje ten sam model miesięcy i potem zasila go automatycznie.
            </p>
            {monthCreator}
            <Link className="action-button action-button--secondary" href="/hours">
              Przejdź do ewidencji czasu pracy
            </Link>
          </div>
        </Panel>
      ) : !hasDisplayContext ? (
        <Panel title="Wybierz pracownika">
          <p className="status-message">
            Wybierz pracownika z kartoteki, aby wygenerować jego miesięczną kartę pracy.
          </p>
        </Panel>
      ) : (
        <Panel title={isHistoricalPreview ? "Historyczna karta pracy" : "Miesięczna karta pracy"}>
          <div className="work-card-meta">
            <div className="data-table__stack">
              <span className="data-table__primary">
                {displayedEmployeeLabel} • {selectedMonth?.month_label || formatMonthLabel(selectedMonthKey)}
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
              To jest karta historyczna pracownika nieaktywnego. Dane pozostają widoczne, ale nie można już tworzyć ani zapisywać nowych operacji z tego widoku.
            </p>
          ) : null}

          <div className="work-card-grid">
            <div className="work-card-grid__row work-card-grid__row--head" style={{ gridTemplateColumns: gridTemplate }}>
              <div className="work-card-grid__cell work-card-grid__cell--date">Dzień</div>
              {contractOptions.map((option) => (
                <div
                  key={`head-${option.id}`}
                  className={`work-card-grid__cell work-card-grid__cell--contract-head work-card-grid__cell--status-${option.status}`}
                  title={`${option.code} • ${option.label}`}
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
    </div>
  );
}
