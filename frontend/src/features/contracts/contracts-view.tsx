"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { AppDrawer } from "@/components/ui/app-drawer";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { ContractCenterPanel } from "@/features/contracts/contract-center-panel";
import {
  archiveContractRecord,
  deleteContractRecord,
  fetchContractSnapshot,
  fetchContracts,
  findContractById,
  normalizeContractControlPayload,
  normalizeContractPayload,
  saveContract,
  saveContractControl,
} from "@/features/contracts/api";
import {
  formatDateTime,
  formatHealthLevel,
  formatMoney,
  formatStaleness,
  formatStatus,
} from "@/features/contracts/formatters";
import {
  copyPlanToForecastValues,
  mapContractControlSummaryItems,
  mapContractsViewModel,
  resolveNextSelectedContractId,
  toContractControlFormValues,
  toContractFormValues,
  useActualCostsAsStartingPoint,
  useContractValueAsPlannedRevenue,
} from "@/features/contracts/mappers";
import type {
  ContractControlFormValues,
  ContractFormValues,
  ContractRecord,
  ContractSnapshot,
  ContractsViewModel,
} from "@/features/contracts/types";

type ContractsFilter = "all" | "active" | "archived";

type ContractsScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractsViewModel };

type SnapshotState =
  | { status: "idle"; contractId: string | null }
  | { status: "loading"; contractId: string }
  | { status: "error"; contractId: string; message: string }
  | { status: "success"; contractId: string; data: ContractSnapshot };

type DrawerState =
  | { kind: "none" }
  | { kind: "contract"; mode: "create" | "edit" }
  | { kind: "control" };

const emptyContractFormValues = toContractFormValues();
const emptyControlFormValues = toContractControlFormValues();

export function ContractsView({
  initialContracts,
  initialSnapshot,
  initialError,
}: {
  initialContracts?: ContractRecord[] | null;
  initialSnapshot?: ContractSnapshot | null;
  initialError?: string | null;
}) {
  const initialSelectedContractId = resolveNextSelectedContractId(initialContracts ?? [], null);

  const [state, setState] = useState<ContractsScreenState>(() => {
    if (initialContracts) {
      return { status: "success", data: mapContractsViewModel(initialContracts) };
    }
    if (initialError) {
      return { status: "error", message: initialError };
    }
    return { status: "loading" };
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ContractsFilter>("all");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(initialSelectedContractId);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>(() => {
    if (initialSnapshot && initialSelectedContractId === initialSnapshot.contract.id) {
      return {
        status: "success",
        contractId: initialSnapshot.contract.id,
        data: initialSnapshot,
      };
    }
    return { status: "idle", contractId: initialSelectedContractId };
  });
  const [drawerState, setDrawerState] = useState<DrawerState>({ kind: "none" });
  const [contractFormValues, setContractFormValues] = useState<ContractFormValues>(emptyContractFormValues);
  const [controlFormValues, setControlFormValues] = useState<ContractControlFormValues>(emptyControlFormValues);
  const [feedback, setFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [drawerFeedback, setDrawerFeedback] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [isSubmittingContract, setIsSubmittingContract] = useState(false);
  const [isSubmittingControl, setIsSubmittingControl] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function loadSnapshot(contractId: string, options?: { force?: boolean }) {
    if (
      !options?.force &&
      snapshotState.status === "success" &&
      snapshotState.contractId === contractId
    ) {
      return;
    }

    setSnapshotState({ status: "loading", contractId });
    try {
      const snapshot = await fetchContractSnapshot(contractId);
      setSnapshotState({ status: "success", contractId, data: snapshot });
    } catch (error) {
      setSnapshotState({
        status: "error",
        contractId,
        message: error instanceof Error ? error.message : "Nie udało się pobrać obrazu kontraktu.",
      });
    }
  }

  async function reloadContracts(options?: { preserveState?: boolean; selectId?: string | null }) {
    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const contracts = await fetchContracts(true);
      const mapped = mapContractsViewModel(contracts);
      const nextSelectedContractId = resolveNextSelectedContractId(
        contracts,
        selectedContractId,
        options?.selectId,
      );

      setState({ status: "success", data: mapped });
      setSelectedContractId(nextSelectedContractId);

      if (nextSelectedContractId) {
        await loadSnapshot(nextSelectedContractId, { force: true });
      } else {
        setSnapshotState({ status: "idle", contractId: null });
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Nie udało się pobrać rejestru kontraktów.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialContracts || initialError) {
      return;
    }
    void reloadContracts();
  }, [initialContracts, initialError]);

  const contracts = state.status === "success" ? state.data.contracts : [];

  const filteredContracts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return contracts.filter((contract) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "archived"
            ? contract.status === "archived"
            : contract.status !== "archived";
      if (!matchesFilter) return false;
      if (!term) return true;
      return [contract.contract_number, contract.name, contract.investor, formatStatus(contract.status)]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [contracts, filter, search]);

  const selectedContract = useMemo(
    () => findContractById(contracts, selectedContractId),
    [contracts, selectedContractId],
  );

  const selectedSnapshot =
    snapshotState.status === "success" && snapshotState.contractId === selectedContractId
      ? snapshotState.data
      : null;

  const selectedSnapshotError =
    snapshotState.status === "error" && snapshotState.contractId === selectedContractId
      ? snapshotState.message
      : null;

  const isSnapshotLoading =
    snapshotState.status === "loading" && snapshotState.contractId === selectedContractId;

  const controlSummaryItems = useMemo(
    () => mapContractControlSummaryItems(selectedSnapshot),
    [selectedSnapshot],
  );

  useEffect(() => {
    if (!selectedContractId) {
      setSnapshotState({ status: "idle", contractId: null });
      return;
    }

    if (snapshotState.status === "success" && snapshotState.contractId === selectedContractId) {
      return;
    }

    void loadSnapshot(selectedContractId);
  }, [selectedContractId, snapshotState.contractId, snapshotState.status]);

  useEffect(() => {
    if (drawerState.kind !== "contract") {
      return;
    }
    if (drawerState.mode === "edit" && selectedContract) {
      setContractFormValues(toContractFormValues(selectedContract));
    }
    if (drawerState.mode === "create") {
      setContractFormValues(emptyContractFormValues);
    }
    setDrawerFeedback(null);
  }, [drawerState, selectedContract]);

  useEffect(() => {
    if (drawerState.kind !== "control") {
      return;
    }
    setControlFormValues(toContractControlFormValues(selectedSnapshot));
    setDrawerFeedback(null);
  }, [drawerState, selectedSnapshot]);

  function openCreateDrawer() {
    setDrawerState({ kind: "contract", mode: "create" });
  }

  function openEditDrawer() {
    if (!selectedContract) return;
    setDrawerState({ kind: "contract", mode: "edit" });
  }

  function openControlDrawer() {
    if (!selectedContract) return;
    setDrawerState({ kind: "control" });
  }

  function closeDrawer() {
    setDrawerState({ kind: "none" });
    setDrawerFeedback(null);
  }

  async function handleContractAction(contract: ContractRecord) {
    setFeedback(null);

    if (contract.status === "archived") {
      if (selectedSnapshot?.activity.has_data) {
        window.alert(
          "Nie można trwale usunąć zarchiwizowanego kontraktu z danymi historycznymi. Pozostaw go jako zarchiwizowany albo usuń najpierw powiązane dane.",
        );
        return;
      }

      if (!window.confirm(`Czy na pewno chcesz trwale usunąć kontrakt "${contract.name}"?`)) {
        return;
      }

      try {
        await deleteContractRecord(contract.id);
        await reloadContracts({ preserveState: true });
        setFeedback({
          tone: "success",
          text: `Kontrakt "${contract.name}" został usunięty.`,
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          text: error instanceof Error ? error.message : "Nie udało się usunąć kontraktu.",
        });
      }
      return;
    }

    if (!window.confirm(`Czy na pewno chcesz zarchiwizować kontrakt "${contract.name}"?`)) {
      return;
    }

    try {
      await archiveContractRecord(contract.id);
      await reloadContracts({ preserveState: true, selectId: contract.id });
      setFeedback({
        tone: "success",
        text: `Kontrakt "${contract.name}" został zarchiwizowany.`,
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się zarchiwizować kontraktu.",
      });
    }
  }

  async function handleContractSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDrawerFeedback(null);

    if (!contractFormValues.name.trim()) {
      setDrawerFeedback({ tone: "error", text: "Podaj nazwę kontraktu." });
      return;
    }

    const contractValue = Number(contractFormValues.contract_value || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      setDrawerFeedback({ tone: "error", text: "Wartość kontraktu nie może być ujemna." });
      return;
    }

    if (
      contractFormValues.signed_date &&
      contractFormValues.end_date &&
      new Date(contractFormValues.end_date).getTime() <
        new Date(contractFormValues.signed_date).getTime()
    ) {
      setDrawerFeedback({
        tone: "error",
        text: "Termin zakończenia nie może być wcześniejszy niż data podpisania.",
      });
      return;
    }

    setIsSubmittingContract(true);
    try {
      const saved = await saveContract(
        drawerState.kind === "contract" && drawerState.mode === "edit" && selectedContract
          ? selectedContract.id
          : null,
        normalizeContractPayload(contractFormValues),
      );
      await reloadContracts({ preserveState: true, selectId: saved.id });
      closeDrawer();
      setFeedback({
        tone: "success",
        text:
          drawerState.kind === "contract" && drawerState.mode === "edit"
            ? `Dane kontraktu "${saved.name}" zostały zaktualizowane.`
            : `Kontrakt "${saved.name}" został dodany.`,
      });
    } catch (error) {
      setDrawerFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się zapisać kontraktu.",
      });
    } finally {
      setIsSubmittingContract(false);
    }
  }

  async function handleControlSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedContract) return;
    setDrawerFeedback(null);
    setIsSubmittingControl(true);

    try {
      const snapshot = await saveContractControl(
        selectedContract.id,
        normalizeContractControlPayload(controlFormValues),
      );
      setSnapshotState({
        status: "success",
        contractId: selectedContract.id,
        data: snapshot,
      });
      closeDrawer();
      setFeedback({
        tone: "success",
        text: `Plan i prognoza kontraktu "${selectedContract.name}" zostały zapisane.`,
      });
    } catch (error) {
      setDrawerFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się zapisać planu i prognozy.",
      });
    } finally {
      setIsSubmittingControl(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Kontrakty" title="Centrum kontraktów" />
        <div className="module-page__stats">
          {Array.from({ length: 3 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Ładowanie kontraktów">
          <p className="status-message">Trwa odczyt listy kontraktów i obrazu kontraktów.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Kontrakty"
          title="Centrum kontraktów"
          actions={
            <ActionButton type="button" onClick={() => void reloadContracts()}>
              Spróbuj ponownie
            </ActionButton>
          }
        />
        <Panel title="Błąd odczytu" description={state.message}>
          <p className="panel__description">
            Sprawdź dostępność backendu lub sesję użytkownika, a potem odśwież ekran.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kontrakty"
        title="Centrum kontraktów"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              <ActionButton type="button" onClick={openCreateDrawer}>
                Dodaj kontrakt
              </ActionButton>
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void reloadContracts({ preserveState: true, selectId: selectedContractId })}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {state.data.summary.map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={Boolean(card.accent)} />
        ))}
      </div>

      <FormFeedback items={[feedback ? { tone: feedback.tone, text: feedback.text } : null]} />

      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="contracts-toolbar">
          <div className="toolbar-tabs">
            <ActionButton type="button" variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>
              Wszystkie
            </ActionButton>
            <ActionButton type="button" variant={filter === "active" ? "primary" : "secondary"} onClick={() => setFilter("active")}>
              Aktywne
            </ActionButton>
            <ActionButton type="button" variant={filter === "archived" ? "primary" : "secondary"} onClick={() => setFilter("archived")}>
              Zarchiwizowane
            </ActionButton>
          </div>
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po numerze, nazwie lub inwestorze"
          />
        </div>
      </Panel>

      <div className="contracts-workspace">
        <aside className="contracts-picker" data-testid="contracts-picker">
          <Panel title="Wybierz kontrakt">
            <div className="contracts-picker__list">
              {filteredContracts.length ? (
                filteredContracts.map((contract) => {
                  const isActive = contract.id === selectedContractId;
                  return (
                    <button
                      key={contract.id}
                      type="button"
                      className={
                        isActive
                          ? "contracts-picker__item contracts-picker__item--active"
                          : "contracts-picker__item"
                      }
                      onClick={() => {
                        setSelectedContractId(contract.id);
                        setFeedback(null);
                      }}
                    >
                      <div className="contracts-picker__item-top">
                        <span className="contracts-picker__number">
                          {contract.contract_number || "Bez numeru"}
                        </span>
                        <span className={`contracts-chip contracts-chip--status-${contract.status}`}>
                          {formatStatus(contract.status)}
                        </span>
                      </div>
                      <strong className="contracts-picker__name">{contract.name}</strong>
                      <span className="contracts-picker__meta">
                        {contract.investor || "Bez inwestora"}
                      </span>
                      <span className="contracts-picker__meta contracts-picker__meta--value">
                        {formatMoney(contract.contract_value)}
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="status-message">
                  {contracts.length
                    ? "Brak kontraktów dla wybranego filtra."
                    : "Brak kontraktów w rejestrze. Dodaj pierwszy kontrakt."}
                </p>
              )}
            </div>
          </Panel>
        </aside>

        <div className="contracts-main-panel">
          <Panel>
            {selectedContract ? (
              <div className="contracts-overview-header">
                <div className="contracts-overview-header__primary">
                  <span className="contracts-picker__number">
                    {selectedContract.contract_number || "Bez numeru"}
                  </span>
                  <h2 className="contracts-overview-header__title">{selectedContract.name}</h2>
                  <p className="contracts-overview-header__subtitle">
                    {selectedContract.investor || "Bez inwestora"} • {formatStatus(selectedContract.status)}
                  </p>
                </div>

                <div className="contracts-overview-header__side">
                  <div className="contracts-overview-health">
                    <strong>
                      {selectedSnapshot ? formatHealthLevel(selectedSnapshot.health.level) : "Ładowanie"}
                    </strong>
                    <p className="contracts-overview-health__summary">
                      {selectedSnapshot
                        ? selectedSnapshot.health.summary
                        : isSnapshotLoading
                          ? "Trwa odczyt sytuacji kontraktu."
                          : "Oczekiwanie na dane."}
                    </p>
                    <span className="contracts-overview-health__meta">
                      {selectedSnapshot
                        ? `Aktualność danych: ${formatStaleness(selectedSnapshot.freshness.days_since_operational_activity)}`
                        : "Aktualność danych: ładowanie"}
                    </span>
                    <span className="contracts-overview-health__meta">
                      {selectedSnapshot
                        ? `Snapshot: ${formatDateTime(selectedSnapshot.snapshot_generated_at)}`
                        : "Snapshot: ładowanie"}
                    </span>
                  </div>

                  <div className="module-actions__secondary">
                    <ActionButton type="button" variant="secondary" onClick={openEditDrawer}>
                      Edytuj dane kontraktu
                    </ActionButton>
                    <ActionButton type="button" variant="secondary" onClick={openControlDrawer}>
                      Plan i prognoza
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant={selectedContract.status === "archived" ? "ghost" : "secondary"}
                      onClick={() => void handleContractAction(selectedContract)}
                    >
                      {selectedContract.status === "archived" ? "Usuń" : "Archiwizuj"}
                    </ActionButton>
                  </div>
                </div>
              </div>
            ) : null}

            <ContractCenterPanel
              contract={selectedContract}
              snapshot={selectedSnapshot}
              isLoading={isSnapshotLoading}
              errorMessage={selectedSnapshotError}
            />
          </Panel>
        </div>
      </div>

      {drawerState.kind === "contract" ? (
        <AppDrawer
          eyebrow="Kontrakty"
          title={drawerState.mode === "edit" ? "Edytuj dane kontraktu" : "Dodaj kontrakt"}
          onClose={closeDrawer}
          size="wide"
        >
          <div className="contracts-drawer__intro">
            <h2 className="contracts-drawer__intro-title">
              {drawerState.mode === "edit" ? "Dane podstawowe kontraktu" : "Nowy kontrakt"}
            </h2>
            <p className="contracts-drawer__intro-copy">
              Ten formularz służy wyłącznie do danych rejestrowych kontraktu. Plan i prognoza mają
              osobny, świadomy panel.
            </p>
          </div>

          <FormFeedback items={[drawerFeedback ? { tone: drawerFeedback.tone, text: drawerFeedback.text } : null]} />

          <form className="contracts-drawer__form" onSubmit={handleContractSubmit}>
            <FormGrid columns={2}>
              <label className="form-field">
                <span>Numer kontraktu</span>
                <input
                  value={contractFormValues.contract_number}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      contract_number: event.target.value,
                    }))
                  }
                  placeholder="K/2026/001"
                />
              </label>
              <label className="form-field">
                <span>Status</span>
                <select
                  value={contractFormValues.status}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      status: event.target.value === "archived" ? "archived" : "active",
                    }))
                  }
                >
                  <option value="active">W realizacji</option>
                  <option value="archived">Zarchiwizowany</option>
                </select>
              </label>
              <label className="form-field contracts-drawer__full">
                <span>Nazwa kontraktu</span>
                <input
                  value={contractFormValues.name}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Budowa hali magazynowej"
                />
              </label>
              <label className="form-field contracts-drawer__full">
                <span>Inwestor</span>
                <input
                  value={contractFormValues.investor}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      investor: event.target.value,
                    }))
                  }
                  placeholder="Inwestor"
                />
              </label>
              <label className="form-field">
                <span>Data podpisania</span>
                <input
                  type="date"
                  value={contractFormValues.signed_date}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      signed_date: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Termin zakończenia</span>
                <input
                  type="date"
                  value={contractFormValues.end_date}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      end_date: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="form-field">
                <span>Wartość kontraktu</span>
                <input
                  inputMode="decimal"
                  value={contractFormValues.contract_value}
                  onChange={(event) =>
                    setContractFormValues((current) => ({
                      ...current,
                      contract_value: event.target.value,
                    }))
                  }
                  placeholder="0"
                />
              </label>
            </FormGrid>

            <FormActions
              leading={
                <ActionButton type="button" variant="ghost" onClick={closeDrawer}>
                  Zamknij
                </ActionButton>
              }
              trailing={
                <ActionButton type="submit" disabled={isSubmittingContract}>
                  {isSubmittingContract ? "Zapisywanie..." : drawerState.mode === "edit" ? "Zapisz zmiany" : "Dodaj kontrakt"}
                </ActionButton>
              }
            />
          </form>
        </AppDrawer>
      ) : null}

      {drawerState.kind === "control" && selectedContract ? (
        <AppDrawer
          eyebrow="Kontrakty"
          title="Plan i prognoza"
          onClose={closeDrawer}
          size="wide"
        >
          <div className="contracts-drawer__intro">
            <h2 className="contracts-drawer__intro-title">Plan i prognoza kontraktu</h2>
            <p className="contracts-drawer__intro-copy">
              System sam liczy wykonanie z faktur, czasu pracy i planowania. W polach poniżej
              utrzymujesz wyłącznie świadomie zapisany plan oraz prognozę końcową.
            </p>
            <p className="contracts-drawer__intro-meta">
              Jeśli kontrakt nie ma jeszcze pełnych danych kontrolnych, użyj akcji startowych
              poniżej. To są propozycje do świadomego zapisu, a nie automatycznie zaakceptowany
              plan.
            </p>
            {selectedSnapshot?.control.updated_by ? (
              <p className="contracts-drawer__intro-meta">
                Aktualizował: {selectedSnapshot.control.updated_by}
              </p>
            ) : null}
          </div>

          {controlSummaryItems.length ? (
            <div className="contracts-control-summary-grid">
              {controlSummaryItems.map((item) => (
                <StatCard key={item.id} label={item.label} value={item.value} />
              ))}
            </div>
          ) : null}

          <div className="contracts-form__actions">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() =>
                setControlFormValues((current) =>
                  useContractValueAsPlannedRevenue(current, selectedSnapshot),
                )
              }
            >
              Użyj wartości kontraktu jako planu przychodu
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() =>
                setControlFormValues((current) => copyPlanToForecastValues(current))
              }
            >
              Skopiuj plan do prognozy
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() =>
                setControlFormValues((current) =>
                  useActualCostsAsStartingPoint(current, selectedSnapshot),
                )
              }
            >
              Użyj bieżących kosztów jako punktu startowego
            </ActionButton>
          </div>

          <FormFeedback items={[drawerFeedback ? { tone: drawerFeedback.tone, text: drawerFeedback.text } : null]} />

          <form className="contracts-drawer__form" onSubmit={handleControlSubmit}>
            <FormGrid columns={2}>
              <div className="summary-strip contracts-drawer__full">
                <div className="summary-strip__primary">
                  <h3 className="contracts-detail__subsection-title">Plan</h3>
                  <p className="contracts-drawer__intro-copy">Założony punkt odniesienia dla kontraktu.</p>
                </div>
              </div>

              <label className="form-field">
                <span>Planowany przychód</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.planned_revenue_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      planned_revenue_total: event.target.value,
                    }))
                  }
                  placeholder="Wartość kontraktu lub własny plan"
                />
              </label>
              <label className="form-field">
                <span>Planowany koszt fakturowy</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.planned_invoice_cost_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      planned_invoice_cost_total: event.target.value,
                    }))
                  }
                  placeholder="Uzupełnij planowany koszt fakturowy"
                />
              </label>
              <label className="form-field">
                <span>Planowany koszt pracy</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.planned_labor_cost_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      planned_labor_cost_total: event.target.value,
                    }))
                  }
                  placeholder="Uzupełnij planowany koszt pracy"
                />
              </label>

              <div className="summary-strip contracts-drawer__full">
                <div className="summary-strip__primary">
                  <h3 className="contracts-detail__subsection-title">Prognoza końcowa</h3>
                  <p className="contracts-drawer__intro-copy">Przewidywany wynik kontraktu na dziś.</p>
                </div>
              </div>

              <label className="form-field">
                <span>Prognozowany przychód</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.forecast_revenue_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      forecast_revenue_total: event.target.value,
                    }))
                  }
                  placeholder="Plan przychodu lub własna prognoza"
                />
              </label>
              <label className="form-field">
                <span>Prognozowany koszt fakturowy</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.forecast_invoice_cost_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      forecast_invoice_cost_total: event.target.value,
                    }))
                  }
                  placeholder="Uzupełnij prognozowany koszt fakturowy"
                />
              </label>
              <label className="form-field">
                <span>Prognozowany koszt pracy</span>
                <input
                  inputMode="decimal"
                  value={controlFormValues.forecast_labor_cost_total}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      forecast_labor_cost_total: event.target.value,
                    }))
                  }
                  placeholder="Uzupełnij prognozowany koszt pracy"
                />
              </label>
              <label className="form-field contracts-drawer__full">
                <span>Notatka kontrolna</span>
                <textarea
                  value={controlFormValues.note}
                  onChange={(event) =>
                    setControlFormValues((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Opcjonalna notatka kontrolna"
                />
              </label>
            </FormGrid>

            <FormActions
              leading={
                <ActionButton type="button" variant="ghost" onClick={closeDrawer}>
                  Zamknij
                </ActionButton>
              }
              trailing={
                <ActionButton type="submit" disabled={isSubmittingControl}>
                  {isSubmittingControl ? "Zapisywanie..." : "Zapisz plan i prognozę"}
                </ActionButton>
              }
            />
          </form>
        </AppDrawer>
      ) : null}
    </div>
  );
}
