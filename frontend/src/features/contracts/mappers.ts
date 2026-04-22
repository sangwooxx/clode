import {
  formatDate,
  formatHours,
  formatHoursValue,
  formatInteger,
  formatMoney,
  formatMonthLabel,
  formatStatus
} from "@/features/contracts/formatters";
import type {
  ContractCenterViewModel,
  ContractFormValues,
  ContractRecord,
  ContractSnapshot,
  ContractsViewModel
} from "@/features/contracts/types";

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

  return contracts[0]?.id ?? null;
}

export function buildContractSummaryItems(contract: ContractRecord) {
  return [
    {
      id: "contract_number",
      label: "Numer kontraktu",
      value: contract.contract_number || "-"
    },
    {
      id: "investor",
      label: "Inwestor",
      value: contract.investor || "-"
    },
    {
      id: "status",
      label: "Status",
      value: formatStatus(contract.status)
    },
    {
      id: "signed_date",
      label: "Data podpisania",
      value: formatDate(contract.signed_date)
    },
    {
      id: "end_date",
      label: "Termin zakończenia",
      value: formatDate(contract.end_date)
    },
    {
      id: "contract_value",
      label: "Wartość kontraktu",
      value: formatMoney(contract.contract_value)
    }
  ];
}

export function mapContractCenterViewModel(snapshot: ContractSnapshot): ContractCenterViewModel {
  const { activity, contract, metrics, monthly_breakdown: monthlyBreakdown } = snapshot;

  return {
    summaryItems: buildContractSummaryItems(contract),
    kpiItems: [
      {
        id: "contract_value",
        label: "Wartość kontraktu",
        value: formatMoney(contract.contract_value),
        accent: true
      },
      {
        id: "sales",
        label: "Sprzedaż",
        value: formatMoney(metrics.revenue_total)
      },
      {
        id: "invoice_cost",
        label: "Koszt fakturowy",
        value: formatMoney(metrics.invoice_cost_total)
      },
      {
        id: "labor_cost",
        label: "Koszt pracy",
        value: formatMoney(metrics.labor_cost_total)
      },
      {
        id: "total_cost",
        label: "Łączny koszt",
        value: formatMoney(metrics.cost_total)
      },
      {
        id: "margin",
        label: "Marża",
        value: formatMoney(metrics.margin)
      },
      {
        id: "hours",
        label: "Godziny",
        value: formatHours(metrics.labor_hours_total)
      }
    ],
    activityItems: [
      {
        id: "invoice_count",
        label: "Faktury",
        value: formatInteger(activity.invoice_count)
      },
      {
        id: "time_entry_count",
        label: "Wpisy czasu",
        value: formatInteger(activity.time_entry_count)
      },
      {
        id: "planning_assignment_count",
        label: "Przypisania planistyczne",
        value: formatInteger(activity.planning_assignment_count)
      }
    ],
    operationalStatus: activity.has_operational_data
      ? "Kontrakt ma dane operacyjne."
      : "Kontrakt nie ma jeszcze danych operacyjnych.",
    emptyMessage: !activity.has_data
      ? "Kontrakt nie ma jeszcze danych finansowych ani operacyjnych."
      : monthlyBreakdown.length === 0
        ? "Kontrakt nie ma jeszcze przebiegu miesięcznego do pokazania."
        : null,
    monthlyRows: monthlyBreakdown.map((row) => ({
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

export function buildContractHistoricalDataLines(snapshot: ContractSnapshot) {
  const details: string[] = [];

  if (snapshot.activity.invoice_count) {
    details.push(`faktury: ${formatInteger(snapshot.activity.invoice_count)}`);
  }

  if (Number(snapshot.metrics.labor_hours_total || 0) > 0) {
    details.push(`godziny: ${formatHoursValue(snapshot.metrics.labor_hours_total)}`);
  }

  if (snapshot.activity.planning_assignment_count) {
    details.push(`planowanie: ${formatInteger(snapshot.activity.planning_assignment_count)}`);
  }

  return details;
}
