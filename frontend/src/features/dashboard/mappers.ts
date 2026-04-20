import { formatHours, formatMoney } from "@/features/dashboard/formatters";
import type { DashboardSnapshot, DashboardViewModel } from "@/features/dashboard/types";

export function mapDashboardSnapshot(snapshot: DashboardSnapshot): DashboardViewModel {
  return {
    summary: [
      {
        id: "sales",
        label: "Sprzedaż",
        value: formatMoney(snapshot.totals.revenue_total),
        accent: true
      },
      {
        id: "total-costs",
        label: "Koszt",
        value: formatMoney(snapshot.totals.cost_total)
      },
      {
        id: "hours",
        label: "Godziny",
        value: formatHours(snapshot.totals.labor_hours_total)
      },
      {
        id: "margin",
        label: "Marża",
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
