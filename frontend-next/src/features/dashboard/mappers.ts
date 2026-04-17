import { formatHours, formatInteger, formatMoney } from "@/features/dashboard/formatters";
import type { DashboardSnapshot, DashboardViewModel } from "@/features/dashboard/types";

export function mapDashboardSnapshot(snapshot: DashboardSnapshot): DashboardViewModel {
  return {
    summary: [
      {
        id: "sales",
        label: "Faktury sprzedażowe",
        value: formatMoney(snapshot.totals.revenue_total),
        accent: true
      },
      {
        id: "invoice-costs",
        label: "Faktury kosztowe",
        value: formatMoney(snapshot.totals.invoice_cost_total)
      },
      {
        id: "labor-costs",
        label: "Koszt wynagrodzeń",
        value: formatMoney(snapshot.totals.labor_cost_total)
      },
      {
        id: "total-costs",
        label: "Łączny koszt",
        value: formatMoney(snapshot.totals.cost_total)
      },
      {
        id: "hours",
        label: "Roboczogodziny",
        value: formatHours(snapshot.totals.labor_hours_total)
      },
      {
        id: "contracts",
        label: "Liczba kontraktów",
        value: formatInteger(snapshot.contracts.length)
      },
      {
        id: "margin",
        label: "Łączna marża",
        value: formatMoney(snapshot.totals.margin)
      }
    ],
    contracts: snapshot.contracts,
    unassignedInvoices: snapshot.unassigned_invoices,
    unmatchedHours: snapshot.unmatched_hours,
    totals: snapshot.totals,
    unassigned: snapshot.unassigned
  };
}
