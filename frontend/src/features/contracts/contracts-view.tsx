"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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
  normalizeContractPayload,
  saveContract
} from "@/features/contracts/api";
import { formatDate, formatMoney, formatStatus } from "@/features/contracts/formatters";
import {
  buildContractHistoricalDataLines,
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

type ContractTableRow = {
  index: number;
  item: ContractRecord;
};

function areContractFormValuesEqual(
  left: ContractFormValues,
  right: ContractFormValues
) {
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

const contractColumns = (
  handlers: {
    allSelected: boolean;
    onToggleAll: (checked: boolean) => void;
    isSelected: (contractId: string) => boolean;
    onToggleSelected: (contractId: string, checked: boolean) => void;
    onEdit: (contract: ContractRecord) => void;
    onAction: (contract: ContractRecord) => void;
  }
): Array<DataTableColumn<ContractTableRow>> => [
  {
    key: "select",
    header: (
      <input
        type="checkbox"
        checked={handlers.allSelected}
        onChange={(event) => handlers.onToggleAll(event.target.checked)}
        aria-label="Zaznacz wszystkie kontrakty"
      />
    ),
    className: "contracts-col-select",
    sortable: false,
    render: (row) => (
      <input
        type="checkbox"
        checked={handlers.isSelected(row.item.id)}
        aria-label={`Zaznacz kontrakt ${row.item.name}`}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => handlers.onToggleSelected(row.item.id, event.target.checked)}
      />
    )
  },
  {
    key: "lp",
    header: "Lp.",
    className: "contracts-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index
  },
  {
    key: "contract_number",
    header: "Numer kontraktu",
    className: "contracts-col-id",
    sortValue: (row) => row.item.contract_number,
    render: (row) => row.item.contract_number || "-"
  },
  {
    key: "name",
    header: "Nazwa kontraktu",
    className: "contracts-col-name",
    sortValue: (row) => row.item.name,
    render: (row) => <span className="data-table__primary">{row.item.name || "-"}</span>
  },
  {
    key: "investor",
    header: "Inwestor",
    className: "contracts-col-investor",
    sortValue: (row) => row.item.investor,
    render: (row) => row.item.investor || "-"
  },
  {
    key: "signed_date",
    header: "Data podpisania",
    className: "contracts-col-date",
    sortValue: (row) => row.item.signed_date,
    render: (row) => formatDate(row.item.signed_date)
  },
  {
    key: "end_date",
    header: "Termin zakończenia",
    className: "contracts-col-date",
    sortValue: (row) => row.item.end_date,
    render: (row) => formatDate(row.item.end_date)
  },
  {
    key: "contract_value",
    header: "Wartość kontraktu",
    className: "data-table__numeric contracts-col-value",
    sortValue: (row) => row.item.contract_value,
    render: (row) => formatMoney(row.item.contract_value)
  },
  {
    key: "status",
    header: "Status",
    className: "contracts-col-status",
    sortValue: (row) => row.item.status,
    render: (row) => formatStatus(row.item.status)
  },
  {
    key: "actions",
    header: "Akcje",
    className: "contracts-table__actions",
    sortable: false,
    render: (row) => (
      <div className="contracts-table__actions-stack">
        <ActionButton
          type="button"
          variant="secondary"
          onClick={(event) => {
            event.stopPropagation();
            handlers.onEdit(row.item);
          }}
        >
          Edytuj
        </ActionButton>
        <ActionButton
          type="button"
          variant={row.item.status === "archived" ? "ghost" : "secondary"}
          onClick={(event) => {
            event.stopPropagation();
            handlers.onAction(row.item);
          }}
        >
          {row.item.status === "archived" ? "Usuń" : "Archiwizuj"}
        </ActionButton>
      </div>
    )
  }
];

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
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać rejestru kontraktów."
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

  const contractRows = useMemo(
    () => filteredContracts.map((item, index) => ({ index: index + 1, item })),
    [filteredContracts]
  );

  const contractsRegistry = state.status === "success" ? state.data.contracts : [];
  const editorBaseline =
    editorMode === "edit" && editingContract ? toContractFormValues(editingContract) : emptyFormValues;
  const hasEditorChanges =
    editorMode !== "closed" && !areContractFormValuesEqual(formValues, editorBaseline);

  const allVisibleSelected =
    contractRows.length > 0 &&
    contractRows.every((row) => selectedContractIds.includes(row.item.id));

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

    return window.confirm(
      "Masz niezapisane zmiany w danych kontraktu. Czy chcesz je odrzucić?"
    );
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
      contractRows.forEach((row) => {
        if (checked) next.add(row.item.id);
        else next.delete(row.item.id);
      });
      return [...next];
    });
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
      window.alert("Zaznacz najpierw kontrakty do archiwizacji lub usunięcia.");
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
      setEditorMode("closed");
      setEditingContractId(null);
      setFormValues(emptyFormValues);
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
        <SectionHeader eyebrow="Kontrakty" title="Centrum kontraktów" />
        <div className="module-page__stats">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." />
          ))}
        </div>
        <Panel title="Lista kontraktów">
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

  const columns = contractColumns({
    allSelected: allVisibleSelected,
    onToggleAll: toggleAllVisible,
    isSelected,
    onToggleSelected: toggleSelected,
    onEdit: beginEditing,
    onAction: (contract) => void handleAction(contract)
  });
  const isEditing = editorMode === "edit";
  const editorTitle = isEditing ? "Edycja kontraktu" : "Nowy kontrakt";
  const editorDescription = isEditing
    ? "Zmieniasz dane rejestrowe kontraktu. Podgląd i analiza pozostają oddzielnie powyżej."
    : "Uzupełnij podstawowe dane nowego kontraktu. Po zapisaniu pojawi się jego Centrum kontraktu.";
  const workspaceModeLabel =
    editorMode === "edit"
      ? "Podgląd kontraktu i edycja"
      : editorMode === "create"
        ? "Podgląd kontraktu i nowy wpis"
        : "Podgląd kontraktu";
  const workspaceHint = selectedContract
    ? editorMode === "closed"
      ? "Najpierw analizujesz kontrakt. Edycję uruchamiasz osobno."
      : "Centrum kontraktu pozostaje głównym widokiem, a formularz działa jako osobny tryb."
    : "Wybierz kontrakt z listy albo dodaj nowy wpis.";

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kontrakty"
        title="Centrum kontraktów"
        description="Wybierz kontrakt z listy, aby szybko ocenić jego sytuację finansową i operacyjną."
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

      <div className="module-page__stats module-page__stats--compact">
        {state.data.summary.slice(0, 4).map((item) => (
          <StatCard
            key={item.id}
            label={item.label}
            value={item.value}
            accent={item.accent}
          />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="toolbar-strip">
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
            placeholder="Szukaj po numerze, nazwie lub inwestorze"
          />
        </div>
        {selectedContractIds.length ? (
          <div className="contracts-bulk-toolbar contracts-bulk-toolbar--active">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => void handleBulkAction()}
            >
              {bulkActionLabel}
            </ActionButton>
            <span className="contracts-bulk-toolbar__meta">
              {`Zaznaczone: ${selectedContractIds.length}`}
            </span>
          </div>
        ) : null}
      </Panel>

      <FormFeedback
        items={[
          formError ? { tone: "error", text: formError } : null,
          formStatus ? { tone: "success", text: formStatus } : null
        ]}
      />

      <div className="contracts-layout">
        <Panel
          className="contracts-list-panel"
          title="Lista kontraktów"
          description="Kliknięcie wiersza otwiera podgląd kontraktu. Edycję uruchamiasz przyciskiem Edytuj."
        >
          <DataTable
            columns={columns}
            rows={contractRows}
            rowKey={(row) => row.item.id}
            tableClassName="contracts-table contracts-table--registry"
            onRowClick={(row) => selectContract(row.item)}
            getRowClassName={(row) =>
              row.item.id === selectedContractId ? "data-table__row--active" : undefined
            }
            emptyMessage={
              state.data.contracts.length === 0
                ? "Brak kontraktów w rejestrze. Dodaj pierwszy kontrakt przyciskiem Dodaj kontrakt."
                : "Brak kontraktów dla wybranego filtra lub wyszukiwania."
            }
          />
        </Panel>

        <div className="contracts-workspace">
          <Panel
            className="contracts-center-panel"
            title="Centrum kontraktu"
            description="Najważniejsze liczby, aktywność operacyjna i przebieg miesięczny wybranego kontraktu."
          >
            <div className="contracts-workspace__toolbar">
              <div className="contracts-workspace__copy">
                <p className="contracts-workspace__mode">{workspaceModeLabel}</p>
                <p className="contracts-workspace__hint">{workspaceHint}</p>
              </div>
              <div className="contracts-workspace__actions">
                {selectedContract ? (
                  <ActionButton type="button" onClick={() => beginEditing(selectedContract)}>
                    Edytuj
                  </ActionButton>
                ) : null}
                <ActionButton
                  type="button"
                  variant={selectedContract ? "secondary" : "primary"}
                  onClick={beginCreating}
                >
                  Dodaj kontrakt
                </ActionButton>
              </div>
            </div>

            <ContractCenterPanel
              contract={selectedContract}
              snapshot={snapshotState.status === "success" ? snapshotState.data : null}
              isLoading={snapshotState.status === "loading"}
              errorMessage={snapshotState.status === "error" ? snapshotState.message : null}
            />
          </Panel>

          {editorMode !== "closed" ? (
            <Panel
              className="contracts-editor-panel"
              title={editorTitle}
              description={editorDescription}
            >
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
