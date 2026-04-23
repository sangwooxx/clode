import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { mapContractCenterViewModel } from "@/features/contracts/mappers";
import type {
  ContractAlertView,
  ContractKpiItem,
  ContractMonthlyRowView,
  ContractPlanComparisonRow,
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

const planComparisonColumns: Array<DataTableColumn<ContractPlanComparisonRow>> = [
  {
    key: "label",
    header: "Pozycja",
    className: "contracts-plan__label",
    render: (row) => <span className="data-table__primary">{row.label}</span>
  },
  {
    key: "planValue",
    header: "Plan",
    className: "data-table__numeric contracts-plan__value",
    sortable: false,
    render: (row) => row.planValue
  },
  {
    key: "actualValue",
    header: "Wykonanie",
    className: "data-table__numeric contracts-plan__value",
    sortable: false,
    render: (row) => row.actualValue
  },
  {
    key: "varianceValue",
    header: "Odchylenie",
    className: "data-table__numeric contracts-plan__value",
    sortable: false,
    render: (row) => (
      <div className={`contracts-variance contracts-variance--${row.varianceTone}`}>
        <strong className="contracts-variance__value">{row.varianceValue}</strong>
        <span className="contracts-variance__hint">{row.varianceHint}</span>
      </div>
    )
  }
];

function renderKpiCards(items: ContractKpiItem[]) {
  return (
    <div className="contracts-kpi-grid">
      {items.map((item) => (
        <article
          key={item.id}
          className={`contracts-kpi-card${item.accent ? " contracts-kpi-card--accent" : ""}`}
        >
          <p className="contracts-kpi-card__label">{item.label}</p>
          <p className="contracts-kpi-card__value">{item.value}</p>
        </article>
      ))}
    </div>
  );
}

function formatAlertLevel(level: ContractAlertView["level"]) {
  if (level === "critical") return "Krytyczny";
  if (level === "warning") return "Uwaga";
  return "Informacja";
}

function renderAlertItems(alerts: ContractAlertView[]) {
  if (!alerts.length) {
    return (
      <div className="contracts-empty-note">
        <p className="status-message">Na teraz kontrakt nie pokazuje ryzyk wymagających reakcji.</p>
      </div>
    );
  }

  return (
    <div className="contracts-alert-list">
      {alerts.map((alert) => (
        <article key={alert.id} className={`contracts-alert contracts-alert--${alert.level}`}>
          <div className="contracts-alert__header">
            <strong>{alert.title}</strong>
            <span className="contracts-alert__level">{formatAlertLevel(alert.level)}</span>
          </div>
          <p>{alert.description}</p>
          {alert.context ? <p className="contracts-alert__context">{alert.context}</p> : null}
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
          <p className="status-message">
            Wybierz kontrakt, aby zobaczyć jego sytuację, ryzyka i prognozę.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="contracts-detail">
        <p className="status-message">Ładowanie obrazu kontraktu...</p>
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

  if (!snapshot) {
    return (
      <div className="contracts-detail">
        <p className="status-message">Trwa przygotowanie obrazu kontraktu.</p>
      </div>
    );
  }

  const viewModel = mapContractCenterViewModel(snapshot);

  return (
    <div className="contracts-detail contracts-control-center">
      <section className="contracts-detail__section">
        <div className="contracts-section-heading">
          <h3 className="contracts-detail__section-title">Sytuacja kontraktu</h3>
          <span className={`contracts-chip contracts-chip--${viewModel.healthLevel}`}>
            {viewModel.healthLabel}
          </span>
        </div>
        <p className="contracts-section-summary">{viewModel.healthSummary}</p>
        {snapshot.health.reasons.length ? (
          <div className="contracts-health-reasons">
            {snapshot.health.reasons.map((reason) => (
              <span key={reason} className="contracts-health-reasons__item">
                {reason}
              </span>
            ))}
          </div>
        ) : null}
        <div className="contracts-header-details">
          {viewModel.headerDetails.map((item) => (
            <div key={item.id} className="summary-strip">
              <div className="summary-strip__primary">
                <span className="summary-strip__label">{item.label}</span>
                <strong className="summary-strip__value">{item.value}</strong>
              </div>
            </div>
          ))}
        </div>
        {renderKpiCards(viewModel.heroKpiItems)}
      </section>

      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Alerty i ryzyka operacyjne</h3>
        {renderAlertItems(viewModel.alerts)}
      </section>

      <section className="contracts-detail__section">
        <div className="contracts-section-heading">
          <h3 className="contracts-detail__section-title">Plan vs wykonanie</h3>
          <span className={`contracts-chip contracts-chip--${snapshot.variance.status}`}>
            {viewModel.planStatusLabel}
          </span>
        </div>
        <div className="contracts-detail__table">
          <DataTable
            columns={planComparisonColumns}
            rows={viewModel.planComparisonRows}
            rowKey={(row) => row.id}
            tableClassName="contracts-table contracts-table--plan"
            emptyMessage="Kontrakt nie ma planu do porównania."
          />
        </div>
      </section>

      <section className="contracts-detail__section">
        <h3 className="contracts-detail__section-title">Prognoza końcowa</h3>
        <p className="contracts-section-summary">{viewModel.forecastSummary}</p>
        <div className="contracts-forecast-grid">
          {viewModel.forecastItems.map((item) => (
            <StatCard key={item.id} label={item.label} value={item.value} />
          ))}
        </div>
        {viewModel.controlUpdatedAtLabel || viewModel.controlNote ? (
          <div className="contracts-control-note">
            {viewModel.controlUpdatedAtLabel ? (
              <p>Ostatnia aktualizacja planu i prognozy: {viewModel.controlUpdatedAtLabel}</p>
            ) : null}
            {viewModel.controlUpdatedByLabel ? (
              <p>Aktualizował: {viewModel.controlUpdatedByLabel}</p>
            ) : null}
            {viewModel.controlNote ? <p>Notatka kontrolna: {viewModel.controlNote}</p> : null}
          </div>
        ) : null}
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
        <h3 className="contracts-detail__section-title">Aktualność danych</h3>
        <div className="contracts-freshness-grid">
          {viewModel.freshnessItems.map((item) => (
            <article key={item.id} className="contracts-freshness-card">
              <p className="contracts-freshness-card__label">{item.label}</p>
              <p className="contracts-freshness-card__value">{item.value}</p>
              {item.hint ? <p className="contracts-freshness-card__hint">{item.hint}</p> : null}
            </article>
          ))}
        </div>
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
