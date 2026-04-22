import {
  formatDate,
  formatDateTime,
  formatHealthLevel,
  formatHours,
  formatInteger,
  formatMoney,
  formatMonthLabel,
  formatPercent,
  formatPlanVarianceLabel,
  formatStaleness,
  formatStatus,
  formatVarianceMoney,
  formatVariancePercent
} from "@/features/contracts/formatters";
import type {
  ContractCenterViewModel,
  ContractControlFormValues,
  ContractFormValues,
  ContractRecord,
  ContractSnapshot,
  ContractsViewModel
} from "@/features/contracts/types";

function buildVariancePresentation(
  kind: "revenue" | "cost" | "margin",
  value: number | null | undefined
) {
  const numeric = Number(value ?? 0);
  if (value == null || Number.isNaN(value)) {
    return { tone: "missing" as const, hint: "Brak planu" };
  }
  if (Math.abs(numeric) < 0.005) {
    return { tone: "neutral" as const, hint: "Zgodnie z planem" };
  }
  if (kind === "revenue") {
    return numeric > 0
      ? { tone: "positive" as const, hint: "Sprzedaż powyżej planu" }
      : { tone: "negative" as const, hint: "Sprzedaż poniżej planu" };
  }
  if (kind === "cost") {
    return numeric > 0
      ? { tone: "negative" as const, hint: "Koszt powyżej planu" }
      : { tone: "positive" as const, hint: "Koszt poniżej planu" };
  }
  return numeric > 0
    ? { tone: "positive" as const, hint: "Wynik lepszy od planu" }
    : { tone: "negative" as const, hint: "Wynik poniżej planu" };
}

export function mapContractsViewModel(contracts: ContractRecord[]): ContractsViewModel {
  const activeContracts = contracts.filter((contract) => contract.status !== "archived");
  const archivedContracts = contracts.filter((contract) => contract.status === "archived");
  const totalValue = activeContracts.reduce(
    (sum, contract) => sum + Number(contract.contract_value || 0),
    0
  );

  return {
    contracts,
    summary: [
      {
        id: "active",
        label: "Aktywne kontrakty",
        value: formatInteger(activeContracts.length),
        accent: true
      },
      {
        id: "archived",
        label: "Zarchiwizowane",
        value: formatInteger(archivedContracts.length)
      },
      {
        id: "total-value",
        label: "Łączna wartość aktywnych",
        value: formatMoney(totalValue)
      }
    ]
  };
}

export function toContractFormValues(contract?: ContractRecord | null): ContractFormValues {
  return {
    contract_number: contract?.contract_number ?? "",
    name: contract?.name ?? "",
    investor: contract?.investor ?? "",
    signed_date: contract?.signed_date ?? "",
    end_date: contract?.end_date ?? "",
    contract_value: contract ? String(contract.contract_value ?? "") : "",
    status: contract?.status ?? "active"
  };
}

export function toContractControlFormValues(snapshot?: ContractSnapshot | null): ContractControlFormValues {
  const control = snapshot?.control;
  return {
    planned_revenue_total:
      control?.planned_revenue_total != null ? String(control.planned_revenue_total) : "",
    planned_invoice_cost_total:
      control?.planned_invoice_cost_total != null ? String(control.planned_invoice_cost_total) : "",
    planned_labor_cost_total:
      control?.planned_labor_cost_total != null ? String(control.planned_labor_cost_total) : "",
    forecast_revenue_total:
      control?.forecast_revenue_total != null ? String(control.forecast_revenue_total) : "",
    forecast_invoice_cost_total:
      control?.forecast_invoice_cost_total != null ? String(control.forecast_invoice_cost_total) : "",
    forecast_labor_cost_total:
      control?.forecast_labor_cost_total != null ? String(control.forecast_labor_cost_total) : "",
    note: control?.note ?? ""
  };
}

export function resolveNextSelectedContractId(
  contracts: ContractRecord[],
  currentContractId: string | null,
  preferredContractId?: string | null
) {
  if (preferredContractId && contracts.some((contract) => contract.id === preferredContractId)) {
    return preferredContractId;
  }

  if (currentContractId && contracts.some((contract) => contract.id === currentContractId)) {
    return currentContractId;
  }

  const activeContract = contracts.find((contract) => contract.status !== "archived");
  return activeContract?.id ?? contracts[0]?.id ?? null;
}

export function mapContractCenterViewModel(snapshot: ContractSnapshot): ContractCenterViewModel {
  const { activity, contract, control, forecast, freshness, health, plan, actual, variance } = snapshot;
  const forecastRevenueSourceLabel =
    forecast.revenue_source === "manual"
      ? "ręcznie utrzymywanym przychodzie"
      : forecast.revenue_source === "planned_revenue"
        ? "planowanym przychodzie kontrolnym"
        : forecast.revenue_source === "contract_value"
          ? "wartości kontraktu"
          : "dostępnych danych";

  const revenueVarianceValue =
    plan.is_configured && plan.revenue_total != null
      ? actual.revenue_total - plan.revenue_total
      : null;
  const invoiceCostVarianceValue =
    plan.is_configured && plan.invoice_cost_total != null
      ? actual.invoice_cost_total - plan.invoice_cost_total
      : null;
  const laborCostVarianceValue =
    plan.is_configured && plan.labor_cost_total != null
      ? actual.labor_cost_total - plan.labor_cost_total
      : null;

  const revenueVariance = buildVariancePresentation("revenue", revenueVarianceValue);
  const invoiceCostVariance = buildVariancePresentation("cost", invoiceCostVarianceValue);
  const laborCostVariance = buildVariancePresentation("cost", laborCostVarianceValue);
  const totalCostVariance = buildVariancePresentation("cost", variance.cost_total);
  const marginVariance = buildVariancePresentation("margin", variance.margin);
  const marginPercentVariance = buildVariancePresentation("margin", variance.margin_percent);

  return {
    contractName: contract.name,
    contractNumber: contract.contract_number || "-",
    contractStatus: formatStatus(contract.status),
    investor: contract.investor || "-",
    healthLevel: health.level,
    healthLabel: formatHealthLevel(health.level),
    healthSummary: health.summary,
    headerDetails: [
      { id: "contract_number", label: "Numer kontraktu", value: contract.contract_number || "-" },
      { id: "investor", label: "Inwestor", value: contract.investor || "-" },
      { id: "status", label: "Status", value: formatStatus(contract.status) },
      { id: "signed_date", label: "Data podpisania", value: formatDate(contract.signed_date) },
      { id: "end_date", label: "Termin zakończenia", value: formatDate(contract.end_date) },
      { id: "contract_value", label: "Wartość kontraktu", value: formatMoney(contract.contract_value) }
    ],
    heroKpiItems: [
      {
        id: "contract_value",
        label: "Wartość kontraktu",
        value: formatMoney(contract.contract_value),
        accent: true
      },
      {
        id: "sales",
        label: "Sprzedaż",
        value: formatMoney(actual.revenue_total)
      },
      {
        id: "total_cost",
        label: "Łączny koszt",
        value: formatMoney(actual.total_cost)
      },
      {
        id: "margin",
        label: "Marża",
        value: formatMoney(actual.margin)
      },
      {
        id: "margin_percent",
        label: "Marża %",
        value: formatPercent(actual.margin_percent)
      }
    ],
    freshnessItems: [
      {
        id: "last_financial",
        label: "Ostatnia aktywność finansowa",
        value: formatDate(freshness.last_financial_activity_at),
        hint: formatStaleness(freshness.days_since_financial_activity)
      },
      {
        id: "last_operational",
        label: "Ostatnia aktywność operacyjna",
        value: formatDate(freshness.last_operational_activity_at),
        hint: formatStaleness(freshness.days_since_operational_activity)
      },
      {
        id: "last_invoice",
        label: "Ostatnia faktura",
        value: formatDate(freshness.last_invoice_date)
      },
      {
        id: "last_time_entry",
        label: "Ostatni miesiąc czasu pracy",
        value: formatMonthLabel(freshness.last_time_entry_month)
      },
      {
        id: "control_updated_at",
        label: "Aktualizacja kontroli",
        value: control.updated_at ? formatDateTime(control.updated_at) : "Brak aktualizacji",
        hint: control.updated_by ? `Ostatnio aktualizował: ${control.updated_by}` : undefined
      }
    ],
    planComparisonRows: [
      {
        id: "revenue",
        label: "Sprzedaż",
        planValue: plan.is_configured ? formatMoney(plan.revenue_total) : "brak planu",
        actualValue: formatMoney(actual.revenue_total),
        varianceValue:
          plan.is_configured && plan.revenue_total != null
            ? formatVarianceMoney(revenueVarianceValue)
            : "brak planu",
        varianceTone: revenueVariance.tone,
        varianceHint: revenueVariance.hint
      },
      {
        id: "invoice_cost",
        label: "Koszt fakturowy",
        planValue: plan.is_configured ? formatMoney(plan.invoice_cost_total) : "brak planu",
        actualValue: formatMoney(actual.invoice_cost_total),
        varianceValue:
          plan.is_configured && plan.invoice_cost_total != null
            ? formatVarianceMoney(invoiceCostVarianceValue)
            : "brak planu",
        varianceTone: invoiceCostVariance.tone,
        varianceHint: invoiceCostVariance.hint
      },
      {
        id: "labor_cost",
        label: "Koszt pracy",
        planValue: plan.is_configured ? formatMoney(plan.labor_cost_total) : "brak planu",
        actualValue: formatMoney(actual.labor_cost_total),
        varianceValue:
          plan.is_configured && plan.labor_cost_total != null
            ? formatVarianceMoney(laborCostVarianceValue)
            : "brak planu",
        varianceTone: laborCostVariance.tone,
        varianceHint: laborCostVariance.hint
      },
      {
        id: "total_cost",
        label: "Łączny koszt",
        planValue: plan.is_configured ? formatMoney(plan.total_cost) : "brak planu",
        actualValue: formatMoney(actual.total_cost),
        varianceValue: formatVarianceMoney(variance.cost_total),
        varianceTone: totalCostVariance.tone,
        varianceHint: totalCostVariance.hint
      },
      {
        id: "margin",
        label: "Marża",
        planValue: plan.is_configured ? formatMoney(plan.margin) : "brak planu",
        actualValue: formatMoney(actual.margin),
        varianceValue: formatVarianceMoney(variance.margin),
        varianceTone: marginVariance.tone,
        varianceHint: marginVariance.hint
      },
      {
        id: "margin_percent",
        label: "Marża %",
        planValue: plan.is_configured ? formatPercent(plan.margin_percent) : "brak planu",
        actualValue: formatPercent(actual.margin_percent),
        varianceValue: formatVariancePercent(variance.margin_percent),
        varianceTone: marginPercentVariance.tone,
        varianceHint: marginPercentVariance.hint
      }
    ],
    planStatusLabel: formatPlanVarianceLabel(variance.status),
    forecastItems: [
      {
        id: "forecast_revenue",
        label: "Forecast sprzedaży",
        value: forecast.is_configured ? formatMoney(forecast.revenue_total) : "brak forecastu"
      },
      {
        id: "forecast_invoice_cost",
        label: "Forecast kosztu fakturowego",
        value: forecast.is_configured ? formatMoney(forecast.invoice_cost_total) : "brak forecastu"
      },
      {
        id: "forecast_labor_cost",
        label: "Forecast kosztu pracy",
        value: forecast.is_configured ? formatMoney(forecast.labor_cost_total) : "brak forecastu"
      },
      {
        id: "forecast_total_cost",
        label: "Forecast łącznego kosztu",
        value: forecast.is_configured ? formatMoney(forecast.total_cost) : "brak forecastu"
      },
      {
        id: "forecast_margin",
        label: "Forecast marży",
        value: forecast.is_configured ? formatMoney(forecast.margin) : "brak forecastu"
      },
      {
        id: "forecast_margin_percent",
        label: "Forecast marży %",
        value: forecast.is_configured
          ? formatPercent(forecast.margin_percent)
          : "brak forecastu"
      }
    ],
    forecastSummary: forecast.is_configured
      ? `Forecast końcowy opiera się na ręcznie utrzymywanych wartościach kontroli kontraktu. Przychód bazuje na ${forecastRevenueSourceLabel}.`
      : "Kontrakt nie ma jeszcze kompletnego forecastu końcowego. Uzupełnij ręczne wartości w panelu Plan i forecast.",
    controlNote: control.note ? control.note : null,
    controlUpdatedAtLabel: control.updated_at ? formatDateTime(control.updated_at) : null,
    controlUpdatedByLabel: control.updated_by ? control.updated_by : null,
    alerts: snapshot.alerts.map((alert) => ({
      id: alert.code,
      level: alert.level,
      title: alert.title,
      description: alert.description,
      context: alert.context ?? null
    })),
    activityItems: [
      { id: "invoice_count", label: "Faktury", value: formatInteger(activity.invoice_count) },
      {
        id: "time_entry_count",
        label: "Wpisy czasu",
        value: formatInteger(activity.time_entry_count)
      },
      {
        id: "planning_assignment_count",
        label: "Przypisania planistyczne",
        value: formatInteger(activity.planning_assignment_count)
      },
      {
        id: "labor_hours_total",
        label: "Godziny",
        value: formatHours(actual.labor_hours_total)
      }
    ],
    operationalStatus: activity.has_data
      ? "Kontrakt ma dane finansowe lub operacyjne."
      : "Kontrakt nie ma jeszcze danych finansowych ani operacyjnych.",
    emptyMessage: !activity.has_data
      ? "Kontrakt nie ma jeszcze danych finansowych ani operacyjnych."
      : snapshot.monthly_breakdown.length === 0
        ? "Kontrakt nie ma jeszcze przebiegu miesięcznego do pokazania."
        : null,
    monthlyRows: snapshot.monthly_breakdown.map((row) => ({
      id: row.month_key,
      month_key: row.month_key,
      month_label: formatMonthLabel(row.month_label || row.month_key),
      revenue_total: formatMoney(row.revenue_total),
      invoice_cost_total: formatMoney(row.invoice_cost_total),
      labor_cost_total: formatMoney(row.labor_cost_total),
      cost_total: formatMoney(row.cost_total),
      margin: formatMoney(row.margin),
      labor_hours_total: formatHours(row.labor_hours_total),
      invoice_count: formatInteger(row.invoice_count)
    }))
  };
}
