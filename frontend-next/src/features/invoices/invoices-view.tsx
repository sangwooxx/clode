"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import {
  bulkDeleteInvoiceRecords,
  deleteInvoiceRecord,
  fetchInvoiceContracts,
  fetchInvoices,
  findInvoiceById,
  normalizeInvoicePayload,
  saveInvoiceRecord
} from "@/features/invoices/api";
import {
  formatDate,
  formatInvoiceType,
  formatMoney,
  formatPaymentStatus
} from "@/features/invoices/formatters";
import { mapInvoicesViewModel, toInvoiceFormValues } from "@/features/invoices/mappers";
import type {
  InvoiceBootstrapData,
  InvoiceFormValues,
  InvoicePaymentStatus,
  InvoiceRecord,
  InvoiceScope,
  InvoiceType,
  InvoicesListResponse
} from "@/features/invoices/types";
import { UNASSIGNED_CONTRACT_ID } from "@/features/invoices/types";
import type { ContractRecord } from "@/features/contracts/types";

type InvoicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InvoicesListResponse };

type InvoiceTableRow = {
  index: number;
  item: InvoiceRecord;
};

const emptyFormValues = toInvoiceFormValues();

function hasWriteAccess(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "ksiegowosc";
}

function buildFilters(input: {
  selectedContractId: string;
  scope: InvoiceScope;
  year: string;
  month: string;
  type: InvoiceType;
  paymentStatus: "" | InvoicePaymentStatus;
}) {
  return {
    ...(input.selectedContractId === UNASSIGNED_CONTRACT_ID
      ? { unassigned: true }
      : input.selectedContractId
        ? { contract_id: input.selectedContractId }
        : {}),
    scope: input.scope,
    type: input.type,
    ...(input.scope === "year" || input.scope === "month" ? { year: input.year } : {}),
    ...(input.scope === "month" ? { month: input.month } : {}),
    ...(input.paymentStatus ? { payment_status: input.paymentStatus } : {})
  };
}

function reconcileFilters(
  filters: { scope: InvoiceScope; year: string; month: string },
  payload: InvoicesListResponse
) {
  if (
    (filters.scope === "year" || filters.scope === "month") &&
    payload.available_years.length > 0 &&
    !payload.available_years.includes(filters.year)
  ) {
    return {
      year: payload.available_years[0],
      month:
        filters.scope === "month" && payload.available_months.length > 0
          ? payload.available_months[0]
          : filters.month
    };
  }

  if (
    filters.scope === "month" &&
    payload.available_months.length > 0 &&
    !payload.available_months.includes(filters.month)
  ) {
    return {
      year: filters.year,
      month: payload.available_months[0]
    };
  }

  return null;
}

const invoiceColumns = (
  handlers: {
    canWrite: boolean;
    allSelected: boolean;
    isSelected: (invoiceId: string) => boolean;
    onToggleAll: (checked: boolean) => void;
    onToggleSelected: (invoiceId: string, checked: boolean) => void;
    onEdit: (invoice: InvoiceRecord) => void;
    onDelete: (invoice: InvoiceRecord) => void;
  }
): Array<DataTableColumn<InvoiceTableRow>> => [
  {
    key: "select",
    header: handlers.canWrite ? (
      <input
        type="checkbox"
        checked={handlers.allSelected}
        onChange={(event) => handlers.onToggleAll(event.target.checked)}
        aria-label="Zaznacz wszystkie faktury"
      />
    ) : (
      ""
    ),
    className: "invoices-col-select",
    render: (row) =>
      handlers.canWrite ? (
        <input
          type="checkbox"
          checked={handlers.isSelected(row.item.id)}
          aria-label={`Zaznacz fakturę ${row.item.invoice_number}`}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => handlers.onToggleSelected(row.item.id, event.target.checked)}
        />
      ) : null
  },
  {
    key: "lp",
    header: "Lp.",
    className: "invoices-col-lp",
    render: (row) => row.index
  },
  {
    key: "issue_date",
    header: "Data",
    className: "invoices-col-date",
    render: (row) => formatDate(row.item.issue_date)
  },
  {
    key: "number",
    header: "Numer / kontrahent",
    className: "invoices-col-number",
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.item.invoice_number}</span>
        <span className="data-table__secondary">{row.item.counterparty_name || "-"}</span>
      </div>
    )
  },
  {
    key: "description",
    header: "Kategoria / opis",
    className: "invoices-col-description",
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.item.category_or_description || "-"}</span>
        {row.item.notes ? <span className="data-table__secondary">{row.item.notes}</span> : null}
      </div>
    )
  },
  {
    key: "net",
    header: "Netto",
    className: "data-table__numeric invoices-col-money",
    render: (row) => formatMoney(row.item.amount_net)
  },
  {
    key: "vat",
    header: "VAT",
    className: "data-table__numeric invoices-col-vat",
    render: (row) => (
      <div className="data-table__stack data-table__stack--numeric">
        <span className="data-table__primary">
          {row.item.vat_rate ? `${row.item.vat_rate.toLocaleString("pl-PL")}%` : "bez VAT"}
        </span>
        <span className="data-table__secondary">{formatMoney(row.item.amount_vat)}</span>
      </div>
    )
  },
  {
    key: "gross",
    header: "Brutto",
    className: "data-table__numeric invoices-col-money",
    render: (row) => formatMoney(row.item.amount_gross)
  },
  {
    key: "payment",
    header: "Płatność",
    className: "invoices-col-payment",
    render: (row) => (
      <div className="data-table__stack">
        <span
          className={
            row.item.payment_status === "paid"
              ? "data-table__status-pill"
              : "data-table__status-pill data-table__status-pill--muted"
          }
        >
          {formatPaymentStatus(row.item.payment_status)}
        </span>
        <span className="data-table__secondary">
          Termin: {row.item.due_date ? formatDate(row.item.due_date) : "-"}
        </span>
      </div>
    )
  },
  {
    key: "actions",
    header: "Akcje",
    className: "invoices-table__actions",
    render: (row) =>
      handlers.canWrite ? (
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
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              handlers.onDelete(row.item);
            }}
          >
            Usuń
          </ActionButton>
        </div>
      ) : (
        <span className="data-table__secondary">Podgląd</span>
      )
  }
];

export function InvoicesView({
  initialBootstrap,
  initialError
}: {
  initialBootstrap?: InvoiceBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = hasWriteAccess(user?.role);
  const [contracts, setContracts] = useState<ContractRecord[]>(initialBootstrap?.contracts ?? []);
  const [state, setState] = useState<InvoicesState>(() => {
    if (initialBootstrap?.payload) {
      return { status: "success", data: initialBootstrap.payload };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [contractSearch, setContractSearch] = useState("");
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [selectedContractId, setSelectedContractId] = useState(
    initialBootstrap?.initialContractId ?? UNASSIGNED_CONTRACT_ID
  );
  const [scope, setScope] = useState<InvoiceScope>(initialBootstrap?.payload.filters.scope ?? "all");
  const [selectedYear, setSelectedYear] = useState(
    initialBootstrap?.payload.filters.year ?? String(new Date().getFullYear())
  );
  const [selectedMonth, setSelectedMonth] = useState(
    initialBootstrap?.payload.filters.month ?? String(new Date().getMonth() + 1).padStart(2, "0")
  );
  const [activeType, setActiveType] = useState<InvoiceType>(
    initialBootstrap?.payload.filters.type ?? "cost"
  );
  const [paymentStatus, setPaymentStatus] = useState<"" | InvoicePaymentStatus>(
    (initialBootstrap?.payload.filters.payment_status as "" | InvoicePaymentStatus | undefined) ?? ""
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    initialBootstrap?.payload.items[0]?.id ?? null
  );
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<InvoiceFormValues>(() => emptyFormValues);
  const [formOpen, setFormOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const contractOptions = useMemo(() => {
    const query = contractSearch.trim().toLowerCase();
    const filtered = contracts.filter((contract) => {
      if (contract.id === selectedContractId) return true;
      if (!query) return true;
      return [contract.contract_number, contract.name, contract.investor]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });

    return [
      ...filtered,
      {
        id: UNASSIGNED_CONTRACT_ID,
        contract_number: "",
        name: "Nieprzypisane faktury",
        investor: "Pozycje bez kontraktu",
        signed_date: "",
        end_date: "",
        contract_value: 0,
        status: "active"
      }
    ];
  }, [contractSearch, contracts, selectedContractId]);

  const selectedContract = useMemo(() => {
    if (selectedContractId === UNASSIGNED_CONTRACT_ID) {
      return null;
    }

    return contracts.find((contract) => contract.id === selectedContractId) ?? null;
  }, [contracts, selectedContractId]);

  const selectedContractLabel = selectedContract
    ? selectedContract.contract_number
      ? `${selectedContract.contract_number} - ${selectedContract.name}`
      : selectedContract.name
    : "Nieprzypisane faktury";

  const filteredInvoices = useMemo(() => {
    if (state.status !== "success") return [];

    const query = invoiceSearch.trim().toLowerCase();
    if (!query) return state.data.items;

    return state.data.items.filter((invoice) =>
      [
        invoice.invoice_number,
        invoice.counterparty_name,
        invoice.category_or_description,
        invoice.notes
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [invoiceSearch, state]);

  const selectedInvoice = useMemo(() => {
    if (state.status !== "success") return null;
    return findInvoiceById(state.data.items, selectedInvoiceId);
  }, [selectedInvoiceId, state]);

  const viewModel = useMemo(() => {
    if (state.status !== "success") return null;
    return mapInvoicesViewModel(state.data);
  }, [state]);

  async function reloadInvoices(
    overrides: Partial<{
      selectedContractId: string;
      scope: InvoiceScope;
      year: string;
      month: string;
      type: InvoiceType;
      paymentStatus: "" | InvoicePaymentStatus;
    }> = {},
    options?: { preserveState?: boolean; refreshContracts?: boolean }
  ) {
    const nextSelectedContractId = overrides.selectedContractId ?? selectedContractId;
    const nextScope = overrides.scope ?? scope;
    const nextYear = overrides.year ?? selectedYear;
    const nextMonth = overrides.month ?? selectedMonth;
    const nextType = overrides.type ?? activeType;
    const nextPaymentStatus = overrides.paymentStatus ?? paymentStatus;

    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const nextContracts = options?.refreshContracts ? await fetchInvoiceContracts() : contracts;
      if (options?.refreshContracts) {
        setContracts(nextContracts);
      }

      const resolvedSelectedContractId =
        nextSelectedContractId !== UNASSIGNED_CONTRACT_ID &&
        nextSelectedContractId &&
        !nextContracts.some((contract) => contract.id === nextSelectedContractId)
          ? nextContracts[0]?.id ?? UNASSIGNED_CONTRACT_ID
          : nextSelectedContractId;

      const payload = await fetchInvoices(
        buildFilters({
          selectedContractId: resolvedSelectedContractId,
          scope: nextScope,
          year: nextYear,
          month: nextMonth,
          type: nextType,
          paymentStatus: nextPaymentStatus
        })
      );

      const reconciled = reconcileFilters(
        { scope: nextScope, year: nextYear, month: nextMonth },
        payload
      );

      if (reconciled && (reconciled.year !== nextYear || reconciled.month !== nextMonth)) {
        setSelectedYear(reconciled.year);
        setSelectedMonth(reconciled.month);
        await reloadInvoices(
          {
            selectedContractId: resolvedSelectedContractId,
            scope: nextScope,
            year: reconciled.year,
            month: reconciled.month,
            type: nextType,
            paymentStatus: nextPaymentStatus
          },
          { preserveState: true, refreshContracts: false }
        );
        return;
      }

      setSelectedContractId(resolvedSelectedContractId);
      setScope(nextScope);
      setSelectedYear(nextYear);
      setSelectedMonth(nextMonth);
      setActiveType(nextType);
      setPaymentStatus(nextPaymentStatus);
      setState({ status: "success", data: payload });
      setSelectedInvoiceIds([]);
      setSelectedInvoiceId((current) => {
        if (current && payload.items.some((invoice) => invoice.id === current)) {
          return current;
        }
        return payload.items[0]?.id ?? null;
      });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać rejestru faktur."
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    const shouldUseInitialData = Boolean(initialBootstrap?.payload) || Boolean(initialError);
    if (shouldUseInitialData) {
      return;
    }

    void reloadInvoices({}, { refreshContracts: true });
  }, [initialBootstrap, initialError]);

  function resetForm(invoice?: InvoiceRecord | null) {
    setFormValues(toInvoiceFormValues(invoice));
    setEditingInvoiceId(invoice?.id ?? null);
    setFormError(null);
    setFormStatus(null);
  }

  function openNewInvoiceForm() {
    setFormOpen(true);
    resetForm(null);
    setFormValues((current) => ({
      ...current,
      type: activeType
    }));
  }

  function openEditInvoiceForm(invoice: InvoiceRecord) {
    setFormOpen(true);
    resetForm(invoice);
    setSelectedInvoiceId(invoice.id);
  }

  function closeForm() {
    setFormOpen(false);
    resetForm(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFormStatus(null);

    if (!canWrite) {
      setFormError("Brak uprawnień do zapisu faktur.");
      return;
    }

    if (!editingInvoiceId && selectedContractId === UNASSIGNED_CONTRACT_ID) {
      setFormError("Wybierz kontrakt, aby dodać nową fakturę.");
      return;
    }

    setIsSubmitting(true);

    try {
      const savedInvoice = await saveInvoiceRecord(
        editingInvoiceId,
        normalizeInvoicePayload(formValues, selectedContract)
      );

      setFormStatus(editingInvoiceId ? "Zapisano zmiany faktury." : "Dodano nową fakturę.");
      setSelectedInvoiceId(savedInvoice.id);
      setFormOpen(Boolean(editingInvoiceId));
      await reloadInvoices({}, { preserveState: true, refreshContracts: true });
      if (!editingInvoiceId) {
        resetForm(null);
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się zapisać faktury.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(invoice: InvoiceRecord) {
    if (!canWrite) return;
    const confirmed = window.confirm(`Czy na pewno chcesz usunąć fakturę ${invoice.invoice_number}?`);
    if (!confirmed) return;

    try {
      await deleteInvoiceRecord(invoice.id);
      setSelectedInvoiceIds((current) => current.filter((id) => id !== invoice.id));
      if (selectedInvoiceId === invoice.id) {
        setSelectedInvoiceId(null);
      }
      if (editingInvoiceId === invoice.id) {
        closeForm();
      }
      await reloadInvoices({}, { preserveState: true, refreshContracts: false });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się usunąć faktury.");
    }
  }

  async function handleBulkDelete() {
    if (!canWrite || !selectedInvoiceIds.length) return;
    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć ${selectedInvoiceIds.length} zaznaczonych faktur?`
    );
    if (!confirmed) return;

    try {
      await bulkDeleteInvoiceRecords(selectedInvoiceIds);
      setSelectedInvoiceIds([]);
      await reloadInvoices({}, { preserveState: true, refreshContracts: false });
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się usunąć zaznaczonych faktur."
      );
    }
  }

  const allSelected =
    filteredInvoices.length > 0 &&
    filteredInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));

  const tableRows: InvoiceTableRow[] = filteredInvoices.map((item, index) => ({
    index: index + 1,
    item
  }));

  const columns = invoiceColumns({
    canWrite,
    allSelected,
    isSelected: (invoiceId) => selectedInvoiceIds.includes(invoiceId),
    onToggleAll: (checked) => {
      setSelectedInvoiceIds(checked ? filteredInvoices.map((invoice) => invoice.id) : []);
    },
    onToggleSelected: (invoiceId, checked) => {
      setSelectedInvoiceIds((current) =>
        checked ? Array.from(new Set([...current, invoiceId])) : current.filter((id) => id !== invoiceId)
      );
    },
    onEdit: openEditInvoiceForm,
    onDelete: handleDelete
  });

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Finanse"
        title="Rejestr faktur"
        actions={
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => reloadInvoices({}, { preserveState: true, refreshContracts: true })}
            disabled={state.status === "loading" || isRefreshing}
          >
            {isRefreshing ? "Odświeżanie..." : "Odśwież"}
          </ActionButton>
        }
      />

      <Panel className="module-toolbar module-toolbar--compact">
        <div className="invoices-toolbar">
          <SearchField
            value={contractSearch}
            onChange={(event) => setContractSearch(event.target.value)}
            placeholder="Szukaj kontraktu"
            aria-label="Szukaj kontraktu"
          />
          <select
            value={selectedContractId}
            onChange={(event) =>
              void reloadInvoices(
                { selectedContractId: event.target.value },
                { preserveState: true, refreshContracts: false }
              )
            }
            className="select-field"
          >
            {contractOptions.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.id === UNASSIGNED_CONTRACT_ID
                  ? contract.name
                  : contract.contract_number
                    ? `${contract.contract_number} - ${contract.name}`
                    : contract.name}
              </option>
            ))}
          </select>
          <div className="toolbar-tabs">
            {(["all", "year", "month"] as InvoiceScope[]).map((value) => (
              <ActionButton
                key={value}
                type="button"
                variant={scope === value ? "primary" : "secondary"}
                onClick={() => void reloadInvoices({ scope: value }, { preserveState: true })}
              >
                {value === "all" ? "Całość" : value === "year" ? "Rok" : "Miesiąc"}
              </ActionButton>
            ))}
          </div>
          <select
            value={selectedYear}
            onChange={(event) =>
              void reloadInvoices({ year: event.target.value }, { preserveState: true })
            }
            disabled={scope === "all"}
            className="select-field"
          >
            {(state.status === "success" ? state.data.available_years : []).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <select
            value={selectedMonth}
            onChange={(event) =>
              void reloadInvoices({ month: event.target.value }, { preserveState: true })
            }
            disabled={scope !== "month"}
            className="select-field"
          >
            {(state.status === "success" ? state.data.available_months : []).map((month) => (
              <option key={month} value={month}>
                {month}
              </option>
            ))}
          </select>
          <select
            value={paymentStatus}
            onChange={(event) =>
              void reloadInvoices(
                { paymentStatus: event.target.value as "" | InvoicePaymentStatus },
                { preserveState: true }
              )
            }
            className="select-field"
          >
            <option value="">Wszystkie płatności</option>
            <option value="unpaid">Nieopłacone</option>
            <option value="paid">Opłacone</option>
            <option value="overdue">Przeterminowane</option>
          </select>
        </div>
      </Panel>

      {state.status === "loading" ? (
        <Panel title="Rejestr faktur">
          <p className="status-message">Ładuję rejestr faktur...</p>
        </Panel>
      ) : state.status === "error" ? (
        <Panel title="Rejestr faktur">
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <ActionButton
              type="button"
              onClick={() => reloadInvoices({}, { refreshContracts: true })}
            >
              Spróbuj ponownie
            </ActionButton>
          </div>
        </Panel>
      ) : (
        <>
          <Panel className="invoices-analysis-panel">
            <div className="invoices-analysis-header">
              <div>
                <p className="panel__title">{selectedContractLabel}</p>
                <p className="invoices-analysis-caption">
                  {selectedContract
                    ? selectedContract.investor || "Aktywny kontrakt do analizy."
                    : "Pozycje bez przypisanego kontraktu."}
                </p>
              </div>
              <p className="invoices-analysis-scope">{viewModel?.scopeCaption}</p>
            </div>
            <div className="module-page__stats module-page__stats--compact">
              {viewModel?.analysisCards.map((card) => (
                <StatCard
                  key={card.id}
                  label={card.label}
                  value={card.value}
                  hint={card.hint}
                  accent={card.accent}
                />
              ))}
            </div>
          </Panel>

          <div className="invoices-layout">
            <div className="module-page__stack">
              <Panel>
                <div className="section-header">
                  <div>
                    <p className="section-header__eyebrow">Lista faktur</p>
                    <h2 className="panel__title">
                      {activeType === "cost" ? "Faktury kosztowe" : "Faktury sprzedażowe"}
                    </h2>
                  </div>
                  <div className="section-header__actions">
                    <div className="toolbar-tabs">
                      {(["cost", "sales"] as InvoiceType[]).map((value) => (
                        <ActionButton
                          key={value}
                          type="button"
                          variant={activeType === value ? "primary" : "secondary"}
                          onClick={() => void reloadInvoices({ type: value }, { preserveState: true })}
                        >
                          {value === "cost" ? "Kosztowe" : "Sprzedażowe"}
                        </ActionButton>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="toolbar-strip invoices-toolbar-strip">
                  <span className="toolbar-strip__label">Filtruj</span>
                  <SearchField
                    value={invoiceSearch}
                    onChange={(event) => setInvoiceSearch(event.target.value)}
                    placeholder="Szukaj po numerze, kontrahencie lub opisie"
                    aria-label="Szukaj faktur"
                  />
                  {canWrite && selectedInvoiceIds.length > 0 ? (
                    <ActionButton type="button" variant="ghost" onClick={() => void handleBulkDelete()}>
                      Usuń zaznaczone ({selectedInvoiceIds.length})
                    </ActionButton>
                  ) : (
                    <span className="toolbar-strip__meta">Zaznaczone: {selectedInvoiceIds.length}</span>
                  )}
                </div>

                <div className="module-page__stats module-page__stats--compact invoices-summary-grid">
                  {viewModel?.summaryCards.map((card) => (
                    <StatCard
                      key={card.id}
                      label={card.label}
                      value={card.value}
                      hint={card.hint}
                      accent={card.accent}
                    />
                  ))}
                </div>

                <DataTable
                  columns={columns}
                  rows={tableRows}
                  emptyMessage="Brak faktur dla wybranego zakresu."
                  rowKey={(row) => row.item.id}
                  onRowClick={(row) => setSelectedInvoiceId(row.item.id)}
                  getRowClassName={(row) =>
                    row.item.id === selectedInvoiceId ? "data-table__row--active" : undefined
                  }
                  tableClassName="invoices-table"
                />
              </Panel>
            </div>

            <div className="invoices-side-stack">
              <Panel title="Szczegóły wybranej faktury">
                {selectedInvoice ? (
                  <dl className="info-list invoices-detail-list">
                    <div className="info-list__row">
                      <dt>Numer</dt>
                      <dd>{selectedInvoice.invoice_number}</dd>
                    </div>
                    <div className="info-list__row">
                      <dt>Typ</dt>
                      <dd>{formatInvoiceType(selectedInvoice.type)}</dd>
                    </div>
                    <div className="info-list__row">
                      <dt>Kontrahent</dt>
                      <dd>{selectedInvoice.counterparty_name || "-"}</dd>
                    </div>
                    <div className="info-list__row">
                      <dt>Netto / brutto</dt>
                      <dd>
                        {formatMoney(selectedInvoice.amount_net)} / {formatMoney(selectedInvoice.amount_gross)}
                      </dd>
                    </div>
                    <div className="info-list__row">
                      <dt>Płatność</dt>
                      <dd>{formatPaymentStatus(selectedInvoice.payment_status)}</dd>
                    </div>
                    <div className="info-list__row">
                      <dt>Opis</dt>
                      <dd>{selectedInvoice.category_or_description || "-"}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="status-message">Wybierz rekord z tabeli, aby podejrzeć szczegóły.</p>
                )}
                {canWrite && selectedInvoice ? (
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => openEditInvoiceForm(selectedInvoice)}
                  >
                    Edytuj fakturę
                  </ActionButton>
                ) : null}
              </Panel>

              <Panel title={editingInvoiceId ? "Edytuj fakturę" : "Dodaj fakturę"}>
                {canWrite ? (
                  <>
                    {!editingInvoiceId && selectedContractId === UNASSIGNED_CONTRACT_ID ? (
                      <p className="status-message">
                        Wybierz konkretny kontrakt w analizie, aby dodać nową fakturę.
                      </p>
                    ) : null}
                    {!formOpen && !editingInvoiceId ? (
                      <ActionButton
                        type="button"
                        onClick={openNewInvoiceForm}
                        disabled={selectedContractId === UNASSIGNED_CONTRACT_ID}
                      >
                        Dodaj fakturę
                      </ActionButton>
                    ) : null}
                    {(formOpen || editingInvoiceId) && (
                      <form className="contracts-form" onSubmit={handleSubmit}>
                        <FormGrid columns={1}>
                          <label className="form-field">
                            <span>Typ</span>
                            <select
                              value={formValues.type}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  type: event.target.value as InvoiceType
                                }))
                              }
                            >
                              <option value="cost">Kosztowa</option>
                              <option value="sales">Sprzedażowa</option>
                            </select>
                          </label>
                          <label className="form-field">
                            <span>Data wystawienia</span>
                            <input
                              type="date"
                              value={formValues.issue_date}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  issue_date: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Numer faktury</span>
                            <input
                              value={formValues.invoice_number}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  invoice_number: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Kontrahent</span>
                            <input
                              value={formValues.counterparty_name}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  counterparty_name: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Kategoria / opis</span>
                            <input
                              value={formValues.category_or_description}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  category_or_description: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Kwota netto</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formValues.amount_net}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  amount_net: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Stawka VAT</span>
                            <select
                              value={formValues.vat_mode}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  vat_mode: event.target.value as InvoiceFormValues["vat_mode"]
                                }))
                              }
                            >
                              <option value="23">23%</option>
                              <option value="none">Bez VAT</option>
                              <option value="custom">Inna</option>
                            </select>
                          </label>
                          {formValues.vat_mode === "custom" ? (
                            <label className="form-field">
                              <span>Inna stawka VAT %</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={formValues.vat_rate_custom}
                                onChange={(event) =>
                                  setFormValues((current) => ({
                                    ...current,
                                    vat_rate_custom: event.target.value
                                  }))
                                }
                              />
                            </label>
                          ) : null}
                          <label className="form-field">
                            <span>Termin płatności</span>
                            <input
                              type="date"
                              value={formValues.due_date}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  due_date: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Data płatności</span>
                            <input
                              type="date"
                              value={formValues.payment_date}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  payment_date: event.target.value
                                }))
                              }
                            />
                          </label>
                          <label className="form-field">
                            <span>Status płatności</span>
                            <select
                              value={formValues.payment_status}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  payment_status: event.target.value as InvoicePaymentStatus
                                }))
                              }
                            >
                              <option value="unpaid">Nieopłacona</option>
                              <option value="paid">Opłacona</option>
                              <option value="overdue">Przeterminowana</option>
                            </select>
                          </label>
                          <label className="form-field">
                            <span>Uwagi</span>
                            <textarea
                              rows={4}
                              value={formValues.notes}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  notes: event.target.value
                                }))
                              }
                            />
                          </label>
                        </FormGrid>

                        {formError ? <p className="status-message status-message--error">{formError}</p> : null}
                        {formStatus ? <p className="status-message status-message--success">{formStatus}</p> : null}

                        <div className="contracts-form__actions">
                          <ActionButton type="submit" disabled={isSubmitting}>
                            {isSubmitting
                              ? "Zapisywanie..."
                              : editingInvoiceId
                                ? "Zapisz zmiany"
                                : "Dodaj fakturę"}
                          </ActionButton>
                          <ActionButton type="button" variant="secondary" onClick={closeForm}>
                            {editingInvoiceId ? "Anuluj edycję" : "Wyczyść"}
                          </ActionButton>
                        </div>
                      </form>
                    )}
                  </>
                ) : (
                  <p className="status-message">Masz dostęp tylko do podglądu rejestru faktur.</p>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
