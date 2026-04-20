"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import {
  clearPlanningAssignmentRecord,
  copyPlanningFromPreviousDay,
  fetchPlanningModuleData,
  savePlanningAssignmentRecord,
} from "@/features/planning/api";
import {
  formatPlanningContractLabel,
  formatPlanningDate,
  formatPlanningMonthLabel,
} from "@/features/planning/formatters";
import {
  buildPlanningAbsenceRows,
  buildPlanningAssignmentEntries,
  buildPlanningCalendarCells,
  buildPlanningContractOptions,
  buildPlanningContractSummaryRows,
  buildPlanningDaySummary,
  buildPlanningDirectory,
  buildPlanningEmployeeRows,
  buildPlanningHistoricalCardRows,
  buildPlanningSummaryCards,
  getActivePlanningEmployees,
  resolveInitialPlanningDate,
  shiftPlanningMonth,
} from "@/features/planning/mappers";
import type {
  PlanningBootstrapData,
  PlanningContractSummaryRow,
  PlanningDraftRecord,
  PlanningEmployeeRow,
} from "@/features/planning/types";

type PlanningScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: PlanningBootstrapData };

function hasWriteAccess(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "administrator" || normalized === "kierownik";
}

function buildDrafts(rows: PlanningEmployeeRow[]): Record<string, PlanningDraftRecord> {
  return Object.fromEntries(
    rows.map((row) => [
      row.employee.key,
      {
        contractId:
          row.assignment?.contract && row.assignment.contract.status !== "archived"
            ? row.assignment.contract.id
            : "",
        note: row.assignment?.note || "",
      },
    ])
  );
}

function planningEmployeeColumns(args: {
  canWrite: boolean;
  contractOptions: ReturnType<typeof buildPlanningContractOptions>;
  drafts: Record<string, PlanningDraftRecord>;
  busyKey: string | null;
  onDraftChange: (employeeKey: string, patch: Partial<PlanningDraftRecord>) => void;
  onSave: (row: PlanningEmployeeRow) => void;
  onClear: (row: PlanningEmployeeRow) => void;
}): Array<DataTableColumn<PlanningEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "planning-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "planning-col-employee",
      sortValue: (row) =>
        `${formatEmployeeDisplayName(row.employee, row.employee.name)} ${row.employee.worker_code}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatEmployeeDisplayName(row.employee, row.employee.name)}
          </span>
          <span className="data-table__secondary">
            {row.employee.position || "Bez stanowiska"} • Kod {formatEmployeeCodeLabel(row.employee.worker_code)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status na dzień",
      className: "planning-col-status",
      sortValue: (row) => `${row.statusLabel} ${row.assignment?.contractName || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={[
              "data-table__status-pill",
              row.statusTone === "warning"
                ? "data-table__status-pill--warning"
                : row.statusTone === "danger"
                  ? "planning-status-pill--danger"
                  : row.statusTone === "ok"
                    ? ""
                    : "data-table__status-pill--muted",
            ].join(" ")}
          >
            {row.statusLabel}
          </span>
          <span className="data-table__secondary">
            {row.assignment?.contractName
              ? `Obecnie: ${row.assignment.contractName}`
              : "Brak przypisania"}
          </span>
        </div>
      ),
    },
    {
      key: "contract",
      header: "Kontrakt",
      className: "planning-col-contract",
      sortValue: (row) => row.assignment?.contractName || "",
      render: (row) => {
        const draft = args.drafts[row.employee.key] || { contractId: "", note: "" };
        const hasCurrentMissingContract =
          Boolean(row.assignment?.contractName) &&
          (!row.assignment?.contract || row.assignment.contract.status === "archived");

        return (
          <div className="planning-row-field">
            <select
              className="select-field planning-row-field__select"
              value={draft.contractId}
              disabled={!args.canWrite || Boolean(row.absence)}
              onChange={(event) =>
                args.onDraftChange(row.employee.key, { contractId: event.target.value })
              }
            >
              <option value="">Bez przypisania</option>
              {args.contractOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {hasCurrentMissingContract ? (
              <span className="data-table__secondary">
                W store jest przypisanie do kontraktu spoza aktywnego rejestru. Wybierz nowy
                kontrakt albo wyczyść wpis.
              </span>
            ) : row.assignment?.contract ? (
              <span className="data-table__secondary">
                {formatPlanningContractLabel(
                  row.assignment.contract.contract_number,
                  row.assignment.contract.name
                )}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "note",
      header: "Uwagi",
      className: "planning-col-note",
      sortValue: (row) => row.assignment?.note || "",
      render: (row) => {
        const draft = args.drafts[row.employee.key] || { contractId: "", note: "" };
        return (
          <input
            className="text-input planning-row-field__input"
            value={draft.note}
            disabled={!args.canWrite || Boolean(row.absence)}
            onChange={(event) =>
              args.onDraftChange(row.employee.key, { note: event.target.value })
            }
          />
        );
      },
    },
    {
      key: "actions",
      header: "Akcje",
      className: "planning-col-actions",
      sortable: false,
      render: (row) => {
        const rowBusy = args.busyKey === row.employee.key;
        return (
          <div className="planning-row-actions">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={!args.canWrite || Boolean(row.absence) || rowBusy}
              onClick={(event) => {
                event.stopPropagation();
                args.onSave(row);
              }}
            >
              {rowBusy ? "Zapisywanie..." : "Zapisz"}
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              disabled={!args.canWrite || rowBusy}
              onClick={(event) => {
                event.stopPropagation();
                args.onClear(row);
              }}
            >
              Wyczyść
            </ActionButton>
          </div>
        );
      },
    },
  ];
}

function planningContractsColumns(): Array<DataTableColumn<PlanningContractSummaryRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "planning-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "contract",
      header: "Kontrakt",
      className: "planning-col-contract-summary",
      sortValue: (row) => `${row.contract.contract_number} ${row.contract.name}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatPlanningContractLabel(row.contract.contract_number, row.contract.name)}
          </span>
          <span className="data-table__secondary">{row.contract.investor || "Bez inwestora"}</span>
        </div>
      ),
    },
    {
      key: "staffing",
      header: "Obsada",
      className: "planning-col-status",
      sortValue: (row) => row.assignedEmployees.length,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.staffingStatus}</span>
          <span className="data-table__secondary">
            {row.assignedEmployees.length} prac.
          </span>
        </div>
      ),
    },
    {
      key: "employees",
      header: "Przypisani pracownicy",
      className: "planning-col-employees",
      sortValue: (row) => row.assignedEmployees.join(", "),
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.assignedEmployees.length
              ? row.assignedEmployees.join(", ")
              : "Brak przypisanych pracowników"}
          </span>
        </div>
      ),
    },
  ];
}

export function PlanningView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: PlanningBootstrapData;
  initialError?: string;
}) {
  const { user } = useAuth();
  const [state, setState] = useState<PlanningScreenState>(() => {
    if (initialBootstrap) {
      return { status: "success", data: initialBootstrap };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [selectedDate, setSelectedDate] = useState(
    initialBootstrap ? resolveInitialPlanningDate(initialBootstrap.planningStore) : ""
  );
  const [monthCursor, setMonthCursor] = useState(() =>
    (initialBootstrap
      ? resolveInitialPlanningDate(initialBootstrap.planningStore)
      : new Date().toISOString().slice(0, 10)
    ).slice(0, 7)
  );
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, PlanningDraftRecord>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);

  const canWrite = hasWriteAccess(user?.role);
  const bootstrap = state.status === "success" ? state.data : null;

  const employeeDirectory = useMemo(
    () => (bootstrap ? buildPlanningDirectory(bootstrap) : []),
    [bootstrap]
  );
  const activeEmployees = useMemo(
    () => getActivePlanningEmployees(employeeDirectory),
    [employeeDirectory]
  );
  const contractOptions = useMemo(
    () => (bootstrap ? buildPlanningContractOptions(bootstrap.contracts) : []),
    [bootstrap]
  );
  const allRows = useMemo(() => {
    if (!bootstrap || !selectedDate) return [];
    return buildPlanningEmployeeRows({
      dateKey: selectedDate,
      employees: activeEmployees,
      allEmployees: employeeDirectory,
      contracts: bootstrap.contracts,
      planningStore: bootstrap.planningStore,
      vacationStore: bootstrap.vacationStore,
    });
  }, [activeEmployees, bootstrap, employeeDirectory, selectedDate]);
  const visibleRows = useMemo(() => {
    if (!bootstrap || !selectedDate) return [];
    return buildPlanningEmployeeRows({
      dateKey: selectedDate,
      employees: activeEmployees,
      allEmployees: employeeDirectory,
      contracts: bootstrap.contracts,
      planningStore: bootstrap.planningStore,
      vacationStore: bootstrap.vacationStore,
      search,
    });
  }, [activeEmployees, bootstrap, employeeDirectory, search, selectedDate]);
  const daySummary = useMemo(
    () =>
      buildPlanningDaySummary({
        dateKey: selectedDate,
        rows: allRows,
        contracts: bootstrap?.contracts || [],
      }),
    [allRows, bootstrap?.contracts, selectedDate]
  );
  const historicalRows = useMemo(() => {
    if (!bootstrap || !selectedDate) return [];
    return buildPlanningHistoricalCardRows({
      dateKey: selectedDate,
      employees: employeeDirectory,
      contracts: bootstrap.contracts,
      planningStore: bootstrap.planningStore,
    });
  }, [bootstrap, employeeDirectory, selectedDate]);
  const summaryCards = useMemo(
    () =>
      buildPlanningSummaryCards({
        daySummary,
        historicalCount: historicalRows.length,
      }),
    [daySummary, historicalRows.length]
  );
  const contractSummaryRows = useMemo(
    () =>
      buildPlanningContractSummaryRows({
        rows: allRows,
        contracts: bootstrap?.contracts || [],
      }),
    [allRows, bootstrap?.contracts]
  );
  const calendarCells = useMemo(() => {
    if (!bootstrap) return [];
    return buildPlanningCalendarCells({
      monthKey: monthCursor,
      selectedDate,
      activeEmployees,
      allEmployees: employeeDirectory,
      contracts: bootstrap.contracts,
      planningStore: bootstrap.planningStore,
      vacationStore: bootstrap.vacationStore,
    });
  }, [activeEmployees, bootstrap, employeeDirectory, monthCursor, selectedDate]);
  const absenceRows = useMemo(() => {
    if (!bootstrap || !selectedDate) return [];
    return buildPlanningAbsenceRows({
      dateKey: selectedDate,
      activeEmployees,
      allEmployees: employeeDirectory,
      vacationStore: bootstrap.vacationStore,
    });
  }, [activeEmployees, bootstrap, employeeDirectory, selectedDate]);

  useEffect(() => {
    if (!bootstrap) return;
    const nextDate = selectedDate || resolveInitialPlanningDate(bootstrap.planningStore);
    if (!selectedDate) {
      setSelectedDate(nextDate);
      setMonthCursor(nextDate.slice(0, 7));
    }
  }, [bootstrap, selectedDate]);

  useEffect(() => {
    setDrafts(buildDrafts(allRows));
  }, [allRows, selectedDate]);

  async function refreshModule(message?: string) {
    setLoadingMessage("Odświeżam planowanie...");
    setState({ status: "loading" });
    setStatusMessage(null);
    try {
      const nextBootstrap = await fetchPlanningModuleData();
      setState({ status: "success", data: nextBootstrap });
      const nextDate = selectedDate || resolveInitialPlanningDate(nextBootstrap.planningStore);
      setSelectedDate(nextDate);
      setMonthCursor(nextDate.slice(0, 7));
      if (message) {
        setStatusMessage({ tone: "success", text: message });
      }
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się odświeżyć modułu planowania.",
      });
    } finally {
      setLoadingMessage("");
    }
  }

  async function handleSave(row: PlanningEmployeeRow) {
    if (!bootstrap) return;
    const draft = drafts[row.employee.key] || { contractId: "", note: "" };
    setBusyKey(row.employee.key);
    setStatusMessage(null);

    try {
      const nextBootstrap = await savePlanningAssignmentRecord({
        dateKey: selectedDate,
        employeeKey: row.employee.key,
        contractId: draft.contractId,
        note: draft.note,
        bootstrap,
      });
      setState({ status: "success", data: nextBootstrap });
      setStatusMessage({
        tone: "success",
        text: `Zapisano plan dla ${row.employee.name} na ${formatPlanningDate(selectedDate)}.`,
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać wpisu planowania.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleClear(row: PlanningEmployeeRow) {
    if (!bootstrap) return;
    setBusyKey(row.employee.key);
    setStatusMessage(null);

    try {
      const nextBootstrap = await clearPlanningAssignmentRecord({
        dateKey: selectedDate,
        employeeKey: row.employee.key,
        bootstrap,
      });
      setState({ status: "success", data: nextBootstrap });
      setStatusMessage({
        tone: "success",
        text: `Wyczyszczono przypisanie ${row.employee.name} z dnia ${formatPlanningDate(selectedDate)}.`,
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się wyczyścić wpisu planowania.",
      });
    } finally {
      setBusyKey(null);
    }
  }

  async function handleCopyPreviousDay() {
    if (!bootstrap) return;
    setLoadingMessage("Kopiuję plan z poprzedniego dnia...");
    setStatusMessage(null);
    try {
      const nextBootstrap = await copyPlanningFromPreviousDay({
        targetDateKey: selectedDate,
        bootstrap,
      });
      setState({ status: "success", data: nextBootstrap });
      setStatusMessage({
        tone: "success",
        text: `Skopiowano plan z poprzedniego dnia do ${formatPlanningDate(selectedDate)}.`,
      });
    } catch (error) {
      setStatusMessage({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udało się skopiować poprzedniego dnia.",
      });
    } finally {
      setLoadingMessage("");
    }
  }

  if (state.status === "loading") {
    return (
      <div className="screen-state">
        <p>{loadingMessage || "Ładowanie modułu planowania..."}</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="screen-state">
        <p>{state.message}</p>
        <ActionButton type="button" onClick={() => refreshModule()}>
          Spróbuj ponownie
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Planowanie zasobów"
        title="Planowanie zasobów"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              {canWrite ? (
                <ActionButton type="button" onClick={handleCopyPreviousDay}>
                  Skopiuj poprzedni dzień
                </ActionButton>
              ) : null}
            </div>
            <div className="module-actions__secondary">
              <ActionButton type="button" variant="secondary" onClick={() => refreshModule()}>
                Odśwież
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="planning-toolbar">
        <div className="planning-toolbar__filters">
          <label className="form-field">
            <span>Dzień planu</span>
            <input
              className="text-input"
              type="date"
              value={selectedDate}
              onChange={(event) => {
                setSelectedDate(event.target.value);
                setMonthCursor(event.target.value.slice(0, 7));
              }}
            />
          </label>
          <label className="form-field planning-toolbar__search">
            <span>Szukaj pracownika</span>
            <SearchField
              placeholder="Nazwisko, kod, stanowisko"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>

      <FormFeedback
        items={[
          statusMessage
            ? { tone: statusMessage.tone, text: statusMessage.text }
            : null,
        ]}
      />

      <div className="module-page__stats">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <div className="planning-layout">
        <div className="planning-main-stack">
            <Panel title="Plan dnia">
              <DataTable
              columns={planningEmployeeColumns({
                canWrite,
                contractOptions,
                drafts,
                busyKey,
                onDraftChange: (employeeKey, patch) =>
                  setDrafts((current) => ({
                    ...current,
                    [employeeKey]: {
                      ...(current[employeeKey] || { contractId: "", note: "" }),
                      ...patch,
                    },
                  })),
                onSave: handleSave,
                onClear: handleClear,
              })}
              rows={visibleRows}
              rowKey={(row) => row.employee.key}
              emptyMessage="Brak pracowników spełniających aktualny filtr."
              tableClassName="planning-table"
            />
          </Panel>

            <Panel title="Obsada kontraktów na wybrany dzień">
            <div className="planning-summary-notes">
              <div className="planning-summary-note">
                <strong>Bez przypisania</strong>
                <span>
                  {daySummary.unassignedNames.length
                    ? daySummary.unassignedNames.join(", ")
                    : "Wszyscy dostępni pracownicy mają przypisanie albo nieobecność."}
                </span>
              </div>
              <div className="planning-summary-note">
                <strong>Niedostępni</strong>
                <span>
                  {daySummary.unavailableNames.length
                    ? daySummary.unavailableNames.join(", ")
                    : "Brak zatwierdzonych nieobecności na wybrany dzień."}
                </span>
              </div>
            </div>
            <DataTable
              columns={planningContractsColumns()}
              rows={contractSummaryRows}
              rowKey={(row) => row.contract.id}
              emptyMessage="Brak aktywnych kontraktów do planowania."
              tableClassName="planning-table planning-table--contracts"
            />
          </Panel>
        </div>

        <div className="planning-side-stack">
          <Panel title="Kalendarz planowania">
            <div className="planning-calendar__header">
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => setMonthCursor((current) => shiftPlanningMonth(current, -1))}
              >
                Poprzedni
              </ActionButton>
              <strong>{formatPlanningMonthLabel(monthCursor)}</strong>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => setMonthCursor((current) => shiftPlanningMonth(current, 1))}
              >
                Następny
              </ActionButton>
            </div>
            <div className="planning-calendar__legend">
              <span>Przypisania</span>
              <span>Nieobecności</span>
              <span>Historia</span>
            </div>
            <div className="planning-calendar">
              {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"].map((day) => (
                <div key={day} className="planning-calendar__weekday">
                  {day}
                </div>
              ))}
              {calendarCells.map((cell) => (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={[
                    "planning-calendar__day",
                    cell.isOutsideMonth ? "is-outside" : "",
                    cell.isSelected ? "is-selected" : "",
                  ].join(" ")}
                  onClick={() => {
                    setSelectedDate(cell.dateKey);
                    setMonthCursor(cell.dateKey.slice(0, 7));
                  }}
                >
                  <strong>{cell.dayNumber}</strong>
                  <small>P: {cell.assignmentCount}</small>
                  <small>N: {cell.absenceCount}</small>
                  <small>H: {cell.historicalCount}</small>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Nieobecności na wybrany dzień">
            <div className="planning-side-list">
              {absenceRows.length ? (
                absenceRows.map((item) => (
                  <article key={item.name} className="planning-side-list__item">
                    <strong>{item.name}</strong>
                    <span>{item.label}</span>
                  </article>
                ))
              ) : (
                <p className="status-message">Brak zatwierdzonych nieobecności na wybrany dzień.</p>
              )}
            </div>
          </Panel>

          <Panel title="Historia i wpisy wymagające uwagi">
            <div className="planning-side-list">
              {historicalRows.length ? (
                historicalRows.map((row) => (
                  <article
                    key={`${row.entry.rawKey}-${row.entry.contractId || row.entry.contractName}`}
                    className="planning-side-list__item"
                  >
                    <strong>{row.employeeLabel}</strong>
                    <span>{row.contractLabel}</span>
                    <span>{row.entry.note || row.entry.resolutionLabel}</span>
                  </article>
                ))
              ) : (
                <p className="status-message">Brak historycznych lub niejednoznacznych wpisów na ten dzień.</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
