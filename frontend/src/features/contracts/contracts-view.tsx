"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
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
  saveContractControl
} from "@/features/contracts/api";
import {
  formatDateTime,
  formatHealthLevel,
  formatMoney,
  formatStaleness,
  formatStatus
} from "@/features/contracts/formatters";
import {
  mapContractsViewModel,
  resolveNextSelectedContractId,
  toContractControlFormValues,
  toContractFormValues
} from "@/features/contracts/mappers";
import type {
  ContractControlFormValues,
  ContractFormValues,
  ContractRecord,
  ContractSnapshot,
  ContractsViewModel
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
  initialError
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
        data: initialSnapshot
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
        message:
          error instanceof Error
            ? error.message
            : "Nie udaÅ‚o siÄ™ pobraÄ‡ obrazu kontrolnego kontraktu."
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
        options?.selectId
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
        message:
          error instanceof Error
            ? error.message
            : "Nie udaÅ‚o siÄ™ pobraÄ‡ rejestru kontraktÃ³w."
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
      return [
        contract.contract_number,
        contract.name,
        contract.investor,
        formatStatus(contract.status)
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [contracts, filter, search]);

  const selectedContract = useMemo(
    () => findContractById(contracts, selectedContractId),
    [contracts, selectedContractId]
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

  useEffect(() => {
    if (!selectedContractId) {
      setSnapshotState({ status: "idle", contractId: null });
      return;
    }

    if (snapshotState.status === "success" && snapshotState.contractId === selectedContractId) {
      return;
    }

    void loadSnapshot(selectedContractId);
  }, [selectedContractId]);

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
          "Nie moÅ¼na trwale usunÄ…Ä‡ zarchiwizowanego kontraktu z danymi historycznymi. Pozostaw go jako zarchiwizowany albo usuÅ„ najpierw powiÄ…zane dane."
        );
        return;
      }

      if (!window.confirm(`Czy na pewno chcesz trwale usunÄ…Ä‡ kontrakt "${contract.name}"?`)) {
        return;
      }

      try {
        await deleteContractRecord(contract.id);
        await reloadContracts({ preserveState: true });
        setFeedback({
          tone: "success",
          text: `Kontrakt "${contract.name}" zostaÅ‚ usuniÄ™ty.`
        });
      } catch (error) {
        setFeedback({
          tone: "error",
          text:
            error instanceof Error
              ? error.message
              : "Nie udaÅ‚o siÄ™ usunÄ…Ä‡ kontraktu."
        });
      }
      return;
    }

    if (!window.confirm(`Czy na pewno chcesz zarchiwizowaÄ‡ kontrakt "${contract.name}"?`)) {
      return;
    }

    try {
      await archiveContractRecord(contract.id);
      await reloadContracts({ preserveState: true, selectId: contract.id });
      setFeedback({
        tone: "success",
        text: `Kontrakt "${contract.name}" zostaÅ‚ zarchiwizowany.`
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udaÅ‚o siÄ™ zarchiwizowaÄ‡ kontraktu."
      });
    }
  }

  async function handleContractSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDrawerFeedback(null);

    if (!contractFormValues.name.trim()) {
      setDrawerFeedback({ tone: "error", text: "Podaj nazwÄ™ kontraktu." });
      return;
    }

    const contractValue = Number(contractFormValues.contract_value || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      setDrawerFeedback({ tone: "error", text: "WartoÅ›Ä‡ kontraktu nie moÅ¼e byÄ‡ ujemna." });
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
        text: "Termin zakoÅ„czenia nie moÅ¼e byÄ‡ wczeÅ›niejszy niÅ¼ data podpisania."
      });
      return;
    }

    setIsSubmittingContract(true);
    try {
      const saved = await saveContract(
        drawerState.kind === "contract" && drawerState.mode === "edit" && selectedContract
          ? selectedContract.id
          : null,
        normalizeContractPayload(contractFormValues)
      );
      await reloadContracts({ preserveState: true, selectId: saved.id });
      closeDrawer();
      setFeedback({
        tone: "success",
        text:
          drawerState.kind === "contract" && drawerState.mode === "edit"
            ? `Dane kontraktu "${saved.name}" zostaÅ‚y zaktualizowane.`
            : `Kontrakt "${saved.name}" zostaÅ‚ dodany.`
      });
    } catch (error) {
      setDrawerFeedback({
        tone: "error",
        text:
          error instanceof Error ? error.message : "Nie udaÅ‚o siÄ™ zapisaÄ‡ kontraktu."
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
        normalizeContractControlPayload(controlFormValues)
      );
      setSnapshotState({
        status: "success",
        contractId: selectedContract.id,
        data: snapshot
      });
      closeDrawer();
      setFeedback({
        tone: "success",
        text: `Plan i forecast kontraktu "${selectedContract.name}" zostaÅ‚y zapisane.`
      });
    } catch (error) {
      setDrawerFeedback({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Nie udaÅ‚o siÄ™ zapisaÄ‡ planu i forecastu."
      });
    } finally {
      setIsSubmittingControl(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Kontrakty" title="Centrum kontraktÃ³w" />
        <div className="module-page__stats">
          {Array.from({ length: 3 }).map((_, index) => (
            <StatCard key={index} label="Åadowanie" value="..." />
          ))}
        </div>
        <Panel title="Åadowanie kontraktÃ³w">
          <p className="status-message">Trwa odczyt listy kontraktÃ³w i widoku zarzÄ…dczego.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Kontrakty"
          title="Centrum kontraktÃ³w"
          actions={
            <ActionButton type="button" onClick={() => void reloadContracts()}>
              SprÃ³buj ponownie
            </ActionButton>
          }
        />
        <Panel title="BÅ‚Ä…d odczytu" description={state.message}>
          <p className="panel__description">
            SprawdÅº dostÄ™pnoÅ›Ä‡ backendu lub sesjÄ™ uÅ¼ytkownika, a potem odÅ›wieÅ¼ ekran.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="module-page contracts-control-page">
      <SectionHeader
        eyebrow="Kontrakty"
        title="Centrum kontraktÃ³w"
        description="Widok zarzÄ…dczy kontraktu: wynik, plan, forecast i ryzyka w jednym miejscu."
        actions={
          <div className="module-actions">
            <ActionButton type="button" onClick={openCreateDrawer}>
              Dodaj kontrakt
            </ActionButton>
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void reloadContracts({ preserveState: true, selectId: selectedContractId })}
              disabled={isRefreshing}
            >
              {isRefreshing ? "OdÅ›wieÅ¼anie..." : "OdÅ›wieÅ¼ dane"}
            </ActionButton>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {state.data.summary.map((item) => (
          <StatCard key={item.id} label={item.label} value={item.value} accent={item.accent} />
        ))}
      </div>

      <FormFeedback items={[feedback]} />

      <div className="contracts-workspace">
        <Panel className="contracts-picker" title="Wybierz kontrakt">
          <div className="contracts-picker__toolbar">
            <div className="toolbar-tabs">
              <ActionButton
                type="button"
                variant={filter === "all" ? "primary" : "secondary"}
                onClick={() => setFilter("all")}
              >
                Wszystkie
              </ActionButton>
              <ActionButton
                type="button"
                variant={filter === "active" ? "primary" : "secondary"}
                onClick={() => setFilter("active")}
              >
                W realizacji
              </ActionButton>
              <ActionButton
                type="button"
                variant={filter === "archived" ? "primary" : "secondary"}
                onClick={() => setFilter("archived")}
              >
                Zarchiwizowane
              </ActionButton>
            </div>
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Szukaj kontraktu"
            />
          </div>

          <div className="contracts-picker__list" data-testid="contracts-picker">
            {filteredContracts.length ? (
              filteredContracts.map((contract) => {
                const isActive = contract.id === selectedContractId;
                return (
                  <button
                    key={contract.id}
                    type="button"
                    className={`contracts-picker__item${isActive ? " contracts-picker__item--active" : ""}`}
                    onClick={() => setSelectedContractId(contract.id)}
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
              <div className="contracts-empty-note">
                <p className="status-message">
                  {contracts.length
                    ? "Brak kontraktÃ³w dla wybranego filtra."
                    : "Brak kontraktÃ³w w rejestrze. Dodaj pierwszy kontrakt."}
                </p>
              </div>
            )}
          </div>
        </Panel>

        <div className="contracts-main-panel">
          {selectedContract ? (
            <Panel className="contracts-overview-panel">
              <div className="contracts-overview-header">
                <div className="contracts-overview-header__primary">
                  <p className="section-header__eyebrow">
                    {selectedContract.contract_number || "Bez numeru"}
                  </p>
                  <h2 className="contracts-overview-header__title">{selectedContract.name}</h2>
                  <p className="contracts-overview-header__subtitle">
                    {selectedContract.investor || "Bez inwestora"} â€¢ {formatStatus(selectedContract.status)}
                  </p>
                </div>

                <div className="contracts-overview-header__side">
                  <div className="contracts-overview-health">
                    <span
                      className={`contracts-chip contracts-chip--${
                        selectedSnapshot?.health.level ?? "attention"
                      }`}
                    >
                      {selectedSnapshot
                        ? formatHealthLevel(selectedSnapshot.health.level)
                        : "Åadowanie"}
                    </span>
                    <span className="contracts-overview-health__meta">
                      Finansowo:{" "}
                      {selectedSnapshot
                        ? formatStaleness(selectedSnapshot.freshness.days_since_financial_activity)
                        : "Å‚adowanie"}
                    </span>
                    <span className="contracts-overview-health__meta">
                      Operacyjnie:{" "}
                      {selectedSnapshot
                        ? formatStaleness(selectedSnapshot.freshness.days_since_operational_activity)
                        : "Å‚adowanie"}
                    </span>
                  </div>
                  <div className="module-actions">
                    <ActionButton type="button" variant="secondary" onClick={openEditDrawer}>
                      Edytuj dane kontraktu
                    </ActionButton>
                    <ActionButton type="button" variant="secondary" onClick={openControlDrawer}>
                      Plan i forecast
                    </ActionButton>
                    <ActionButton
                      type="button"
                      variant={selectedContract.status === "archived" ? "ghost" : "secondary"}
                      onClick={() => void handleContractAction(selectedContract)}
                    >
                      {selectedContract.status === "archived" ? "UsuÅ„" : "Archiwizuj"}
                    </ActionButton>
                  </div>
                </div>
              </div>

              <ContractCenterPanel
                contract={selectedContract}
                snapshot={selectedSnapshot}
                isLoading={isSnapshotLoading}
                errorMessage={selectedSnapshotError}
              />
            </Panel>
          ) : (
            <Panel title="Centrum kontraktu">
              <p className="status-message">Wybierz kontrakt, aby zobaczyÄ‡ jego wynik, plan, forecast i alerty.</p>
            </Panel>
          )}
        </div>
      </div>

      {drawerState.kind !== "none" ? (
        <div className="contracts-drawer-shell" role="dialog" aria-modal="true">
          <button
            type="button"
            className="contracts-drawer-shell__backdrop"
            aria-label="Zamknij panel"
            onClick={closeDrawer}
          />
          <aside className="contracts-drawer">
            <div className="contracts-drawer__header">
              <div>
                <p className="section-header__eyebrow">
                  {drawerState.kind === "control" ? "Kontrola kontraktu" : "Dane kontraktu"}
                </p>
                <h2 className="contracts-drawer__title">
                  {drawerState.kind === "control"
                    ? "Plan i forecast"
                    : drawerState.mode === "edit"
                      ? "Edytuj dane kontraktu"
                      : "Dodaj kontrakt"}
                </h2>
              </div>
              <ActionButton type="button" variant="ghost" onClick={closeDrawer}>
                Zamknij
              </ActionButton>
            </div>

            {drawerState.kind === "contract" ? (
              <form className="contracts-drawer__form" onSubmit={handleContractSubmit}>
                <FormGrid columns={1}>
                  <label className="field-card">
                    <span className="field-card__label">Numer kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      value={contractFormValues.contract_number}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          contract_number: event.target.value
                        }))
                      }
                      placeholder="Np. K/2026/011"
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Nazwa kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      value={contractFormValues.name}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          name: event.target.value
                        }))
                      }
                      placeholder="Nazwa kontraktu"
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Inwestor</span>
                    <input
                      className="text-input field-card__control"
                      value={contractFormValues.investor}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          investor: event.target.value
                        }))
                      }
                      placeholder="Nazwa inwestora"
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Status</span>
                    <select
                      className="text-input field-card__control"
                      value={contractFormValues.status}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          status: event.target.value as ContractFormValues["status"]
                        }))
                      }
                    >
                      <option value="active">W realizacji</option>
                      <option value="archived">Zarchiwizowany</option>
                    </select>
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Data podpisania</span>
                    <input
                      className="text-input field-card__control"
                      type="date"
                      value={contractFormValues.signed_date}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          signed_date: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Termin zakoÅ„czenia</span>
                    <input
                      className="text-input field-card__control"
                      type="date"
                      value={contractFormValues.end_date}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          end_date: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">WartoÅ›Ä‡ kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      type="number"
                      min="0"
                      step="0.01"
                      value={contractFormValues.contract_value}
                      onChange={(event) =>
                        setContractFormValues((current) => ({
                          ...current,
                          contract_value: event.target.value
                        }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                </FormGrid>

                <FormFeedback items={[drawerFeedback]} />

                <FormActions
                  leading={
                    <ActionButton type="button" variant="ghost" onClick={closeDrawer}>
                      Anuluj
                    </ActionButton>
                  }
                  trailing={
                    <ActionButton type="submit" disabled={isSubmittingContract}>
                      {isSubmittingContract ? "Zapisywanie..." : "Zapisz"}
                    </ActionButton>
                  }
                />
              </form>
            ) : (
              <form className="contracts-drawer__form" onSubmit={handleControlSubmit}>
                <div className="contracts-drawer__intro">
                  <p className="contracts-drawer__intro-title">Ręczna kontrola kontraktu</p>
                  <p className="contracts-drawer__intro-copy">
                    Actuals system liczy automatycznie z faktur, czasu pracy i aktywności operacyjnej.
                    W tym panelu utrzymujesz wyłącznie plan oraz forecast końcowy.
                  </p>
                  {selectedSnapshot?.control.updated_at ? (
                    <p className="contracts-drawer__intro-meta">
                      Ostatnia aktualizacja: {formatDateTime(selectedSnapshot.control.updated_at)}
                    </p>
                  ) : null}
                  {selectedSnapshot?.control.updated_by ? (
                    <p className="contracts-drawer__intro-meta">
                      Aktualizował: {selectedSnapshot.control.updated_by}
                    </p>
                  ) : null}
                </div>
                <FormGrid columns={1}>
                  <div className="contracts-control-form-section">
                    <div className="contracts-control-form-section__heading">
                      <h3>Plan kontraktu</h3>
                      <p>Ręczne wartości kontrolne, do których system porównuje wykonanie.</p>
                    </div>
                    <label className="field-card">
                      <span className="field-card__label">Planowany przychód</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.planned_revenue_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            planned_revenue_total: event.target.value
                          }))
                        }
                        placeholder="Pozostaw puste, aby użyć wartości kontraktu"
                      />
                    </label>
                    <label className="field-card">
                      <span className="field-card__label">Planowany koszt fakturowy</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.planned_invoice_cost_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            planned_invoice_cost_total: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="field-card">
                      <span className="field-card__label">Planowany koszt pracy</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.planned_labor_cost_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            planned_labor_cost_total: event.target.value
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="contracts-control-form-section">
                    <div className="contracts-control-form-section__heading">
                      <h3>Forecast końcowy</h3>
                      <p>Ręcznie utrzymywana prognoza wyniku końcowego kontraktu.</p>
                    </div>
                    <label className="field-card">
                      <span className="field-card__label">Forecast przychodu</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.forecast_revenue_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            forecast_revenue_total: event.target.value
                          }))
                        }
                        placeholder="Pozostaw puste, aby użyć planu lub wartości kontraktu"
                      />
                    </label>
                    <label className="field-card">
                      <span className="field-card__label">Forecast kosztu fakturowego</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.forecast_invoice_cost_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            forecast_invoice_cost_total: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="field-card">
                      <span className="field-card__label">Forecast kosztu pracy</span>
                      <input
                        className="text-input field-card__control"
                        type="number"
                        min="0"
                        step="0.01"
                        value={controlFormValues.forecast_labor_cost_total}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            forecast_labor_cost_total: event.target.value
                          }))
                        }
                      />
                    </label>
                    <label className="field-card contracts-drawer__full">
                      <span className="field-card__label">Notatka kontrolna</span>
                      <textarea
                        className="text-input field-card__control"
                        value={controlFormValues.note}
                        onChange={(event) =>
                          setControlFormValues((current) => ({
                            ...current,
                            note: event.target.value
                          }))
                        }
                        rows={4}
                        placeholder="Uzasadnienie forecastu, decyzje kosztowe, ryzyka do obserwacji."
                      />
                    </label>
                  </div>
                </FormGrid>

                <FormFeedback items={[drawerFeedback]} />

                <FormActions
                  leading={
                    <ActionButton type="button" variant="ghost" onClick={closeDrawer}>
                      Anuluj
                    </ActionButton>
                  }
                  trailing={
                    <ActionButton type="submit" disabled={isSubmittingControl}>
                      {isSubmittingControl ? "Zapisywanie..." : "Zapisz plan i forecast"}
                    </ActionButton>
                  }
                />
              </form>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
