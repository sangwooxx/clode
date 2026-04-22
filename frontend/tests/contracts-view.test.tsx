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
  it("shows Contract Center as the primary view without opening edit mode on selection", () => {
    const html = renderToStaticMarkup(
      <ContractsView initialContracts={contracts} initialError={null} />
    );

    expect(html).toContain("Centrum kontraktu");
    expect(html).toContain("Podgląd kontraktu");
    expect(html).toContain("Lista kontraktów");
    expect(html).toContain("Numer kontraktu");
    expect(html).toContain("Edytuj");
    expect(html).not.toContain("Edycja kontraktu");
    expect(html).not.toContain("Zapisz zmiany");
  });

  it("renders a business empty state when there are no contracts to preview", () => {
    const html = renderToStaticMarkup(
      <ContractsView initialContracts={[]} initialError={null} />
    );

    expect(html).toContain(
      "Wybierz kontrakt z listy, aby zobaczyć jego Centrum kontraktu."
    );
    expect(html).toContain(
      "Brak kontraktów w rejestrze. Dodaj pierwszy kontrakt przyciskiem Dodaj kontrakt."
    );
  });
});
