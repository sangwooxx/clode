"use client";

import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { AppDrawer } from "@/components/ui/app-drawer";
import { Panel } from "@/components/ui/panel";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  bulkDeleteInvoiceRecords,
  deleteInvoiceRecord,
  fetchInvoiceContracts,
  fetchInvoices,
  findInvoiceById,
  normalizeInvoicePayload,
  saveInvoiceRecord,
} from "@/features/invoices/api";
import { mapInvoicesViewModel, toInvoiceFormValues } from "@/features/invoices/mappers";
import type {
  InvoiceBootstrapData,
  InvoiceFormValues,
  InvoicePaymentStatus,
  InvoiceRecord,
  InvoiceScope,
  InvoiceType,
  InvoicesListResponse,
} from "@/features/invoices/types";
import { UNASSIGNED_CONTRACT_ID } from "@/features/invoices/types";
import type { ContractRecord } from "@/features/contracts/types";
import { InvoiceEditorPanel } from "@/features/invoices/components/invoice-editor-panel";
import { InvoiceDetailsPanel } from "@/features/invoices/components/invoice-details-panel";
import { InvoicesListPanel } from "@/features/invoices/components/invoices-list-panel";
import { InvoicesToolbar, type InvoiceContractOption } from "@/features/invoices/components/invoices-toolbar";
import { buildInvoiceColumns, type InvoiceTableRow } from "@/features/invoices/invoice-columns";
import { buildInvoiceFilters, reconcileInvoiceFilters } from "@/features/invoices/invoice-query";

type InvoicesState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: InvoicesListResponse };

const emptyFormValues = toInvoiceFormValues();

export function InvoicesView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: InvoiceBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "invoicesView");
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
    initialBootstrap?.initialContractId ?? UNASSIGNED_CONTRACT_ID,
  );
  const [scope, setScope] = useState<InvoiceScope>(initialBootstrap?.payload.filters.scope ?? "all");
  const [selectedYear, setSelectedYear] = useState(
    initialBootstrap?.payload.filters.year ?? String(new Date().getFullYear()),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    initialBootstrap?.payload.filters.month ?? String(new Date().getMonth() + 1).padStart(2, "0"),
  );
  const [activeType, setActiveType] = useState<InvoiceType>(initialBootstrap?.payload.filters.type ?? "cost");
  const [paymentStatus, setPaymentStatus] = useState<"" | InvoicePaymentStatus>(
    (initialBootstrap?.payload.filters.payment_status as "" | InvoicePaymentStatus | undefined) ?? "",
  );
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(initialBootstrap?.payload.items[0]?.id ?? null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [formValues, setFormValues] = useState<InvoiceFormValues>(() => emptyFormValues);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const contractOptions = useMemo<InvoiceContractOption[]>(() => {
    const query = contractSearch.trim().toLowerCase();
    const filtered = contracts.filter((contract) => {
      if (contract.id === selectedContractId) return true;
      if (!query) return true;
      return [contract.contract_number, contract.name, contract.investor].join(" ").toLowerCase().includes(query);
    });

    return [
      ...filtered,
      {
        id: UNASSIGNED_CONTRACT_ID,
        contract_number: "",
        name: "Nieprzypisane faktury",
        investor: "Pozycje bez kontraktu",
      },
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

  const yearOptions = useMemo(() => {
    return state.status === "success" ? state.data.available_years : [];
  }, [state]);

  const monthOptions = useMemo(() => {
    return state.status === "success" ? state.data.available_months : [];
  }, [state]);

  const filteredInvoices = useMemo(() => {
    if (state.status !== "success") return [];

    const query = invoiceSearch.trim().toLowerCase();
    if (!query) return state.data.items;

    return state.data.items.filter((invoice) =>
      [invoice.invoice_number, invoice.counterparty_name, invoice.category_or_description, invoice.notes]
        .join(" ")
        .toLowerCase()
        .includes(query),
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
    options?: { preserveState?: boolean; refreshContracts?: boolean },
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
        buildInvoiceFilters({
          selectedContractId: resolvedSelectedContractId,
          scope: nextScope,
          year: nextYear,
          month: nextMonth,
          type: nextType,
          paymentStatus: nextPaymentStatus,
        }),
      );

      const reconciled = reconcileInvoiceFilters({ scope: nextScope, year: nextYear, month: nextMonth }, payload);

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
            paymentStatus: nextPaymentStatus,
          },
          { preserveState: true, refreshContracts: false },
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
        message: error instanceof Error ? error.message : "Nie udało się pobrać rejestru faktur.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  const loadInitialInvoices = useEffectEvent(() => {
    void reloadInvoices({}, { refreshContracts: true });
  });

  useEffect(() => {
    const shouldUseInitialData = Boolean(initialBootstrap?.payload) || Boolean(initialError);
    if (shouldUseInitialData) {
      return;
    }

    loadInitialInvoices();
  }, [initialBootstrap, initialError]);

  function resetForm(invoice?: InvoiceRecord | null) {
    setFormValues(toInvoiceFormValues(invoice));
    setEditingInvoiceId(invoice?.id ?? null);
    setFormError(null);
    setFormStatus(null);
  }

  function openNewInvoiceForm() {
    setIsEditorOpen(true);
    resetForm(null);
    setFormValues((current) => ({
      ...current,
      type: activeType,
    }));
  }

  function openEditInvoiceForm(invoice: InvoiceRecord) {
    setIsEditorOpen(true);
    resetForm(invoice);
    setSelectedInvoiceId(invoice.id);
  }

  function closeForm() {
    setIsEditorOpen(false);
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
        normalizeInvoicePayload(formValues, selectedContract),
      );

      setFormStatus(editingInvoiceId ? "Zapisano zmiany faktury." : "Dodano nową fakturę.");
      setSelectedInvoiceId(savedInvoice.id);
      setIsEditorOpen(false);
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
    const confirmed = window.confirm(`Czy na pewno chcesz usunąć ${selectedInvoiceIds.length} zaznaczonych faktur?`);
    if (!confirmed) return;

    try {
      await bulkDeleteInvoiceRecords(selectedInvoiceIds);
      setSelectedInvoiceIds([]);
      await reloadInvoices({}, { preserveState: true, refreshContracts: false });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się usunąć zaznaczonych faktur.");
    }
  }

  const allSelected =
    filteredInvoices.length > 0 &&
    filteredInvoices.every((invoice) => selectedInvoiceIds.includes(invoice.id));

  const tableRows: InvoiceTableRow[] = filteredInvoices.map((item, index) => ({
    index: index + 1,
    item,
  }));

  const columns = buildInvoiceColumns({
    canWrite,
    allSelected,
    isSelected: (invoiceId) => selectedInvoiceIds.includes(invoiceId),
    onToggleAll: (checked) => {
      setSelectedInvoiceIds(checked ? filteredInvoices.map((invoice) => invoice.id) : []);
    },
    onToggleSelected: (invoiceId, checked) => {
      setSelectedInvoiceIds((current) =>
        checked ? Array.from(new Set([...current, invoiceId])) : current.filter((id) => id !== invoiceId),
      );
    },
    onEdit: openEditInvoiceForm,
    onDelete: handleDelete,
  });

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Finanse"
        title="Rejestr faktur"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              {canWrite ? (
                <ActionButton type="button" onClick={openNewInvoiceForm} disabled={selectedContractId === UNASSIGNED_CONTRACT_ID}>
                  Dodaj fakturę
                </ActionButton>
              ) : null}
            </div>
            <div className="module-actions__secondary">
              {canWrite && selectedInvoice ? (
                <ActionButton type="button" variant="secondary" onClick={() => openEditInvoiceForm(selectedInvoice)}>
                  Edytuj fakturę
                </ActionButton>
              ) : null}
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => reloadInvoices({}, { preserveState: true, refreshContracts: true })}
                disabled={state.status === "loading" || isRefreshing}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <InvoicesToolbar
        contractSearch={contractSearch}
        onContractSearchChange={setContractSearch}
        contractOptions={contractOptions}
        selectedContractId={selectedContractId}
        onSelectedContractIdChange={(value) =>
          void reloadInvoices({ selectedContractId: value }, { preserveState: true, refreshContracts: false })
        }
        scope={scope}
        onScopeChange={(value) => void reloadInvoices({ scope: value }, { preserveState: true })}
        yearOptions={yearOptions}
        selectedYear={selectedYear}
        onSelectedYearChange={(value) => void reloadInvoices({ year: value }, { preserveState: true })}
        monthOptions={monthOptions}
        selectedMonth={selectedMonth}
        onSelectedMonthChange={(value) => void reloadInvoices({ month: value }, { preserveState: true })}
        paymentStatus={paymentStatus}
        onPaymentStatusChange={(value) => void reloadInvoices({ paymentStatus: value }, { preserveState: true })}
      />

      {state.status === "loading" ? (
        <Panel title="Rejestr faktur">
          <p className="status-message">Ładuję rejestr faktur...</p>
        </Panel>
      ) : state.status === "error" ? (
        <Panel title="Rejestr faktur">
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <ActionButton type="button" onClick={() => reloadInvoices({}, { refreshContracts: true })}>
              Spróbuj ponownie
            </ActionButton>
          </div>
        </Panel>
      ) : (
        <>
          <div className="summary-strip invoices-context-strip">
            <div className="summary-strip__primary">
              <span className="summary-strip__label">Kontrakt</span>
              <strong className="summary-strip__value">{selectedContractLabel}</strong>
              <span className="summary-strip__meta">
                {selectedContract?.investor || "Pozycje bez przypisanego kontraktu"}
              </span>
            </div>
            <span className="summary-strip__side">{viewModel?.scopeCaption}</span>
          </div>

          {viewModel ? (
            <div className="module-page__stats module-page__stats--compact">
              {viewModel.summaryCards.map((card) => (
                <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
              ))}
            </div>
          ) : null}

          <div className="invoices-layout">
            <div className="module-page__stack">
              <InvoicesListPanel
                activeType={activeType}
                canWrite={canWrite}
                invoiceSearch={invoiceSearch}
                onInvoiceSearchChange={setInvoiceSearch}
                onActiveTypeChange={(value) => void reloadInvoices({ type: value }, { preserveState: true })}
                selectedInvoiceIds={selectedInvoiceIds}
                onBulkDelete={() => void handleBulkDelete()}
                columns={columns}
                rows={tableRows}
                selectedInvoiceId={selectedInvoiceId}
                onRowClick={(row) => setSelectedInvoiceId(row.item.id)}
              />

              <InvoiceDetailsPanel
                selectedInvoice={selectedInvoice}
                canWrite={canWrite}
                onEdit={openEditInvoiceForm}
              />
            </div>
          </div>
        </>
      )}

      {isEditorOpen ? (
        <AppDrawer
          eyebrow="Rejestr faktur"
          title={editingInvoiceId ? "Edytuj fakturę" : "Dodaj fakturę"}
          onClose={closeForm}
        >
          <InvoiceEditorPanel
            canWrite={canWrite}
            editingInvoiceId={editingInvoiceId}
            formOpen
            selectedContractId={selectedContractId}
            formValues={formValues}
            setFormValues={setFormValues}
            isSubmitting={isSubmitting}
            formError={formError}
            formStatus={formStatus}
            onSubmit={handleSubmit}
            onClose={closeForm}
            onOpenNew={openNewInvoiceForm}
            embedded
          />
        </AppDrawer>
      ) : null}
    </div>
  );
}
