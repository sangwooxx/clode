import { formatInteger, formatMoney } from "@/features/contracts/formatters";
import type { ContractFormValues, ContractRecord, ContractsViewModel } from "@/features/contracts/types";

export function mapContractsViewModel(contracts: ContractRecord[]): ContractsViewModel {
  const activeContracts = contracts.filter((contract) => contract.status !== "archived");
  const archivedContracts = contracts.filter((contract) => contract.status === "archived");
  const totalValue = activeContracts.reduce((sum, contract) => sum + Number(contract.contract_value || 0), 0);

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
