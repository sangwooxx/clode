import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractCenterPanel } from "../src/features/contracts/contract-center-panel";
import type { ContractRecord, ContractSnapshot } from "../src/features/contracts/types";

const contract: ContractRecord = {
  id: "contract-1",
  contract_number: "K/2026/011",
  name: "Budowa hali",
  investor: "Inwestor A",
  signed_date: "2026-01-10",
  end_date: "2026-11-30",
  contract_value: 250000,
  status: "active",
  created_at: "2026-01-10T08:00:00Z",
  updated_at: "2026-01-10T08:00:00Z"
};

const snapshot: ContractSnapshot = {
  contract,
  metrics: {
    contract_id: "contract-1",
    revenue_total: 120000,
    invoice_cost_total: 35000,
    labor_cost_total: 22000,
    labor_hours_total: 480,
    cost_total: 57000,
    cost_by_category: {
      materials: 35000,
      labor: 22000,
      equipment: 0,
      transport: 0,
      services: 0,
      other: 0
    },
    invoice_count: 5,
    cost_invoice_count: 2,
    sales_invoice_count: 3,
    margin: 63000
  },
  activity: {
    invoice_count: 5,
    time_entry_count: 18,
    planning_assignment_count: 6,
    has_financial_data: true,
    has_operational_data: true,
    has_data: true
  },
  monthly_breakdown: [
    {
      month_key: "2026-04",
      month_label: "2026-04",
      revenue_total: 50000,
      invoice_cost_total: 12000,
      labor_cost_total: 8000,
      labor_hours_total: 160,
      cost_total: 20000,
      margin: 30000,
      invoice_count: 2,
      cost_invoice_count: 1,
      sales_invoice_count: 1
    }
  ]
};

describe("contract center panel", () => {
  it("renders the contract center with hierarchical KPI sections and monthly progress", () => {
    const html = renderToStaticMarkup(
      <ContractCenterPanel
        contract={contract}
        snapshot={snapshot}
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(html).toContain("Wynik kontraktu");
    expect(html).toContain("Dodatkowe wskaźniki");
    expect(html).toContain("Aktywność operacyjna");
    expect(html).toContain("Przebieg miesięczny");
    expect(html).toContain("Kontrakt ma dane operacyjne.");
    expect(html).toContain("04.2026");
    expect(html).toContain("Sprzedaż");
    expect(html).toContain("contracts-monthly__month");
    expect(html).toContain("contracts-monthly__invoice-cost");
  });

  it("renders a business empty state instead of a low-value placeholder", () => {
    const html = renderToStaticMarkup(
      <ContractCenterPanel
        contract={contract}
        snapshot={{
          ...snapshot,
          metrics: {
            ...snapshot.metrics,
            revenue_total: 0,
            invoice_cost_total: 0,
            labor_cost_total: 0,
            labor_hours_total: 0,
            cost_total: 0,
            invoice_count: 0,
            cost_invoice_count: 0,
            sales_invoice_count: 0,
            margin: 0
          },
          activity: {
            invoice_count: 0,
            time_entry_count: 0,
            planning_assignment_count: 0,
            has_financial_data: false,
            has_operational_data: false,
            has_data: false
          },
          monthly_breakdown: []
        }}
        isLoading={false}
        errorMessage={null}
      />
    );

    expect(html).toContain("Kontrakt nie ma jeszcze danych finansowych ani operacyjnych.");
    expect(html).not.toContain("Brak podglądu użycia");
  });
});
