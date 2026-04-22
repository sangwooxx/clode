import { describe, expect, it } from "vitest";
import {
  buildContractHistoricalDataLines,
  mapContractCenterViewModel,
  resolveNextSelectedContractId
} from "../src/features/contracts/mappers";
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

const snapshotWithData: ContractSnapshot = {
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

describe("contracts mappers", () => {
  it("maps contract snapshot into a business-ready contract center view model", () => {
    const viewModel = mapContractCenterViewModel(snapshotWithData);

    expect(viewModel.summaryItems[0]).toMatchObject({
      label: "Numer kontraktu",
      value: "K/2026/011"
    });
    expect(viewModel.kpiItems.map((item) => item.label)).toEqual([
      "Wartość kontraktu",
      "Sprzedaż",
      "Koszt fakturowy",
      "Koszt pracy",
      "Łączny koszt",
      "Marża",
      "Godziny"
    ]);
    expect(viewModel.activityItems).toMatchObject([
      { label: "Faktury", value: "5" },
      { label: "Wpisy czasu", value: "18" },
      { label: "Przypisania planistyczne", value: "6" }
    ]);
    expect(viewModel.operationalStatus).toBe("Kontrakt ma dane operacyjne.");
    expect(viewModel.emptyMessage).toBeNull();
    expect(viewModel.monthlyRows[0]).toMatchObject({
      month_label: "04.2026",
      labor_hours_total: "160 h",
      invoice_count: "2"
    });
  });

  it("builds a business empty state when contract has no finance or operations", () => {
    const viewModel = mapContractCenterViewModel({
      ...snapshotWithData,
      activity: {
        invoice_count: 0,
        time_entry_count: 0,
        planning_assignment_count: 0,
        has_financial_data: false,
        has_operational_data: false,
        has_data: false
      },
      metrics: {
        ...snapshotWithData.metrics,
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
      monthly_breakdown: []
    });

    expect(viewModel.emptyMessage).toBe(
      "Kontrakt nie ma jeszcze danych finansowych ani operacyjnych."
    );
    expect(viewModel.operationalStatus).toBe(
      "Kontrakt nie ma jeszcze danych operacyjnych."
    );
  });

  it("keeps contract selection stable across refreshes", () => {
    const contracts: ContractRecord[] = [
      contract,
      {
        ...contract,
        id: "contract-2",
        contract_number: "K/2026/012",
        name: "Serwis instalacji"
      }
    ];

    expect(resolveNextSelectedContractId(contracts, "contract-1", "contract-2")).toBe(
      "contract-2"
    );
    expect(resolveNextSelectedContractId(contracts, "contract-2", "missing")).toBe(
      "contract-2"
    );
    expect(resolveNextSelectedContractId(contracts, "missing", null)).toBe("contract-1");
  });

  it("formats historical detail lines from snapshot data for delete safeguards", () => {
    expect(buildContractHistoricalDataLines(snapshotWithData)).toEqual([
      "faktury: 5",
      "godziny: 480",
      "planowanie: 6"
    ]);
  });
});
