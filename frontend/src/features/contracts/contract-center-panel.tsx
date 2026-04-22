import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { mapContractCenterViewModel } from "@/features/contracts/mappers";
import type {
  ContractKpiItem,
  ContractMonthlyRowView,
  ContractRecord,
  ContractSnapshot
} from "@/features/contracts/types";

const monthlyBreakdownColumns: Array<DataTableColumn<ContractMonthlyRowView>> = [
  {
    key: "ordinal",
    header: "Lp.",
    className: "contracts-monthly__ordinal",
    sortable: false,
    render: (_row, index) => <span className="data-table__text">{index + 1}</span>
  },
  {
    key: "month_label",
    header: "Miesiąc prac",
    className: "contracts-monthly__month",
    sortValue: (row) => row.month_key,
    render: (row) => <span className="data-table__primary">{row.month_label}</span>
  },
  {
    key: "revenue_total",
    header: "Sprzedaż",
    className: "data-table__numeric contracts-monthly__revenue",
    render: (row) => row.revenue_total
  },
  {
    key: "invoice_cost_total",
    header: "Koszt fakturowy",
    className: "data-table__numeric contracts-monthly__invoice-cost",
    render: (row) => row.invoice_cost_total
  },
  {
    key: "labor_cost_total",
    header: "Koszt pracy",
    className: "data-table__numeric contracts-monthly__labor-cost",
    render: (row) => row.labor_cost_total
  },
  {
    key: "cost_total",
    header: "Łączny koszt",
    className: "data-table__numeric contracts-monthly__total-cost",
    render: (row) => row.cost_total
  },
  {
    key: "margin",
    header: "Marża",
    className: "data-table__numeric contracts-monthly__margin",
    render: (row) => row.margin
  },
  {
    key: "labor_hours_total",
    header: "Godziny",
    className: "data-table__numeric contracts-monthly__hours",
    render: (row) => row.labor_hours_total
  },
  {
    key: "invoice_count",
    header: "Faktury",
    className: "data-table__numeric contracts-monthly__invoice-count",
    render: (row) => row.invoice_count
  }
];

function renderKpiCards(items: ContractKpiItem[], variant: "hero" | "secondary") {
  return (
    <div className={`contracts-kpi-grid contracts-kpi-grid--${variant}`}>
      {items.map((item) => (
        <article
          key={item.id}
          className={[
            "contracts-kpi-card",
            `contracts-kpi-card--${variant}`,
            item.accent ? "contracts-kpi-card--accent" : ""
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <p className="contracts-kpi-card__label">{item.label}</p>
          <p className="contracts-kpi-card__value">{item.value}</p>
        </article>
      ))}
    </div>
  );
}

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
      <div className="contracts-detail contracts-detail--empty-state">
        <div className="contracts-detail__empty">
          <p className="status-message">Wybierz kontrakt, aby zobaczyć Centrum kontraktu.</p>
        </div>
      </div>
    );
  }

  const viewModel = snapshot ? mapContractCenterViewModel(snapshot) : null;

  if (isLoading) {
    return (
      <div className="contracts-detail">
        <p className="status-message">Ładowanie Centrum kontraktu...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="contracts-detail">
        <p className="auth-form__error">{errorMessage}</p>
      </div>
    );
  }

  if (!viewModel) {
    return (
      <div className="contracts-detail">
        <p className="status-message">Trwa przygotowanie Centrum kontraktu.</p>
      </div>
    );
  }

  return (
    <div className="contracts-detail">
      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Wynik kontraktu</h3>
        {renderKpiCards(viewModel.heroKpiItems, "hero")}
      </section>

      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Dodatkowe wskaźniki</h3>
        {renderKpiCards(viewModel.secondaryKpiItems, "secondary")}
      </section>

      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Aktywność operacyjna</h3>
        <div className="contracts-detail__stats">
          {viewModel.activityItems.map((item) => (
            <StatCard key={item.id} label={item.label} value={item.value} />
          ))}
        </div>
        <p className="contracts-detail__status">{viewModel.operationalStatus}</p>
      </section>

      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Przebieg miesięczny</h3>
        {viewModel.emptyMessage ? (
          <div className="contracts-detail__empty">
            <p className="status-message">{viewModel.emptyMessage}</p>
          </div>
        ) : (
          <div className="contracts-detail__table">
            <DataTable
              columns={monthlyBreakdownColumns}
              rows={viewModel.monthlyRows}
              rowKey={(row) => row.id}
              tableClassName="contracts-table contracts-table--monthly"
              emptyMessage="Kontrakt nie ma jeszcze przebiegu miesięcznego do pokazania."
            />
          </div>
        )}
      </section>
    </div>
  );
}
