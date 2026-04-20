import type {
  InvoicePaymentStatus,
  InvoiceScope,
  InvoiceType,
  InvoicesListResponse
} from "@/features/invoices/types";
import { UNASSIGNED_CONTRACT_ID } from "@/features/invoices/types";

export type InvoiceReloadFilters = {
  selectedContractId: string;
  scope: InvoiceScope;
  year: string;
  month: string;
  type: InvoiceType;
  paymentStatus: "" | InvoicePaymentStatus;
};

export function buildInvoiceFilters(input: InvoiceReloadFilters) {
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

export function reconcileInvoiceFilters(
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
