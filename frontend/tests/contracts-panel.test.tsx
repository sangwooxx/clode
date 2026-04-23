import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContractCenterPanel } from "@/features/contracts/contract-center-panel";
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
      status: "warning",
      label: "Ostrzeżenie",
      cost_total: 4000,
      margin: -6000,
      margin_percent: -6
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

describe("contract center panel", () => {
  it("renders control sections, freshness and interpreted risk content from backend snapshot", () => {
    const html = renderToStaticMarkup(
      <ContractCenterPanel
        contract={createContract()}
        snapshot={createSnapshot()}
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(html).toContain("Sytuacja kontraktu");
    expect(html).toContain("Aktualność danych");
    expect(html).toContain("Plan vs wykonanie");
    expect(html).toContain("Prognoza końcowa");
    expect(html).toContain("Alerty i ryzyka operacyjne");
    expect(html).toContain("Aktualizował:");
    expect(html).toContain("Admin ERP");
    expect(html).toContain("Brak forecastu kosztów kontraktu.");
    expect(html.indexOf("Alerty i ryzyka operacyjne")).toBeLessThan(
      html.indexOf("Plan vs wykonanie")
    );
    expect(html.indexOf("Aktywność operacyjna")).toBeLessThan(
      html.indexOf("Aktualność danych")
    );
  });

  it("renders a business empty state when contract has no financial or operational data", () => {
    const html = renderToStaticMarkup(
      <ContractCenterPanel
        contract={createContract()}
        snapshot={createSnapshot({
          activity: {
            invoice_count: 0,
            time_entry_count: 0,
            planning_assignment_count: 0,
            has_financial_data: false,
            has_operational_data: false,
            has_data: false
          },
          monthly_breakdown: [],
          alerts: []
        })}
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(html).toContain("Kontrakt nie ma jeszcze danych finansowych ani operacyjnych.");
  });
});
