"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { ContractCenterPanel } from "@/features/contracts/contract-center-panel";
import {
  archiveContractRecord,
  deleteContractRecord,
  fetchContractSnapshot,
  fetchContracts,
  findContractById,
  normalizeContractPayload,
  saveContract
} from "@/features/contracts/api";
import { formatMoney, formatStatus } from "@/features/contracts/formatters";
import {
  buildContractHistoricalDataLines,
  buildContractSummaryItems,
  mapContractsViewModel,
  resolveNextSelectedContractId,
  toContractFormValues
} from "@/features/contracts/mappers";
import type {
  ContractFormValues,
  ContractRecord,
  ContractSnapshot,
  ContractsViewModel
} from "@/features/contracts/types";

type ContractsFilter = "all" | "active" | "archived";
type ContractEditorMode = "closed" | "create" | "edit";

type ContractsScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractsViewModel };

type SnapshotState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractSnapshot };

function areContractFormValuesEqual(left: ContractFormValues, right: ContractFormValues) {
  return (
    left.contract_number === right.contract_number &&
    left.name === right.name &&
    left.investor === right.investor &&
    left.signed_date === right.signed_date &&
    left.end_date === right.end_date &&
    left.contract_value === right.contract_value &&
    left.status === right.status
  );
}

const emptyFormValues = toContractFormValues();

export function ContractsView({
  initialContracts,
  initialError
}: {
  initialContracts?: ContractRecord[] | null;
  initialError?: string | null;
}) {
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
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    initialContracts?.[0]?.id ?? null
  );
  const [editorMode, setEditorMode] = useState<ContractEditorMode>("closed");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<ContractFormValues>(() => emptyFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>({ status: "idle" });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedContractIds, setSelectedContractIds] = useState<string[]>([]);

  async function reloadContracts(options?: { preserveState?: boolean; selectId?: string | null }) {
    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const contracts = await fetchContracts(true);
      const mapped = mapContractsViewModel(contracts);

      setState({ status: "success", data: mapped });
      setSelectedContractId((current) =>
        resolveNextSelectedContractId(contracts, current, options?.selectId)
      );
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Nie udało się pobrać listy kontraktów."
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const shouldUseInitialData = Boolean(initialContracts) || Boolean(initialError);
    if (shouldUseInitialData) {
      return;
    }

    void reloadContracts();
  }, [initialContracts, initialError]);

  const filteredContracts = useMemo(() => {
    if (state.status !== "success") return [];

    const term = search.trim().toLowerCase();

    return state.data.contracts.filter((contract) => {
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
  }, [filter, search, state]);

  const selectedContract = useMemo(() => {
    if (state.status !== "success") return null;
    return findContractById(state.data.contracts, selectedContractId);
  }, [selectedContractId, state]);

  const editingContract = useMemo(() => {
    if (state.status !== "success") return null;
    return findContractById(state.data.contracts, editingContractId);
  }, [editingContractId, state]);

  const selectedContractMeta = useMemo(() => {
    if (!selectedContract) return [];

    return buildContractSummaryItems(selectedContract).filter((item) =>
      ["contract_number", "investor", "end_date"].includes(item.id)
    );
  }, [selectedContract]);

  const contractsRegistry = state.status === "success" ? state.data.contracts : [];
  const editorBaseline =
    editorMode === "edit" && editingContract ? toContractFormValues(editingContract) : emptyFormValues;
  const hasEditorChanges =
    editorMode !== "closed" && !areContractFormValuesEqual(formValues, editorBaseline);

  const allVisibleSelected =
    filteredContracts.length > 0 &&
    filteredContracts.every((contract) => selectedContractIds.includes(contract.id));

  const bulkActionLabel =
    selectedContractIds.length > 0 &&
    selectedContractIds.every((id) =>
      contractsRegistry.find((contract) => contract.id === id)?.status === "archived"
    )
      ? "Usuń zaznaczone"
      : "Archiwizuj zaznaczone";

  useEffect(() => {
    if (!selectedContract) {
      setSnapshotState({ status: "idle" });
      return;
    }

    let active = true;
    setSnapshotState({ status: "loading" });

    void fetchContractSnapshot(selectedContract.id)
      .then((snapshot) => {
        if (!active) return;
        setSnapshotState({ status: "success", data: snapshot });
      })
      .catch((error) => {
        if (!active) return;
        setSnapshotState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Nie udało się pobrać Centrum kontraktu."
        });
      });

    return () => {
      active = false;
    };
  }, [selectedContract]);

  useEffect(() => {
    if (editorMode === "edit" && editingContractId && selectedContractId !== editingContractId) {
      setEditorMode("closed");
      setEditingContractId(null);
      setFormValues(emptyFormValues);
    }
  }, [editingContractId, editorMode, selectedContractId]);

  useEffect(() => {
    if (editorMode === "edit" && editingContractId && !editingContract) {
      setEditorMode("closed");
      setEditingContractId(null);
      setFormValues(emptyFormValues);
    }
  }, [editingContract, editingContractId, editorMode]);

  function clearFeedback() {
    setFormError(null);
    setFormStatus(null);
  }

  function confirmDiscardEditor() {
    if (!hasEditorChanges) {
      return true;
    }

    return window.confirm("Masz niezapisane zmiany. Czy chcesz je odrzucić?");
  }

  function discardEditor() {
    if (!confirmDiscardEditor()) {
      return false;
    }

    setEditorMode("closed");
    setEditingContractId(null);
    setFormValues(emptyFormValues);
    clearFeedback();
    return true;
  }

  function toggleSelectionMode() {
    if (editorMode !== "closed" && !discardEditor()) {
      return;
    }

    setIsSelectionMode((current) => !current);
    setSelectedContractIds([]);
    clearFeedback();
  }

  function selectContract(contract: ContractRecord) {
    if (editorMode !== "closed" && !discardEditor()) {
      return;
    }

    setSelectedContractId(contract.id);
    clearFeedback();
  }

  function beginCreating() {
    if (editorMode === "create") {
      return;
    }

    if (editorMode !== "closed" && !discardEditor()) {
      return;
    }

    setEditorMode("create");
    setEditingContractId(null);
    setFormValues(emptyFormValues);
    clearFeedback();
  }

  function beginEditing(contract: ContractRecord) {
    if (editorMode === "edit" && editingContractId === contract.id) {
      return;
    }

    if (
      editorMode !== "closed" &&
      (editorMode !== "edit" || editingContractId !== contract.id) &&
      !discardEditor()
    ) {
      return;
    }

    setSelectedContractId(contract.id);
    setEditingContractId(contract.id);
    setEditorMode("edit");
    setFormValues(toContractFormValues(contract));
    clearFeedback();
  }

  function isSelected(contractId: string) {
    return selectedContractIds.includes(contractId);
  }

  function toggleSelected(contractId: string, checked: boolean) {
    setSelectedContractIds((current) => {
      const next = new Set(current);
      if (checked) next.add(contractId);
      else next.delete(contractId);
      return [...next];
    });
  }

  function toggleAllVisible(checked: boolean) {
    setSelectedContractIds((current) => {
      const next = new Set(current);
      filteredContracts.forEach((contract) => {
        if (checked) next.add(contract.id);
        else next.delete(contract.id);
      });
      return [...next];
    });
  }

  function handleListItemClick(contract: ContractRecord) {
    if (isSelectionMode) {
      toggleSelected(contract.id, !isSelected(contract.id));
      return;
    }

    selectContract(contract);
  }

  async function handleAction(contract: ContractRecord) {
    clearFeedback();

    if (contract.status === "archived") {
      try {
        const snapshot = await fetchContractSnapshot(contract.id);
        if (snapshot.activity.has_data) {
          const parts = buildContractHistoricalDataLines(snapshot);
          window.alert(
            `Nie można trwale usunąć zarchiwizowanego kontraktu z danymi historycznymi.\n\n${parts.join("\n")}`
          );
          return;
        }
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "Nie udało się sprawdzić danych kontraktu przed usunięciem."
        );
        return;
      }

      if (!window.confirm(`Czy na pewno chcesz trwale usunąć kontrakt "${contract.name}"?`)) {
        return;
      }

      try {
        await deleteContractRecord(contract.id);
        if (selectedContractId === contract.id) {
          setEditorMode("closed");
          setEditingContractId(null);
          setFormValues(emptyFormValues);
        }
        await reloadContracts({ preserveState: true });
        setFormStatus(`Kontrakt "${contract.name}" został usunięty.`);
      } catch (error) {
        setFormError(
          error instanceof Error ? error.message : "Nie udało się usunąć kontraktu."
        );
      }
      return;
    }

    if (!window.confirm(`Czy na pewno chcesz zarchiwizować kontrakt "${contract.name}"?`)) {
      return;
    }

    try {
      await archiveContractRecord(contract.id);
      await reloadContracts({ preserveState: true, selectId: contract.id });
      setFormStatus(`Kontrakt "${contract.name}" został zarchiwizowany.`);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zarchiwizować kontraktu."
      );
    }
  }

  async function handleBulkAction() {
    if (!selectedContractIds.length) {
      window.alert("Zaznacz kontrakty do archiwizacji lub usunięcia.");
      return;
    }

    const contractsById = new Map(contractsRegistry.map((item) => [item.id, item]));
    const archivedIds = selectedContractIds.filter(
      (id) => contractsById.get(id)?.status === "archived"
    );
    const activeIds = selectedContractIds.filter(
      (id) => contractsById.get(id)?.status !== "archived"
    );

    const archivedSnapshots = await Promise.all(
      archivedIds.map(async (id) => ({
        id,
        contract: contractsById.get(id) || null,
        snapshot: await fetchContractSnapshot(id)
      }))
    );

    const archivedWithUsage = archivedSnapshots.filter(({ snapshot }) => snapshot.activity.has_data);
    const archivedDeletableIds = archivedIds.filter(
      (id) => !archivedWithUsage.some((entry) => entry.id === id)
    );

    const promptParts: string[] = [];
    if (activeIds.length === selectedContractIds.length) {
      promptParts.push(
        selectedContractIds.length === 1
          ? `Czy na pewno chcesz zarchiwizować kontrakt "${contractsById.get(selectedContractIds[0])?.name || ""}"?`
          : `Czy na pewno chcesz zarchiwizować ${selectedContractIds.length} zaznaczonych kontraktów?`
      );
    } else if (archivedIds.length === selectedContractIds.length) {
      promptParts.push(
        archivedDeletableIds.length === selectedContractIds.length
          ? `Czy na pewno chcesz trwale usunąć ${selectedContractIds.length} zarchiwizowanych kontraktów?`
          : "Część zaznaczonych kontraktów ma dane historyczne i pozostanie zarchiwizowana."
      );
    } else {
      promptParts.push(
        `Czy na pewno chcesz zarchiwizować ${activeIds.length} kontrakty i usunąć ${archivedDeletableIds.length} zarchiwizowane pozycje bez danych historycznych?`
      );
    }

    if (archivedWithUsage.length) {
      promptParts.push(
        `Kontrakty z danymi historycznymi pozostaną zarchiwizowane:\n${archivedWithUsage
          .map(({ contract, snapshot }) => {
            const details = buildContractHistoricalDataLines(snapshot);
            return `- ${contract?.name || contract?.id || "Kontrakt"} (${details.join(", ")})`;
          })
          .join("\n")}`
      );
    }

    if (!window.confirm(promptParts.join("\n\n"))) {
      return;
    }

    clearFeedback();

    try {
      if (activeIds.length) {
        await Promise.all(activeIds.map((id) => archiveContractRecord(id)));
      }

      if (archivedDeletableIds.length) {
        await Promise.all(archivedDeletableIds.map((id) => deleteContractRecord(id)));
      }

      setSelectedContractIds([]);
      setIsSelectionMode(false);
      await reloadContracts({ preserveState: true });
      setFormStatus(
        activeIds.length && archivedDeletableIds.length
          ? "Zaznaczone kontrakty zostały zarchiwizowane lub usunięte."
          : activeIds.length
            ? "Zaznaczone kontrakty zostały zarchiwizowane."
            : "Zaznaczone zarchiwizowane kontrakty zostały usunięte."
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się wykonać akcji zbiorczej."
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();

    if (!formValues.name.trim()) {
      setFormError("Podaj nazwę kontraktu.");
      return;
    }

    const contractValue = Number(formValues.contract_value || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      setFormError("Wartość kontraktu nie może być ujemna.");
      return;
    }

    if (
      formValues.signed_date &&
      formValues.end_date &&
      new Date(formValues.end_date).getTime() < new Date(formValues.signed_date).getTime()
    ) {
      setFormError("Termin zakończenia nie może być wcześniejszy niż data podpisania.");
      return;
    }

    setIsSubmitting(true);

    try {
      const saved = await saveContract(
        editorMode === "edit" ? editingContractId : null,
        normalizeContractPayload(formValues)
      );

      await reloadContracts({
        preserveState: true,
        selectId: saved.id
      });

      setSelectedContractId(saved.id);
      setEditorMode("closed");
      setEditingContractId(null);
      setFormValues(emptyFormValues);
      setFormStatus(
        editorMode === "edit"
          ? `Kontrakt "${saved.name}" został zaktualizowany.`
          : `Kontrakt "${saved.name}" został dodany.`
      );
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się zapisać kontraktu."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Kontrakty" title="Kontrakty" />
        <Panel title="Wybierz kontrakt">
          <p className="status-message">Trwa odczyt listy kontraktów.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Kontrakty"
          title="Kontrakty"
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

  const isEditing = editorMode === "edit";
  const editorTitle = isEditing ? "Edycja kontraktu" : "Nowy kontrakt";
  const pageFeedback =
    editorMode === "closed"
      ? [
          formError ? { tone: "error" as const, text: formError } : null,
          formStatus ? { tone: "success" as const, text: formStatus } : null
        ]
      : [formStatus ? { tone: "success" as const, text: formStatus } : null];
  const drawerFeedback = [formError ? { tone: "error" as const, text: formError } : null];

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kontrakty"
        title="Kontrakty"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              <ActionButton type="button" onClick={beginCreating}>
                Dodaj kontrakt
              </ActionButton>
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void reloadContracts({ preserveState: true })}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <FormFeedback items={pageFeedback} />

      <div className="contracts-layout">
        <Panel className="contracts-selection-panel" title="Wybierz kontrakt">
          <div className="contracts-selection-toolbar">
            <div className="dashboard-toolbar__tabs">
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

            <div className="contracts-selection-toolbar__actions">
              <ActionButton
                type="button"
                variant={isSelectionMode ? "primary" : "secondary"}
                onClick={toggleSelectionMode}
              >
                {isSelectionMode ? "Zakończ zaznaczanie" : "Zaznacz wiele"}
              </ActionButton>
              {isSelectionMode ? (
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={() => toggleAllVisible(!allVisibleSelected)}
                  disabled={!filteredContracts.length}
                >
                  {allVisibleSelected ? "Odznacz widoczne" : "Zaznacz widoczne"}
                </ActionButton>
              ) : null}
            </div>
          </div>

          {isSelectionMode ? (
            <div className="contracts-selection-bulk">
              <span className="contracts-selection-bulk__meta">
                {selectedContractIds.length
                  ? `Zaznaczone: ${selectedContractIds.length}`
                  : "Zaznacz kontrakty do akcji zbiorczej"}
              </span>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void handleBulkAction()}
                disabled={!selectedContractIds.length}
              >
                {bulkActionLabel}
              </ActionButton>
            </div>
          ) : null}

          {filteredContracts.length ? (
            <ul className="contracts-picker" aria-label="Lista kontraktów">
              {filteredContracts.map((contract) => {
                const isActive = contract.id === selectedContractId;
                const checked = isSelected(contract.id);

                return (
                  <li key={contract.id} className="contracts-picker__item">
                    <button
                      type="button"
                      className={[
                        "contracts-picker__button",
                        isActive ? "contracts-picker__button--active" : "",
                        checked ? "contracts-picker__button--checked" : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleListItemClick(contract)}
                      aria-pressed={isSelectionMode ? checked : isActive}
                    >
                      {isSelectionMode ? (
                        <span
                          className={[
                            "contracts-picker__checkbox",
                            checked ? "contracts-picker__checkbox--checked" : ""
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-hidden="true"
                        />
                      ) : null}

                      <span className="contracts-picker__content">
                        <span className="contracts-picker__top">
                          <span className="contracts-picker__number">
                            {contract.contract_number || "Brak numeru"}
                          </span>
                          <span
                            className={[
                              "contracts-picker__status",
                              `contracts-picker__status--${contract.status}`
                            ].join(" ")}
                          >
                            {formatStatus(contract.status)}
                          </span>
                        </span>
                        <span className="contracts-picker__name">{contract.name || "-"}</span>
                        <span className="contracts-picker__investor">
                          {contract.investor || "Brak inwestora"}
                        </span>
                        <span className="contracts-picker__meta">
                          Wartość kontraktu: {formatMoney(contract.contract_value)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="contracts-selection-empty">
              <p className="status-message">
                {state.data.contracts.length === 0
                  ? "Brak kontraktów w rejestrze."
                  : "Brak kontraktów dla wybranego filtra lub wyszukiwania."}
              </p>
            </div>
          )}
        </Panel>

        <Panel className="contracts-center-panel" title="Centrum kontraktu">
          {selectedContract ? (
            <div className="contracts-focus-header">
              <div className="contracts-focus-header__main">
                <div className="contracts-focus-header__top">
                  <h2 className="contracts-focus-header__title">{selectedContract.name}</h2>
                  <span
                    className={[
                      "contracts-picker__status",
                      `contracts-picker__status--${selectedContract.status}`
                    ].join(" ")}
                  >
                    {formatStatus(selectedContract.status)}
                  </span>
                </div>
                <div className="contracts-focus-header__meta">
                  {selectedContractMeta.map((item) => (
                    <span key={item.id} className="contracts-focus-header__meta-item">
                      <span className="contracts-focus-header__meta-label">{item.label}</span>
                      <strong>{item.value}</strong>
                    </span>
                  ))}
                </div>
              </div>
              <div className="contracts-focus-header__actions">
                <ActionButton type="button" onClick={() => beginEditing(selectedContract)}>
                  Edytuj
                </ActionButton>
                <ActionButton
                  type="button"
                  variant={selectedContract.status === "archived" ? "ghost" : "secondary"}
                  onClick={() => void handleAction(selectedContract)}
                >
                  {selectedContract.status === "archived" ? "Usuń" : "Archiwizuj"}
                </ActionButton>
              </div>
            </div>
          ) : null}

          <ContractCenterPanel
            contract={selectedContract}
            snapshot={snapshotState.status === "success" ? snapshotState.data : null}
            isLoading={snapshotState.status === "loading"}
            errorMessage={snapshotState.status === "error" ? snapshotState.message : null}
          />
        </Panel>
      </div>

      {editorMode !== "closed" ? (
        <div className="contracts-editor-drawer-shell" role="presentation">
          <button
            type="button"
            className="contracts-editor-drawer__backdrop"
            aria-label="Zamknij panel edycji kontraktu"
            onClick={() => {
              discardEditor();
            }}
          />
          <aside
            className="contracts-editor-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contracts-editor-title"
          >
            <Panel className="contracts-editor-panel">
              <div className="contracts-editor-panel__header">
                <div>
                  <p className="contracts-editor-panel__eyebrow">Edycja danych</p>
                  <h2 id="contracts-editor-title" className="contracts-editor-panel__title">
                    {editorTitle}
                  </h2>
                </div>
                <ActionButton type="button" variant="ghost" onClick={discardEditor}>
                  Zamknij
                </ActionButton>
              </div>

              <FormFeedback items={drawerFeedback} />

              <form className="contracts-form" onSubmit={handleSubmit}>
                <FormGrid columns={1}>
                  <label className="field-card">
                    <span className="field-card__label">Numer kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      value={formValues.contract_number}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          contract_number: event.target.value
                        }))
                      }
                      placeholder="Np. K/2026/011"
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Status</span>
                    <select
                      className="text-input field-card__control"
                      value={formValues.status}
                      onChange={(event) =>
                        setFormValues((current) => ({
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
                    <span className="field-card__label">Nazwa kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      value={formValues.name}
                      onChange={(event) =>
                        setFormValues((current) => ({
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
                      value={formValues.investor}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          investor: event.target.value
                        }))
                      }
                      placeholder="Nazwa inwestora"
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Data podpisania</span>
                    <input
                      className="text-input field-card__control"
                      type="date"
                      value={formValues.signed_date}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          signed_date: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field-card">
                    <span className="field-card__label">Termin zakończenia</span>
                    <input
                      className="text-input field-card__control"
                      type="date"
                      value={formValues.end_date}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          end_date: event.target.value
                        }))
                      }
                    />
                  </label>
                  <label className="field-card contracts-form__full">
                    <span className="field-card__label">Wartość kontraktu</span>
                    <input
                      className="text-input field-card__control"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formValues.contract_value}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          contract_value: event.target.value
                        }))
                      }
                      placeholder="0.00"
                    />
                  </label>
                </FormGrid>

                <FormActions
                  leading={
                    <ActionButton type="button" variant="ghost" onClick={discardEditor}>
                      {isEditing ? "Anuluj edycję" : "Anuluj dodawanie"}
                    </ActionButton>
                  }
                  trailing={
                    <ActionButton type="submit" disabled={isSubmitting}>
                      {isSubmitting
                        ? "Zapisywanie..."
                        : isEditing
                          ? "Zapisz zmiany"
                          : "Dodaj kontrakt"}
                    </ActionButton>
                  }
                />
              </form>
            </Panel>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
