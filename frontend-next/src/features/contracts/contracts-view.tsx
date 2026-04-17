"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  archiveContractRecord,
  deleteContractRecord,
  fetchContractUsage,
  fetchContracts,
  findContractById,
  normalizeContractPayload,
  saveContract
} from "@/features/contracts/api";
import { formatDate, formatInteger, formatMoney, formatStatus } from "@/features/contracts/formatters";
import { mapContractsViewModel, toContractFormValues } from "@/features/contracts/mappers";
import type {
  ContractFormValues,
  ContractRecord,
  ContractUsageSnapshot,
  ContractsViewModel
} from "@/features/contracts/types";

type ContractsFilter = "all" | "active" | "archived";

type ContractsScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractsViewModel };

type UsageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: ContractUsageSnapshot };

type ContractTableRow = {
  index: number;
  item: ContractRecord;
};

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
    render: (row) => row.index
  },
  {
    key: "contract_number",
    header: "ID",
    className: "contracts-col-id",
    render: (row) => row.item.contract_number || "-"
  },
  {
    key: "name",
    header: "Nazwa kontraktu",
    className: "contracts-col-name",
    render: (row) => <span className="data-table__primary">{row.item.name || "-"}</span>
  },
  {
    key: "investor",
    header: "Zamawiający / inwestor",
    className: "contracts-col-investor",
    render: (row) => row.item.investor || "-"
  },
  {
    key: "signed_date",
    header: "Data podpisania",
    className: "contracts-col-date",
    render: (row) => formatDate(row.item.signed_date)
  },
  {
    key: "end_date",
    header: "Termin zakończenia",
    className: "contracts-col-date",
    render: (row) => formatDate(row.item.end_date)
  },
  {
    key: "contract_value",
    header: "Kwota ryczałtowa",
    className: "data-table__numeric contracts-col-value",
    render: (row) => formatMoney(row.item.contract_value)
  },
  {
    key: "status",
    header: "Status",
    className: "contracts-col-status",
    render: (row) => formatStatus(row.item.status)
  },
  {
    key: "actions",
    header: "Akcje",
    className: "contracts-table__actions",
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
  const [formValues, setFormValues] = useState<ContractFormValues>(() => emptyFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [usageState, setUsageState] = useState<UsageState>({ status: "idle" });
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
      setSelectedContractId((current) => {
        if (options?.selectId && contracts.some((contract) => contract.id === options.selectId)) {
          return options.selectId;
        }
        if (current && contracts.some((contract) => contract.id === current)) {
          return current;
        }
        return contracts[0]?.id ?? null;
      });
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
    const shouldUseInitialData =
      Boolean(initialContracts) || Boolean(initialError);
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
        filter === "all" ? true : filter === "archived" ? contract.status === "archived" : contract.status !== "archived";
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

  const contractRows = useMemo(
    () => filteredContracts.map((item, index) => ({ index: index + 1, item })),
    [filteredContracts]
  );

  const contractsRegistry = state.status === "success" ? state.data.contracts : [];

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
      setUsageState({ status: "idle" });
      return;
    }

    let active = true;
    setUsageState({ status: "loading" });

    void fetchContractUsage(selectedContract.id)
      .then((usage) => {
        if (!active) return;
        setUsageState({ status: "success", data: usage });
      })
      .catch((error) => {
        if (!active) return;
        setUsageState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Nie udało się pobrać użycia kontraktu."
        });
      });

    return () => {
      active = false;
    };
  }, [selectedContract]);

  useEffect(() => {
    if (!selectedContract) {
      setFormValues(emptyFormValues);
      return;
    }

    setFormValues((current) => {
      if (selectedContract.id !== selectedContractId) {
        return current;
      }
      return toContractFormValues(selectedContract);
    });
  }, [selectedContract, selectedContractId]);

  function beginEditing(contract: ContractRecord) {
    setSelectedContractId(contract.id);
    setFormValues(toContractFormValues(contract));
    setFormError(null);
    setFormStatus(null);
  }

  function resetForm() {
    setSelectedContractId(null);
    setFormValues(emptyFormValues);
    setFormError(null);
    setFormStatus(null);
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
    setFormError(null);
    setFormStatus(null);

    if (contract.status === "archived") {
      try {
        const usage = await fetchContractUsage(contract.id);
        if (usage.has_operational_data) {
          const parts = [];
          if (usage.usage.invoices) parts.push(`faktury: ${usage.usage.invoices}`);
          if (usage.usage.hours) parts.push(`godziny: ${usage.usage.hours}`);
          if (usage.usage.planning) parts.push(`planowanie: ${usage.usage.planning}`);
          window.alert(
            `Nie można trwale usunąć zarchiwizowanego kontraktu z danymi historycznymi.\n\n${parts.join("\n")}`
          );
          return;
        }
      } catch (error) {
        window.alert(
          error instanceof Error
            ? error.message
            : "Nie udało się sprawdzić użycia kontraktu przed usunięciem."
        );
        return;
      }

      if (!window.confirm(`Czy na pewno chcesz trwale usunąć kontrakt "${contract.name}"?`)) {
        return;
      }

      try {
        await deleteContractRecord(contract.id);
        if (selectedContractId === contract.id) {
          resetForm();
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

    const usageDetails = (
      await Promise.all(
        selectedContractIds.map(async (id) => ({
          id,
          contract: contractsById.get(id) || null,
          usage: await fetchContractUsage(id)
        }))
      )
    ).filter(
      ({ usage }) =>
        Number(usage?.usage?.hours || 0) > 0 ||
        Number(usage?.usage?.invoices || 0) > 0 ||
        Number(usage?.usage?.planning || 0) > 0
    );

    const archivedWithUsage = usageDetails.filter(({ id }) => archivedIds.includes(id));
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
          .map(({ contract, usage }) => {
            const details = [];
            if (usage.usage.invoices) details.push(`faktury: ${usage.usage.invoices}`);
            if (usage.usage.hours) details.push(`godziny: ${usage.usage.hours}`);
            if (usage.usage.planning) details.push(`planowanie: ${usage.usage.planning}`);
            return `- ${contract?.name || contract?.id || "Kontrakt"} (${details.join(", ")})`;
          })
          .join("\n")}`
      );
    }

    if (!window.confirm(promptParts.join("\n\n"))) {
      return;
    }

    try {
      if (activeIds.length) {
        await Promise.all(activeIds.map((id) => archiveContractRecord(id)));
      }

      if (archivedDeletableIds.length) {
        await Promise.all(archivedDeletableIds.map((id) => deleteContractRecord(id)));
      }

      setSelectedContractIds([]);
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
    setFormError(null);
    setFormStatus(null);

    if (!formValues.name.trim()) {
      setFormError("Podaj nazwę kontraktu.");
      return;
    }

    const contractValue = Number(formValues.contract_value || 0);
    if (!Number.isFinite(contractValue) || contractValue < 0) {
      setFormError("Kwota kontraktu nie może być ujemna.");
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
        selectedContractId,
        normalizeContractPayload(formValues)
      );

      await reloadContracts({
        preserveState: true,
        selectId: saved.id
      });

      setSelectedContractId(saved.id);
      setFormValues(toContractFormValues(saved));
      setFormStatus(
        selectedContractId
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
        <SectionHeader eyebrow="Kontrakty" title="Rejestr kontraktów" />
        <div className="module-page__stats">
          {Array.from({ length: 3 }).map((_, index) => (
            <StatCard key={index} label="Ładowanie" value="..." hint="Trwa pobieranie rejestru" />
          ))}
        </div>
        <Panel title="Rejestr kontraktów">
          <p className="panel__description">Trwa odczyt listy i przygotowanie modułu operacyjnego.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Kontrakty"
          title="Rejestr kontraktów"
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
  const isEditing = Boolean(selectedContractId);

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kontrakty"
        title="Rejestr kontraktów"
        actions={
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => void reloadContracts({ preserveState: true })}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
          </ActionButton>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {state.data.summary.map((item) => (
          <StatCard
            key={item.id}
            label={item.label}
            value={item.value}
            accent={item.accent}
            hint={item.hint}
          />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="toolbar-strip">
          <span className="toolbar-strip__label">Filtry rejestru</span>
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

      <div className="contracts-layout">
        <Panel title="Lista kontraktów">
          <DataTable
            columns={columns}
            rows={contractRows}
            rowKey={(row) => row.item.id}
            tableClassName="contracts-table contracts-table--registry"
            onRowClick={(row) => beginEditing(row.item)}
            getRowClassName={(row) =>
              row.item.id === selectedContractId ? "data-table__row--active" : undefined
            }
            emptyMessage={
              state.data.contracts.length === 0
                ? "Brak kontraktów w rejestrze. Dodaj pierwszy kontrakt formularzem obok."
                : "Brak kontraktów dla wybranego filtra."
            }
          />
        </Panel>

        <div className="contracts-side-stack">
          <Panel title={isEditing ? "Edycja kontraktu" : "Formularz kontraktu"}>
            <form className="contracts-form" onSubmit={handleSubmit}>
              <FormGrid columns={1}>
                <label className="field-card">
                  <span className="field-card__label">ID kontraktu</span>
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
                  <span className="field-card__label">Zamawiający / inwestor</span>
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
                  <span className="field-card__label">Kwota ryczałtowa</span>
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

              {formError ? <p className="auth-form__error">{formError}</p> : null}
              {formStatus ? <p className="auth-form__status">{formStatus}</p> : null}

              <div className="contracts-form__actions">
                <ActionButton type="button" variant="ghost" onClick={resetForm}>
                  {isEditing ? "Anuluj" : "Wyczyść"}
                </ActionButton>
                <ActionButton type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? "Zapisywanie..."
                    : isEditing
                      ? "Zapisz zmiany"
                      : "Dodaj kontrakt"}
                </ActionButton>
              </div>
            </form>
          </Panel>

          <Panel title={selectedContract ? "Szczegóły wybranego kontraktu" : "Szczegóły kontraktu"}>
            {selectedContract ? (
              <div className="contracts-detail">
                <div className="contracts-detail__meta">
                  <p><strong>ID:</strong> {selectedContract.contract_number || "-"}</p>
                  <p><strong>Nazwa:</strong> {selectedContract.name}</p>
                  <p><strong>Inwestor:</strong> {selectedContract.investor || "-"}</p>
                  <p><strong>Status:</strong> {formatStatus(selectedContract.status)}</p>
                  <p><strong>Data podpisania:</strong> {formatDate(selectedContract.signed_date)}</p>
                  <p><strong>Termin zakończenia:</strong> {formatDate(selectedContract.end_date)}</p>
                  <p><strong>Kwota:</strong> {formatMoney(selectedContract.contract_value)}</p>
                </div>

                {usageState.status === "loading" ? (
                  <p className="panel__description">Ładowanie użycia kontraktu...</p>
                ) : usageState.status === "error" ? (
                  <p className="auth-form__error">{usageState.message}</p>
                ) : usageState.status === "success" ? (
                  <div className="contracts-usage-grid">
                    <StatCard label="Faktury" value={formatInteger(usageState.data.usage.invoices)} />
                    <StatCard label="Godziny" value={formatInteger(usageState.data.usage.hours)} />
                    <StatCard label="Planowanie" value={formatInteger(usageState.data.usage.planning)} />
                  </div>
                ) : (
                  <p className="panel__description">Brak podglądu użycia.</p>
                )}
              </div>
            ) : (
              <p className="panel__description">
                Nic nie jest jeszcze wybrane. Możesz kliknąć kontrakt w tabeli albo od razu dodać nowy wpis.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
