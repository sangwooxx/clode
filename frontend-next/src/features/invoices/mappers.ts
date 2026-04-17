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
    analysisCards: [
      {
        id: "cost-count",
        label: "Faktury kosztowe",
        value: formatInteger(payload.stats.cost_count)
      },
      {
        id: "cost-net",
        label: "Koszty netto",
        value: formatMoney(payload.stats.cost_net)
      },
      {
        id: "sales-count",
        label: "Faktury sprzedażowe",
        value: formatInteger(payload.stats.sales_count)
      },
      {
        id: "sales-net",
        label: "Sprzedaż netto",
        value: formatMoney(payload.stats.sales_net),
        accent: true
      },
      {
        id: "saldo-net",
        label: "Saldo netto",
        value: formatMoney(payload.stats.saldo_net)
      }
    ],
    summaryCards: [
      {
        id: "count",
        label: "Pozycji w tabeli",
        value: formatInteger(payload.summary.count)
      },
      {
        id: "net",
        label: "Suma netto",
        value: formatMoney(payload.summary.amount_net)
      },
      {
        id: "vat",
        label: "Suma VAT",
        value: formatMoney(payload.summary.amount_vat)
      },
      {
        id: "gross",
        label: "Suma brutto",
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
    return `Zakres analizy: rok ${year}.`;
  }

  if (scope === "month") {
    return `Zakres analizy: ${formatMonthLabel(year, month)}.`;
  }

  return "Zakres analizy: cały okres kontraktu.";
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
