import { listContracts } from "@/lib/api/contracts";
import {
  bulkDeleteInvoices,
  createInvoice,
  deleteInvoice,
  listInvoices,
  updateInvoice,
  type InvoicePayload,
  type InvoiceQuery
} from "@/lib/api/invoices";
import type { ContractRecord } from "@/features/contracts/types";
import type {
  InvoiceFormValues,
  InvoiceRecord,
  InvoiceResponse,
  InvoicesListResponse
} from "@/features/invoices/types";

export async function fetchInvoiceContracts() {
  const response = (await listContracts(false)) as { contracts?: ContractRecord[] };
  return Array.isArray(response.contracts) ? response.contracts : [];
}

export async function fetchInvoices(filters: InvoiceQuery = {}) {
  return (await listInvoices(filters)) as InvoicesListResponse;
}

export async function saveInvoiceRecord(invoiceId: string | null, payload: InvoicePayload) {
  const response = (invoiceId
    ? await updateInvoice(invoiceId, payload)
    : await createInvoice(payload)) as InvoiceResponse;
  return response.invoice;
}

export async function deleteInvoiceRecord(invoiceId: string) {
  return deleteInvoice(invoiceId);
}

export async function bulkDeleteInvoiceRecords(invoiceIds: string[]) {
  return bulkDeleteInvoices(invoiceIds);
}

export function findInvoiceById(items: InvoiceRecord[], invoiceId: string | null) {
  if (!invoiceId) return null;
  return items.find((invoice) => invoice.id === invoiceId) ?? null;
}

function readVatRate(formValues: InvoiceFormValues) {
  if (formValues.vat_mode === "none") {
    return 0;
  }

  if (formValues.vat_mode === "23") {
    return 23;
  }

  const numeric = Number(formValues.vat_rate_custom || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function normalizeInvoicePayload(
  formValues: InvoiceFormValues,
  contract: { id: string; name: string } | null
): InvoicePayload {
  const amountNet = Number(formValues.amount_net || 0);
  const vatRate = readVatRate(formValues);
  const amountVat = Number(((amountNet * vatRate) / 100).toFixed(2));
  const amountGross = Number((amountNet + amountVat).toFixed(2));
  const paymentStatus = formValues.payment_date
    ? "paid"
    : formValues.payment_status || "unpaid";

  return {
    contract_id: contract?.id || "",
    contract_name: contract?.name || "",
    type: formValues.type,
    issue_date: formValues.issue_date,
    invoice_number: formValues.invoice_number.trim(),
    counterparty_name: formValues.counterparty_name.trim(),
    category_or_description: formValues.category_or_description.trim(),
    notes: formValues.notes.trim(),
    amount_net: amountNet,
    vat_rate: vatRate,
    amount_vat: amountVat,
    amount_gross: amountGross,
    due_date: formValues.due_date,
    payment_date: formValues.payment_date,
    payment_status: paymentStatus
  };
}
