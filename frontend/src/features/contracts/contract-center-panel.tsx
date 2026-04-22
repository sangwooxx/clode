import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import {
  buildContractSummaryItems,
  mapContractCenterViewModel
} from "@/features/contracts/mappers";
import type {
  ContractMonthlyRowView,
  ContractRecord,
  ContractSnapshot
} from "@/features/contracts/types";

const monthlyBreakdownColumns: Array<DataTableColumn<ContractMonthlyRowView>> = [
  {
    key: "month_label",
    header: "Miesiac",
    sortValue: (row) => row.month_key,
    render: (row) => <span className="data-table__primary">{row.month_label}</span>
  },
  {
    key: "revenue_total",
    header: "Sprzedaz",
    className: "data-table__numeric",
    render: (row) => row.revenue_total
  },
  {
    key: "invoice_cost_total",
    header: "Koszt fakturowy",
    className: "data-table__numeric",
    render: (row) => row.invoice_cost_total
  },
  {
    key: "labor_cost_total",
    header: "Koszt pracy",
    className: "data-table__numeric",
    render: (row) => row.labor_cost_total
  },
  {
    key: "cost_total",
    header: "Laczny koszt",
    className: "data-table__numeric",
    render: (row) => row.cost_total
  },
  {
    key: "margin",
    header: "Marza",
    className: "data-table__numeric",
    render: (row) => row.margin
  },
  {
    key: "labor_hours_total",
    header: "Godziny",
    className: "data-table__numeric",
    render: (row) => row.labor_hours_total
  },
  {
    key: "invoice_count",
    header: "Faktury",
    className: "data-table__numeric",
    render: (row) => row.invoice_count
  }
];

export function ContractCenterPanel({
  contract,
  snapshot,
  isLoading,
  errorMessage
}: {
  contract: ContractRecord | null;
  snapshot: ContractSnapshot | null;
  isLoading: boolean;
  errorMessage?: string | null;
}) {
  if (!contract) {
    return (
      <p className="status-message">
        Wybierz kontrakt z tabeli albo dodaj nowy wpis.
      </p>
    );
  }

  const summaryItems = buildContractSummaryItems(snapshot?.contract ?? contract);
  const viewModel = snapshot ? mapContractCenterViewModel(snapshot) : null;

  return (
    <div className="contracts-detail">
      <section className="contracts-detail__section">
        <div className="contracts-detail__header">
          <h3 className="contracts-detail__section-title">Podsumowanie kontraktu</h3>
          <p className="contracts-detail__contract-name">{contract.name}</p>
        </div>
        <div className="contracts-detail__summary-grid">
          {summaryItems.map((item) => (
            <div key={item.id} className="contracts-detail__summary-item">
              <span className="contracts-detail__summary-label">{item.label}</span>
              <strong className="contracts-detail__summary-value">{item.value}</strong>
            </div>
          ))}
        </div>
      </section>

      {isLoading ? (
        <p className="status-message">Ladowanie centrum kontraktu...</p>
      ) : errorMessage ? (
        <p className="auth-form__error">{errorMessage}</p>
      ) : viewModel ? (
        <>
          <section className="contracts-detail__section">
            <h3 className="contracts-detail__section-title">KPI kontraktu</h3>
            <div className="module-page__stats module-page__stats--compact">
              {viewModel.kpiItems.map((item) => (
                <StatCard
                  key={item.id}
                  label={item.label}
                  value={item.value}
                  accent={item.accent}
                />
              ))}
            </div>
          </section>

          <section className="contracts-detail__section">
            <h3 className="contracts-detail__section-title">Aktywnosc operacyjna</h3>
            <div className="module-page__stats module-page__stats--compact">
              {viewModel.activityItems.map((item) => (
                <StatCard key={item.id} label={item.label} value={item.value} />
              ))}
            </div>
            <p className="contracts-detail__status">{viewModel.operationalStatus}</p>
          </section>

          <section className="contracts-detail__section">
            <h3 className="contracts-detail__section-title">Przebieg miesieczny</h3>
            {viewModel.emptyMessage ? (
              <div className="contracts-detail__empty">
                <p className="status-message">{viewModel.emptyMessage}</p>
              </div>
            ) : (
              <DataTable
                columns={monthlyBreakdownColumns}
                rows={viewModel.monthlyRows}
                rowKey={(row) => row.id}
                tableClassName="contracts-table contracts-table--monthly"
                emptyMessage="Kontrakt nie ma jeszcze przebiegu miesiecznego do pokazania."
              />
            )}
          </section>
        </>
      ) : (
        <p className="status-message">Trwa przygotowanie widoku kontraktu.</p>
      )}
    </div>
  );
}
