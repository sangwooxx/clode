import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContractsView } from "../src/features/contracts/contracts-view";
import type { ContractRecord } from "../src/features/contracts/types";

const contracts: ContractRecord[] = [
  {
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
  }
];

describe("contracts view", () => {
  it("renders a compact master-detail layout for contract selection and analysis", () => {
    const html = renderToStaticMarkup(
      <ContractsView initialContracts={contracts} initialError={null} />
    );

    expect(html).toContain("Wybierz kontrakt");
    expect(html).toContain("contracts-picker");
    expect(html).toContain("Centrum kontraktu");
    expect(html).toContain("Budowa hali");
    expect(html).toContain("Numer kontraktu");
    expect(html).toContain("Edytuj");
    expect(html).not.toContain("Podgląd kontraktu");
    expect(html).not.toContain("Akcje");
    expect(html).not.toContain("Zaznacz wszystkie kontrakty");
    expect(html).not.toContain("contracts-table--registry");
  });

  it("renders a clear empty state when there are no contracts to preview", () => {
    const html = renderToStaticMarkup(
      <ContractsView initialContracts={[]} initialError={null} />
    );

    expect(html).toContain("Brak kontraktów w rejestrze.");
    expect(html).toContain("Wybierz kontrakt, aby zobaczyć Centrum kontraktu.");
  });
});
