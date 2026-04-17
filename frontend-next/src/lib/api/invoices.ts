import { http } from "@/lib/api/http";

export type InvoiceType = "cost" | "sales";
export type InvoiceScope = "all" | "year" | "month";
export type InvoicePaymentStatus = "unpaid" | "paid" | "overdue";

export type InvoiceQuery = {
  contract_id?: string;
  unassigned?: boolean | "1";
  scope?: InvoiceScope;
  year?: string | number;
  month?: string | number;
  type?: InvoiceType;
  payment_status?: InvoicePaymentStatus | "";
};

export type InvoicePayload = {
  contract_id?: string;
  contract_name?: string;
  type: InvoiceType;
  issue_date: string;
  invoice_number: string;
  counterparty_name?: string;
  category_or_description?: string;
  cost_category?: string;
  amount_net: number;
  vat_rate?: number;
  amount_vat?: number;
  amount_gross?: number;
  due_date?: string;
  payment_date?: string;
  payment_status?: InvoicePaymentStatus;
  notes?: string;
};

function toQueryString(query: InvoiceQuery = {}) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    if (typeof value === "boolean") {
      if (value) {
        params.set(key, "1");
      }
      return;
    }

    params.set(key, String(value));
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function listInvoices(query: InvoiceQuery = {}) {
  return http(`/invoices${toQueryString(query)}`, { method: "GET" });
}

export function getInvoice(invoiceId: string) {
  return http(`/invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
}

export function createInvoice(payload: InvoicePayload) {
  return http("/invoices", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateInvoice(invoiceId: string, payload: InvoicePayload) {
  return http(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteInvoice(invoiceId: string) {
  return http(`/invoices/${encodeURIComponent(invoiceId)}`, {
    method: "DELETE"
  });
}

export function bulkDeleteInvoices(ids: string[]) {
  return http("/invoices/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids })
  });
}
