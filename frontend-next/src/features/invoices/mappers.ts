import { formatInteger, formatMonthLabel, formatMoney } from "@/features/invoices/formatters";
import type {
  InvoiceFormValues,
  InvoiceRecord,
  InvoiceScope,
  InvoicesListResponse,
  InvoicesViewModel
} from "@/features/invoices/types";

export function mapInvoicesViewModel(payload: InvoicesListResponse): InvoicesViewModel {
  return {
    summaryCards: [
      {
        id: "count",
        label: "Pozycje",
        value: formatInteger(payload.summary.count)
      },
      {
        id: "net",
        label: "Netto",
        value: formatMoney(payload.summary.amount_net)
      },
      {
        id: "vat",
        label: "VAT",
        value: formatMoney(payload.summary.amount_vat)
      },
      {
        id: "gross",
        label: "Brutto",
        value: formatMoney(payload.summary.amount_gross)
      }
    ],
    scopeCaption: buildScopeCaption(
      payload.filters.scope,
      payload.filters.year || "",
      payload.filters.month || ""
    )
  };
}

export function buildScopeCaption(scope: InvoiceScope, year: string, month: string) {
  if (scope === "year") {
    return `Rok ${year}`;
  }

  if (scope === "month") {
    return formatMonthLabel(year, month);
  }

  return "Caly okres";
}

export function toInvoiceFormValues(invoice?: InvoiceRecord | null): InvoiceFormValues {
  const vatRate = Number(invoice?.vat_rate ?? 23);

  let vatMode: InvoiceFormValues["vat_mode"] = "custom";
  if (!vatRate) {
    vatMode = "none";
  } else if (vatRate === 23) {
    vatMode = "23";
  }

  return {
    type: invoice?.type ?? "cost",
    issue_date: invoice?.issue_date ?? "",
    invoice_number: invoice?.invoice_number ?? "",
    counterparty_name: invoice?.counterparty_name ?? "",
    category_or_description: invoice?.category_or_description ?? "",
    notes: invoice?.notes ?? "",
    amount_net: invoice ? String(invoice.amount_net ?? "") : "",
    vat_mode: vatMode,
    vat_rate_custom: vatMode === "custom" ? String(vatRate || "") : "",
    amount_vat: invoice ? String(invoice.amount_vat ?? "") : "0",
    amount_gross: invoice ? String(invoice.amount_gross ?? "") : "0",
    due_date: invoice?.due_date ?? "",
    payment_date: invoice?.payment_date ?? "",
    payment_status: invoice?.payment_status ?? "unpaid"
  };
}
