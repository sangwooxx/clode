import { describe, expect, it } from "vitest";

import {
  copyPlanToForecastValues,
  mapContractCenterViewModel,
  resolveNextSelectedContractId,
  toContractControlFormValues,
  useActualCostsAsStartingPoint,
  useContractValueAsPlannedRevenue
} from "@/features/contracts/mappers";
import type { ContractRecord, ContractSnapshot } from "@/features/contracts/types";

function createContract(overrides: Partial<ContractRecord> = {}): ContractRecord {
  return {
    id: "c-1",
    contract_number: "K/2026/001",
    name: "Budowa hali",
    investor: "Inwestor A",
    signed_date: "2026-01-10",
    end_date: "2026-11-30",
    contract_value: 100000,
    status: "active",
    ...overrides
  };
}

function createSnapshot(overrides: Partial<ContractSnapshot> = {}): ContractSnapshot {
  return {
    contract: createContract(),
    metrics: {
      contract_id: "c-1",
      revenue_total: 40000,
      invoice_cost_total: 12000,
      labor_cost_total: 8000,
      labor_hours_total: 160,
      cost_total: 20000,
      cost_by_category: { materials: 12000, labor: 8000, other: 0 },
      invoice_count: 2,
      cost_invoice_count: 1,
      sales_invoice_count: 1,
      margin: 20000,
      margin_percent: 50
    },
    activity: {
      invoice_count: 2,
      time_entry_count: 3,
      planning_assignment_count: 2,
      has_financial_data: true,
      has_operational_data: true,
      has_data: true
    },
    monthly_breakdown: [
      {
        month_key: "2026-04",
        month_label: "2026-04",
        revenue_total: 40000,
        invoice_cost_total: 12000,
        labor_cost_total: 8000,
        labor_hours_total: 160,
        cost_total: 20000,
        margin: 20000,
        invoice_count: 2,
        cost_invoice_count: 1,
        sales_invoice_count: 1
      }
    ],
    control: {
      contract_id: "c-1",
      planned_revenue_total: 100000,
      planned_invoice_cost_total: 30000,
      planned_labor_cost_total: 25000,
      forecast_revenue_total: 100000,
      forecast_invoice_cost_total: 34000,
      forecast_labor_cost_total: 27000,
      note: "Kontrola kwartalna",
      updated_at: "2026-04-20T09:00:00Z",
      updated_by: "Admin ERP"
    },
    plan: {
      is_configured: true,
      revenue_total: 100000,
      invoice_cost_total: 30000,
      labor_cost_total: 25000,
      total_cost: 55000,
      margin: 45000,
      margin_percent: 45,
      revenue_source: "contract_value"
    },
    actual: {
      revenue_total: 40000,
      invoice_cost_total: 12000,
      labor_cost_total: 8000,
      total_cost: 20000,
      margin: 20000,
      margin_percent: 50,
      labor_hours_total: 160,
      invoice_count: 2
    },
    forecast: {
      is_configured: true,
      revenue_total: 100000,
      invoice_cost_total: 34000,
      labor_cost_total: 27000,
      total_cost: 61000,
      margin: 39000,
      margin_percent: 39,
      revenue_source: "contract_value",
      is_manual: true
    },
    variance: {
      status: "on_track",
      label: "Zgodnie z planem",
      cost_total: -35000,
      margin: -25000,
      margin_percent: 5
    },
    freshness: {
      snapshot_generated_at: "2026-04-22T08:00:00Z",
      last_invoice_date: "2026-04-15",
      last_financial_activity_at: "2026-04-18",
      last_time_entry_month: "2026-04",
      last_planning_date: "2026-04-09",
      last_operational_activity_at: "2026-04-30",
      days_since_financial_activity: 4,
      days_since_operational_activity: 2
    },
    health: {
      level: "attention",
      summary: "Brak pełnego forecastu wymaga kontroli.",
      reasons: ["Brak pełnego forecastu wymaga kontroli."]
    },
    alerts: [
      {
        level: "warning",
        code: "missing-forecast",
        title: "Brak forecastu kosztów kontraktu.",
        description: "Aktywny kontrakt nie ma kompletnego forecastu kosztu fakturowego i kosztu pracy.",
        context: null
      }
    ],
    snapshot_generated_at: "2026-04-22T08:00:00Z",
    ...overrides
  };
}

describe("contracts mappers", () => {
  it("maps contract control data into KPI, freshness and interpreted variances", () => {
    const viewModel = mapContractCenterViewModel(createSnapshot());

    expect(viewModel.heroKpiItems.map((item) => item.label)).toEqual([
      "Wartość kontraktu",
      "Sprzedaż",
      "Łączny koszt",
      "Marża",
      "Marża %"
    ]);
    expect(viewModel.freshnessItems.map((item) => item.label)).toEqual([
      "Ostatnia aktywność finansowa",
      "Ostatni sygnał operacyjny",
      "Ostatnia faktura",
      "Ostatni miesiąc czasu pracy",
      "Ostatnia aktualizacja planu i prognozy"
    ]);
    expect(viewModel.planComparisonRows[0]).toMatchObject({
      label: "Sprzedaż",
      varianceTone: "negative",
      varianceHint: "Sprzedaż poniżej planu"
    });
    expect(viewModel.planComparisonRows[3]).toMatchObject({
      label: "Łączny koszt",
      varianceTone: "positive",
      varianceHint: "Koszt poniżej planu"
    });
    expect(viewModel.forecastSummary).toContain(
      "ręcznie utrzymywanych danych planu i prognozy"
    );
    expect(viewModel.controlUpdatedByLabel).toBe("Admin ERP");
    expect(viewModel.controlNote).toBe("Kontrola kwartalna");
  });

  it("keeps selection on the preferred or active contract", () => {
    const archived = createContract({ id: "c-arch", status: "archived" });
    const active = createContract({ id: "c-active", status: "active" });

    expect(resolveNextSelectedContractId([archived, active], null)).toBe("c-active");
    expect(resolveNextSelectedContractId([archived, active], "c-arch", "c-active")).toBe("c-active");
  });

  it("prefills plan and forecast from contract value and current actuals when manual values are missing", () => {
    const values = toContractControlFormValues(
      createSnapshot({
        control: {
          contract_id: "c-1",
          planned_revenue_total: null,
          planned_invoice_cost_total: null,
          planned_labor_cost_total: null,
          forecast_revenue_total: null,
          forecast_invoice_cost_total: null,
          forecast_labor_cost_total: null,
          note: "",
          updated_at: "",
          updated_by: ""
        }
      })
    );

    expect(values).toMatchObject({
      planned_revenue_total: "100000",
      planned_invoice_cost_total: "12000",
      planned_labor_cost_total: "8000",
      forecast_revenue_total: "100000",
      forecast_invoice_cost_total: "12000",
      forecast_labor_cost_total: "8000"
    });
  });

  it("applies helper actions for plan and forecast without duplicating business logic in the UI", () => {
    const snapshot = createSnapshot();
    const baseValues = {
      planned_revenue_total: "",
      planned_invoice_cost_total: "",
      planned_labor_cost_total: "",
      forecast_revenue_total: "",
      forecast_invoice_cost_total: "",
      forecast_labor_cost_total: "",
      note: ""
    };

    expect(useContractValueAsPlannedRevenue(baseValues, snapshot).planned_revenue_total).toBe(
      "100000"
    );
    expect(copyPlanToForecastValues({
      ...baseValues,
      planned_revenue_total: "110000",
      planned_invoice_cost_total: "35000",
      planned_labor_cost_total: "28000"
    })).toMatchObject({
      forecast_revenue_total: "110000",
      forecast_invoice_cost_total: "35000",
      forecast_labor_cost_total: "28000"
    });
    expect(useActualCostsAsStartingPoint(baseValues, snapshot)).toMatchObject({
      planned_invoice_cost_total: "12000",
      planned_labor_cost_total: "8000",
      forecast_invoice_cost_total: "12000",
      forecast_labor_cost_total: "8000"
    });
  });
});
