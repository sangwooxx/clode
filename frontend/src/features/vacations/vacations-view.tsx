"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import {
  deleteVacationRequestRecord,
  fetchVacationsModuleData,
  saveVacationBalanceRecord,
  saveVacationRequestRecord,
  updateVacationRequestStatus,
} from "@/features/vacations/api";
import {
  formatVacationDateRange,
  formatVacationDays,
  formatVacationStatus,
  formatVacationType,
} from "@/features/vacations/formatters";
import { VacationsEmployeePanel } from "@/features/vacations/components/VacationsEmployeePanel";
import {
  type VacationEmployeeFilter,
  VacationsToolbar,
} from "@/features/vacations/components/VacationsToolbar";
import { VacationsRequestPanel } from "@/features/vacations/components/VacationsRequestPanel";
import {
  buildVacationBalanceFormValues,
  buildVacationApprovalMessage,
  buildVacationDirectory,
  buildVacationEmployeeOptions,
  buildVacationEmployeeRows,
  buildVacationHistoryRows,
  buildVacationRequestFormValues,
  buildVacationStatsForEmployee,
  buildVacationSummaryCards,
  canApproveVacationWorkflow,
  findVacationEmployeeByKey,
  getVacationBalanceForEmployee,
  findVacationRequestById,
  normalizeVacationStore,
  resolveVacationEditingEmployee,
  resolveVacationApprovalMode,
} from "@/features/vacations/mappers";
import type {
  VacationApprovalRow,
  VacationBalanceFormValues,
  VacationEmployeeRow,
  VacationHistoryRow,
  VacationRequestFormValues,
  VacationsBootstrapData,
} from "@/features/vacations/types";
import { buildVacationApprovalRows } from "@/features/vacations/mappers";

type VacationsScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: VacationsBootstrapData };

function normalizeVacationStatus(value: unknown) {
  return value === "approved" || value === "rejected" ? value : "pending";
}

function employeeTableColumns(): Array<DataTableColumn<VacationEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "vacations-col-employee",
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
      header: "Status i wpisy",
      className: "vacations-col-status",
      sortValue: (row) => `${row.employee.status} ${row.stats.requests_count}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.employee.status === "inactive"
                ? "data-table__status-pill data-table__status-pill--muted"
                : "data-table__status-pill"
            }
          >
            {row.employee.status === "inactive" ? "Nieaktywny" : "Aktywny"}
          </span>
          <span className="data-table__secondary">
            {row.stats.requests_count} wpisów • {row.stats.approved_requests} zatwierdz.
          </span>
        </div>
      ),
    },
    {
      key: "pool",
      header: "Pula",
      className: "vacations-col-pool",
      sortValue: (row) => row.stats.remaining_days,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.stats.total_pool)} dni</span>
          <span className="data-table__secondary">
            Pozostało {formatVacationDays(row.stats.remaining_days)} dni
          </span>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Wykorzystanie",
      className: "vacations-col-usage",
      sortValue: (row) => row.stats.used_days,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            Wykorzystane {formatVacationDays(row.stats.used_days)}
          </span>
          <span className="data-table__secondary">
            Oczekujące {formatVacationDays(row.stats.pending_days)}
          </span>
        </div>
      ),
    },
  ];
}

function historyTableColumns(args: {
  canWrite: boolean;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
}): Array<DataTableColumn<VacationHistoryRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "range",
      header: "Zakres i typ",
      className: "vacations-col-range",
      sortValue: (row) => `${row.request.start_date} ${row.request.end_date} ${row.request.type}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationType(row.request.type)}</span>
          <span className="data-table__secondary">
            {formatVacationDateRange(row.request.start_date, row.request.end_date)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Dni / status",
      className: "vacations-col-status",
      sortValue: (row) => `${normalizeVacationStatus(row.request.status)} ${row.request.days}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.request.days)} dni</span>
          <span className="data-table__secondary">
            <span
              className={
                normalizeVacationStatus(row.request.status) === "approved"
                  ? "data-table__status-pill"
                  : normalizeVacationStatus(row.request.status) === "rejected"
                    ? "data-table__status-pill data-table__status-pill--muted"
                    : "data-table__status-pill data-table__status-pill--warning"
              }
            >
              {formatVacationStatus(row.request.status)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "meta",
      header: "Operacyjnie",
      className: "vacations-col-meta",
      sortValue: (row) => `${row.request.requested_by || ""} ${row.request.notes || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.request.requested_by || "Brak autora"}</span>
          <span className="data-table__secondary">{row.request.notes || "Bez uwag"}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "vacations-col-actions",
      sortable: false,
      render: (row) => (
        <div className="vacations-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onEdit(row.request.id);
            }}
          >
            Edytuj
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onDelete(row.request.id);
            }}
          >
            Usuń
          </ActionButton>
        </div>
      ),
    },
  ];
}

function approvalsTableColumns(args: {
  canWrite: boolean;
  canApprove: boolean;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}): Array<DataTableColumn<VacationApprovalRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "vacations-col-employee",
      sortValue: (row) => `${row.displayName} ${row.subtitle}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.displayName}</span>
          <span className="data-table__secondary">{row.subtitle}</span>
        </div>
      ),
    },
    {
      key: "range",
      header: "Zakres i typ",
      className: "vacations-col-range",
      sortValue: (row) => `${row.request.start_date} ${row.request.end_date} ${row.request.type}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationType(row.request.type)}</span>
          <span className="data-table__secondary">
            {formatVacationDateRange(row.request.start_date, row.request.end_date)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status / dni",
      className: "vacations-col-status",
      sortValue: (row) => `${normalizeVacationStatus(row.request.status)} ${row.request.days}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.request.days)} dni</span>
          <span className="data-table__secondary">
            <span
              className={
                normalizeVacationStatus(row.request.status) === "approved"
                  ? "data-table__status-pill"
                  : normalizeVacationStatus(row.request.status) === "rejected"
                    ? "data-table__status-pill data-table__status-pill--muted"
                    : "data-table__status-pill data-table__status-pill--warning"
              }
            >
              {formatVacationStatus(row.request.status)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "vacations-col-actions vacations-col-actions--wide",
      sortable: false,
      render: (row) => (
        <div className="vacations-approval-actions">
          <div className="vacations-row-actions">
            <ActionButton
              type="button"
              variant="secondary"
              disabled={!args.canWrite}
              onClick={(event) => {
                event.stopPropagation();
                args.onEdit(row.request.id);
              }}
            >
              Edytuj
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              disabled={!args.canWrite}
              onClick={(event) => {
                event.stopPropagation();
                args.onDelete(row.request.id);
              }}
            >
              Usuń
            </ActionButton>
          </div>
          {args.canApprove && normalizeVacationStatus(row.request.status) === "pending" ? (
            <div className="vacations-row-actions">
              <ActionButton
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  args.onApprove(row.request.id);
                }}
              >
                Zatwierdź
              </ActionButton>
              <ActionButton
                type="button"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  args.onReject(row.request.id);
                }}
              >
                Odrzuć
              </ActionButton>
            </div>
          ) : (
            <span className="data-table__secondary">
              {row.request.requested_by || "Brak akcji"}
            </span>
          )}
        </div>
      ),
    },
  ];
}

export function VacationsView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: VacationsBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "vacationsView");
  const [state, setState] = useState<VacationsScreenState>(() => {
    if (initialBootstrap) {
      return { status: "success", data: initialBootstrap };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VacationEmployeeFilter>("all");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(null);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [balanceValues, setBalanceValues] = useState<VacationBalanceFormValues>(() =>
    buildVacationBalanceFormValues()
  );
  const [requestValues, setRequestValues] = useState<VacationRequestFormValues>(() =>
    buildVacationRequestFormValues({ employees: [] })
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  const approvalMode =
    state.status === "success"
      ? resolveVacationApprovalMode(state.data.workflow)
      : "permission";
  const canApprove = canApproveVacationWorkflow({
    role: user?.role,
    canApproveVacations: user?.canApproveVacations,
    approvalMode,
  });
  const approvalMessage = buildVacationApprovalMessage({
    canApprove,
    approvalMode,
  });

  async function reloadVacations(options?: { preserveState?: boolean }) {
    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const bootstrap = await fetchVacationsModuleData();
      setState({ status: "success", data: bootstrap });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać modułu urlopów i nieobecności.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialBootstrap || initialError) {
      return;
    }

    void reloadVacations();
  }, [initialBootstrap, initialError]);

  const vacationStore = useMemo(
    () => (state.status === "success" ? normalizeVacationStore(state.data.vacationStore) : null),
    [state]
  );

  const employeeDirectory = useMemo(() => {
    if (state.status !== "success") return [];
    return buildVacationDirectory(state.data);
  }, [state]);

  const activeEmployees = useMemo(
    () => employeeDirectory.filter((employee) => employee.status !== "inactive"),
    [employeeDirectory]
  );

  const summaryCards = useMemo(() => {
    if (!vacationStore) return [];
    return buildVacationSummaryCards({
      employees: employeeDirectory,
      store: vacationStore,
    });
  }, [employeeDirectory, vacationStore]);

  const employeeRows = useMemo(() => {
    if (!vacationStore) return [];
    return buildVacationEmployeeRows({
      employees: employeeDirectory,
      store: vacationStore,
      search,
      filter,
    });
  }, [employeeDirectory, filter, search, vacationStore]);

  const selectedEmployee = useMemo(() => {
    const byKey = findVacationEmployeeByKey(employeeDirectory, selectedEmployeeKey);
    if (byKey) return byKey;
    return employeeRows[0]?.employee ?? activeEmployees[0] ?? employeeDirectory[0] ?? null;
  }, [activeEmployees, employeeDirectory, employeeRows, selectedEmployeeKey]);

  const selectedStats = useMemo(() => {
    if (!vacationStore || !selectedEmployee) return null;
    return buildVacationStatsForEmployee({
      employee: selectedEmployee,
      employees: employeeDirectory,
      store: vacationStore,
    });
  }, [employeeDirectory, selectedEmployee, vacationStore]);

  const selectedBalanceLookup = useMemo(() => {
    if (!vacationStore || !selectedEmployee) return null;
    return getVacationBalanceForEmployee(vacationStore, selectedEmployee, employeeDirectory);
  }, [employeeDirectory, selectedEmployee, vacationStore]);

  const editingRequest = useMemo(
    () => (vacationStore ? findVacationRequestById(vacationStore, editingRequestId) : null),
    [editingRequestId, vacationStore]
  );

  const editingEmployee = useMemo(() => {
    if (!editingRequest) {
      return {
        employee: null,
        status: "resolved" as const,
        message: null,
      };
    }

    return resolveVacationEditingEmployee({
      employees: employeeDirectory,
      employee_id: editingRequest.employee_id,
      employee_key: editingRequest.employee_key,
      employee_name: editingRequest.employee_name,
    });
  }, [editingRequest, employeeDirectory]);

  const editingEmployeeRecord = editingEmployee.employee;

  const selectableEmployeeOptions = useMemo(() => {
    const options = buildVacationEmployeeOptions(activeEmployees);

    if (
      editingEmployeeRecord &&
      !options.some((option) => option.key === editingEmployeeRecord.key)
    ) {
      options.push({
        key: editingEmployeeRecord.key,
        label: editingEmployeeRecord.name,
        description: "Historyczny wpis pracownika nieaktywnego",
        employee: editingEmployeeRecord,
        status: "inactive",
      });
    }

    return options.sort((left, right) =>
      `${left.label} ${left.employee.id || ""}`.localeCompare(
        `${right.label} ${right.employee.id || ""}`,
        "pl",
        { sensitivity: "base", numeric: true }
      )
    );
  }, [activeEmployees, editingEmployeeRecord]);

  const historyRows = useMemo(() => {
    if (!vacationStore) return [];
    return buildVacationHistoryRows({
      employee: selectedEmployee,
      employees: employeeDirectory,
      store: vacationStore,
    });
  }, [employeeDirectory, selectedEmployee, vacationStore]);

  const approvalRows = useMemo(() => {
    if (!vacationStore) return [];
    return buildVacationApprovalRows({
      employees: employeeDirectory,
      store: vacationStore,
    });
  }, [employeeDirectory, vacationStore]);

  useEffect(() => {
    if (selectedEmployee && !selectedEmployeeKey) {
      setSelectedEmployeeKey(selectedEmployee.key);
    }
  }, [selectedEmployee, selectedEmployeeKey]);

  useEffect(() => {
    setBalanceValues(buildVacationBalanceFormValues(selectedStats));
  }, [selectedEmployee?.key, selectedStats]);

  useEffect(() => {
    if (editingRequest) {
      setRequestValues(
        buildVacationRequestFormValues({
          request: editingRequest,
          employees: selectableEmployeeOptions.map((option) => option.employee),
          currentUserDisplayName: user?.displayName,
          resolvedRequestEmployee: editingEmployeeRecord,
        })
      );
      return;
    }

    const fallbackEmployeeKey =
      selectedEmployee && selectedEmployee.status !== "inactive"
        ? selectedEmployee.key
        : activeEmployees[0]?.key || "";

    setRequestValues(
      buildVacationRequestFormValues({
        employees: selectableEmployeeOptions.map((option) => option.employee),
        selectedEmployeeKey: fallbackEmployeeKey,
        currentUserDisplayName: user?.displayName,
      })
    );
  }, [
    activeEmployees,
    editingRequest,
    editingEmployeeRecord,
    selectableEmployeeOptions,
    selectedEmployee,
    selectedEmployee?.key,
    selectedEmployee?.status,
    user?.displayName,
  ]);

  function handleSelectEmployee(employeeKey: string) {
    setSelectedEmployeeKey(employeeKey);
    setFormError(null);
    setFormStatus(null);
  }

  function handleCreateNewRequest() {
    if (!canWrite) {
      return;
    }

    setEditingRequestId(null);
    setFormError(null);
    setFormStatus(null);
  }

  function handleBalanceFieldChange(
    field: keyof VacationBalanceFormValues,
    value: string
  ) {
    setBalanceValues((current) => ({ ...current, [field]: value }));
  }

  function handleRequestFieldChange(
    field: keyof VacationRequestFormValues,
    value: string
  ) {
    setRequestValues((current) => ({ ...current, [field]: value }));
  }

  function handleEditRequest(requestId: string) {
    if (!vacationStore) return;
    const request = findVacationRequestById(vacationStore, requestId);
    if (request) {
      const editingEmployeeState = resolveVacationEditingEmployee({
        employees: employeeDirectory,
        employee_id: request.employee_id,
        employee_key: request.employee_key,
        employee_name: request.employee_name,
      });
      if (editingEmployeeState.employee) {
        setSelectedEmployeeKey(editingEmployeeState.employee.key);
      }
    }
    setEditingRequestId(requestId);
    setFormError(null);
    setFormStatus(null);
  }

  async function handleSaveBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success" || !selectedEmployee) return;
    if (!canWrite) {
      setFormError("Masz dostep tylko do podgladu urlopow i nieobecnosci.");
      return;
    }

    setIsSavingBalance(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const bootstrap = await saveVacationBalanceRecord({
        employee: selectedEmployee,
        values: balanceValues,
        bootstrap: state.data,
      });
      setState({ status: "success", data: bootstrap });
      setFormStatus("Pula urlopowa została zaktualizowana.");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zapisać puli urlopowej."
      );
    } finally {
      setIsSavingBalance(false);
    }
  }

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success") return;
    if (!canWrite) {
      setFormError("Masz dostep tylko do podgladu urlopow i nieobecnosci.");
      return;
    }

    setIsSubmittingRequest(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const nextEmployeeKey = requestValues.employee_key;
      const bootstrap = await saveVacationRequestRecord({
        requestId: editingRequestId,
        values: requestValues,
        bootstrap: state.data,
        currentUserDisplayName: user?.displayName,
        currentUserRole: user?.role,
        currentUserCanApproveVacations: user?.canApproveVacations,
      });
      setState({ status: "success", data: bootstrap });
      setSelectedEmployeeKey(nextEmployeeKey || null);
      setEditingRequestId(null);
      setFormStatus(
        editingRequest ? "Wpis nieobecności został zaktualizowany." : "Dodano nową nieobecność."
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się zapisać wniosku.");
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleDeleteRequest(requestId: string) {
    if (state.status !== "success" || !canWrite) return;

    const confirmed = window.confirm("Czy na pewno chcesz usunąć wskazany wpis?");
    if (!confirmed) return;

    setIsSubmittingRequest(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const bootstrap = await deleteVacationRequestRecord({
        requestId,
        bootstrap: state.data,
      });
      setState({ status: "success", data: bootstrap });
      if (editingRequestId === requestId) {
        setEditingRequestId(null);
      }
      setFormStatus("Wpis nieobecności został usunięty.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się usunąć wpisu.");
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  async function handleChangeRequestStatus(requestId: string, status: "approved" | "rejected") {
    if (state.status !== "success") return;

    setIsSubmittingRequest(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const bootstrap = await updateVacationRequestStatus({
        requestId,
        status,
        bootstrap: state.data,
        currentUserDisplayName: user?.displayName,
        currentUserRole: user?.role,
        currentUserCanApproveVacations: user?.canApproveVacations,
      });
      setState({ status: "success", data: bootstrap });
      setFormStatus(
        status === "approved"
          ? "Wniosek został zatwierdzony."
          : "Wniosek został odrzucony."
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zmienić statusu wniosku."
      );
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Kadry" title="Urlopy i nieobecności" />
        <Panel>
          <div className="status-stack">
            <p className="status-message">Ładowanie modułu urlopów i nieobecności...</p>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Kadry" title="Urlopy i nieobecności" />
        <Panel>
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <ActionButton type="button" onClick={() => void reloadVacations()}>
              Spróbuj ponownie
            </ActionButton>
          </div>
        </Panel>
      </div>
    );
  }

  const selectedEmployeeInactive = selectedEmployee?.status === "inactive";
  const editingInactiveRequest = editingEmployeeRecord?.status === "inactive";
  const editingEmployeeNeedsManualResolution =
    Boolean(editingRequest) &&
    editingEmployee.status !== "resolved" &&
    !requestValues.employee_key;

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kadry"
        title="Urlopy i nieobecności"
        actions={
          <div className="module-actions">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void reloadVacations({ preserveState: true })}
              disabled={isRefreshing}
            >
              {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
            </ActionButton>
            {canWrite ? (
              <ActionButton type="button" onClick={handleCreateNewRequest}>
                Dodaj nieobecnosc
              </ActionButton>
            ) : null}
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard
            key={card.id}
            label={card.label}
            value={card.value}
            accent={card.accent}
          />
        ))}
      </div>

      <VacationsToolbar
        filter={filter}
        search={search}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
      />

      <div className="vacations-layout">
        <div className="vacations-main-stack">
          <Panel title="Lista pracowników">
            <DataTable
              columns={employeeTableColumns()}
              rows={employeeRows}
              emptyMessage="Brak pracowników dla bieżących filtrów."
              rowKey={(row) => row.employee.key}
              onRowClick={(row) => handleSelectEmployee(row.employee.key)}
              getRowClassName={(row) =>
                row.employee.key === selectedEmployee?.key ? "data-table__row--active" : undefined
              }
              tableClassName="vacations-table vacations-table--employees"
            />
          </Panel>

          <Panel title={selectedEmployee ? `Historia: ${selectedEmployee.name}` : "Historia pracownika"}>
            <DataTable
              columns={historyTableColumns({
                canWrite,
                onEdit: handleEditRequest,
                onDelete: handleDeleteRequest,
              })}
              rows={historyRows}
              emptyMessage="Wybrany pracownik nie ma jeszcze wpisów nieobecności."
              rowKey={(row) => row.request.id}
              tableClassName="vacations-table vacations-table--history"
            />
          </Panel>

          <Panel title="Wnioski i akceptacja">
            <DataTable
              columns={approvalsTableColumns({
                canWrite,
                canApprove,
                onEdit: handleEditRequest,
                onDelete: handleDeleteRequest,
                onApprove: (requestId) => void handleChangeRequestStatus(requestId, "approved"),
                onReject: (requestId) => void handleChangeRequestStatus(requestId, "rejected"),
              })}
              rows={approvalRows}
              emptyMessage="Brak wniosków urlopowych i nieobecności."
              rowKey={(row) => row.request.id}
              tableClassName="vacations-table vacations-table--approvals"
            />
          </Panel>
        </div>

        <div className="vacations-side-stack">
          <VacationsEmployeePanel
            canWrite={canWrite}
            selectedEmployee={selectedEmployee}
            selectedStats={selectedStats}
            selectedEmployeeInactive={selectedEmployeeInactive}
            selectedBalanceLookup={selectedBalanceLookup}
            balanceValues={balanceValues}
            isSavingBalance={isSavingBalance}
            onBalanceFieldChange={handleBalanceFieldChange}
            onSubmitBalance={handleSaveBalance}
          />

          <VacationsRequestPanel
            canWrite={canWrite}
            editingRequest={editingRequest}
            editingEmployeeStatus={editingEmployee.status}
            editingEmployeeMessage={editingEmployee.message}
            editingInactiveRequest={editingInactiveRequest}
            selectableEmployeeOptions={selectableEmployeeOptions}
            requestValues={requestValues}
            canApprove={canApprove}
            approvalMessage={approvalMessage}
            formError={formError}
            formStatus={formStatus}
            isSubmittingRequest={isSubmittingRequest}
            editingEmployeeNeedsManualResolution={editingEmployeeNeedsManualResolution}
            onCreateNewRequest={handleCreateNewRequest}
            onSubmitRequest={handleSubmitRequest}
            onRequestFieldChange={handleRequestFieldChange}
          />
        </div>
      </div>
    </div>
  );
}
