"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { AppDrawer } from "@/components/ui/app-drawer";
import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  deleteVacationRequestRecord,
  fetchVacationsModuleData,
  saveVacationBalanceRecord,
  saveVacationRequestRecord,
  updateVacationRequestStatus,
} from "@/features/vacations/api";
import { VacationsEmployeePanel } from "@/features/vacations/components/VacationsEmployeePanel";
import { type VacationEmployeeFilter, VacationsToolbar } from "@/features/vacations/components/VacationsToolbar";
import { VacationsRequestPanel } from "@/features/vacations/components/VacationsRequestPanel";
import {
  buildVacationBalanceFormValues,
  buildVacationApprovalMessage,
  buildVacationApprovalRows,
  buildVacationDirectory,
  buildVacationHistoryRows,
  buildVacationRequestFormValues,
  buildVacationStatsForEmployee,
  buildVacationSummaryCards,
  buildSelectableVacationEmployeeOptions,
  buildVacationEmployeeRows,
  canApproveVacationWorkflow,
  findVacationEmployeeByKey,
  findVacationRequestById,
  getVacationBalanceForEmployee,
  normalizeVacationStore,
  resolveVacationApprovalMode,
  resolveVacationEditingEmployee,
} from "@/features/vacations/mappers";
import {
  buildVacationApprovalTableColumns,
  buildVacationEmployeeTableColumns,
  buildVacationHistoryTableColumns,
} from "@/features/vacations/table-columns";
import type {
  VacationBalanceFormValues,
  VacationRequestFormValues,
  VacationsBootstrapData,
} from "@/features/vacations/types";

type VacationsScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: VacationsBootstrapData };

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
  const [isRequestDrawerOpen, setIsRequestDrawerOpen] = useState(false);
  const [balanceValues, setBalanceValues] = useState<VacationBalanceFormValues>(() => buildVacationBalanceFormValues());
  const [requestValues, setRequestValues] = useState<VacationRequestFormValues>(() =>
    buildVacationRequestFormValues({ employees: [] }),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [isSavingBalance, setIsSavingBalance] = useState(false);

  const approvalMode =
    state.status === "success" ? resolveVacationApprovalMode(state.data.workflow) : "permission";
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
          error instanceof Error ? error.message : "Nie udało się pobrać modułu urlopów i nieobecności.",
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
    [state],
  );

  const employeeDirectory = useMemo(() => {
    if (state.status !== "success") return [];
    return buildVacationDirectory(state.data);
  }, [state]);

  const activeEmployees = useMemo(
    () => employeeDirectory.filter((employee) => employee.status !== "inactive"),
    [employeeDirectory],
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
    [editingRequestId, vacationStore],
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

  const selectableEmployeeOptions = useMemo(
    () =>
      buildSelectableVacationEmployeeOptions({
        activeEmployees,
        editingEmployee: editingEmployeeRecord,
      }),
    [activeEmployees, editingEmployeeRecord],
  );

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
        }),
      );
      return;
    }

    const fallbackEmployeeKey =
      selectedEmployee && selectedEmployee.status !== "inactive" ? selectedEmployee.key : activeEmployees[0]?.key || "";

    setRequestValues(
      buildVacationRequestFormValues({
        employees: selectableEmployeeOptions.map((option) => option.employee),
        selectedEmployeeKey: fallbackEmployeeKey,
        currentUserDisplayName: user?.displayName,
      }),
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
    setIsRequestDrawerOpen(true);
  }

  function handleBalanceFieldChange(field: keyof VacationBalanceFormValues, value: string) {
    setBalanceValues((current) => ({ ...current, [field]: value }));
  }

  function handleRequestFieldChange(field: keyof VacationRequestFormValues, value: string) {
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
    setIsRequestDrawerOpen(true);
  }

  async function handleSaveBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success" || !selectedEmployee) return;
    if (!canWrite) {
      setFormError("Masz dostęp tylko do podglądu urlopów i nieobecności.");
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
      setFormError(error instanceof Error ? error.message : "Nie udało się zapisać puli urlopowej.");
    } finally {
      setIsSavingBalance(false);
    }
  }

  async function handleSubmitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success") return;
    if (!canWrite) {
      setFormError("Masz dostęp tylko do podglądu urlopów i nieobecności.");
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
      setIsRequestDrawerOpen(false);
      setFormStatus(editingRequest ? "Wpis nieobecności został zaktualizowany." : "Dodano nową nieobecność.");
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
        setIsRequestDrawerOpen(false);
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
      setFormStatus(status === "approved" ? "Wniosek został zatwierdzony." : "Wniosek został odrzucony.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się zmienić statusu wniosku.");
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
    Boolean(editingRequest) && editingEmployee.status !== "resolved" && !requestValues.employee_key;

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
                Dodaj nieobecność
              </ActionButton>
            ) : null}
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <VacationsToolbar filter={filter} search={search} onFilterChange={setFilter} onSearchChange={setSearch} />

      <div className="vacations-layout">
        <div className="vacations-main-stack">
          <Panel title="Lista pracowników">
            <DataTable
              columns={buildVacationEmployeeTableColumns()}
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

          <Panel title={selectedEmployee ? `Historia: ${selectedEmployee.name}` : "Historia pracownika"}>
            <DataTable
              columns={buildVacationHistoryTableColumns({
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
              columns={buildVacationApprovalTableColumns({
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
      </div>

      {isRequestDrawerOpen ? (
        <AppDrawer
          eyebrow="Urlopy i nieobecności"
          title={editingRequest ? "Edytuj wniosek" : "Nowa nieobecność"}
          onClose={() => setIsRequestDrawerOpen(false)}
          size="wide"
        >
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
            embedded
          />
        </AppDrawer>
      ) : null}
    </div>
  );
}
