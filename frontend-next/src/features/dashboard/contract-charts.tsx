import { Panel } from "@/components/ui/panel";
import { formatMoney, formatMonthLabel } from "@/features/dashboard/formatters";
import type { DashboardContractItem, DashboardMonthlyBreakdown } from "@/features/dashboard/types";

function buildStructureRows(contract: DashboardContractItem) {
  return [
    {
      label: "Faktury kosztowe",
      value: Number(contract.metrics.invoice_cost_total || 0),
      tone: "material"
    },
    {
      label: "Koszt wynagrodzeń",
      value: Number(contract.metrics.labor_cost_total || 0),
      tone: "labor"
    },
    {
      label: "Faktury sprzedażowe",
      value: Number(contract.metrics.revenue_total || 0),
      tone: "sales"
    }
  ];
}

function ContractStructureChart({ contract }: { contract: DashboardContractItem }) {
  const rows = buildStructureRows(contract);
  const totalValue = rows.reduce((sum, row) => sum + Math.abs(row.value), 0);

  if (!totalValue) {
    return (
      <Panel
        title="Struktura kontraktu"
        description="Brak danych finansowych dla wybranego kontraktu."
      >
        <p className="panel__description">Nie ma jeszcze wartości do pokazania na wykresie struktury.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Struktura kontraktu"
      description="Taki sam zakres treści jak w obecnej aplikacji: faktury kosztowe, koszt wynagrodzeń i faktury sprzedażowe."
    >
      <div className="contract-chart contract-chart--structure">
        {rows.map((row) => {
          const share = totalValue ? Math.round((Math.abs(row.value) / totalValue) * 1000) / 10 : 0;
          return (
            <article key={row.label} className="contract-chart__row">
              <div className="contract-chart__meta">
                <strong className="contract-chart__label">{row.label}</strong>
                <span className="contract-chart__value">
                  {formatMoney(row.value)} • {share.toLocaleString("pl-PL")}%
                </span>
              </div>
              <div className="contract-chart__track">
                <div
                  className={`contract-chart__bar contract-chart__bar--${row.tone}`}
                  style={{ width: `${Math.max(share, 2)}%` }}
                />
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function ContractMonthlyChart({
  rows
}: {
  rows: DashboardMonthlyBreakdown[];
}) {
  const visibleRows = rows.slice(-12);
  const maxValue = Math.max(
    ...visibleRows.flatMap((row) => [
      Number(row.invoice_cost_total || 0),
      Number(row.labor_cost_total || 0),
      Number(row.revenue_total || 0)
    ]),
    1
  );

  if (!visibleRows.length) {
    return (
      <Panel
        title="Miesięczny przebieg kontraktu"
        description="Brak danych miesięcznych dla wybranego kontraktu."
      >
        <p className="panel__description">Kontrakt nie ma jeszcze miesięcznego rozbicia do pokazania.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Miesięczny przebieg kontraktu"
      description="Zakres zgodny z obecną aplikacją: faktury kosztowe, koszt wynagrodzeń i faktury sprzedażowe w układzie miesięcznym."
    >
      <div className="contract-monthly-chart">
        {visibleRows.map((row) => (
          <article key={row.month_key} className="contract-monthly-chart__row">
            <div className="contract-monthly-chart__label">
              {formatMonthLabel(row.month_label || row.month_key)}
            </div>
            <div className="contract-monthly-chart__series">
              <span
                className="contract-monthly-chart__bar contract-monthly-chart__bar--material"
                style={{ width: `${(Number(row.invoice_cost_total || 0) / maxValue) * 100}%` }}
              />
              <span
                className="contract-monthly-chart__bar contract-monthly-chart__bar--labor"
                style={{ width: `${(Number(row.labor_cost_total || 0) / maxValue) * 100}%` }}
              />
              <span
                className="contract-monthly-chart__bar contract-monthly-chart__bar--sales"
                style={{ width: `${(Number(row.revenue_total || 0) / maxValue) * 100}%` }}
              />
            </div>
            <div className="contract-monthly-chart__values">
              <div className="contract-monthly-chart__metric">
                <span>Faktury kosztowe</span>
                <strong>{formatMoney(row.invoice_cost_total)}</strong>
              </div>
              <div className="contract-monthly-chart__metric">
                <span>Koszt wynagrodzeń</span>
                <strong>{formatMoney(row.labor_cost_total)}</strong>
              </div>
              <div className="contract-monthly-chart__metric">
                <span>Faktury sprzedażowe</span>
                <strong>{formatMoney(row.revenue_total)}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Panel>
  );
}

export function DashboardContractCharts({
  contract
}: {
  contract: DashboardContractItem | null;
}) {
  if (!contract) {
    return (
      <div className="dashboard-chart-grid">
        <Panel
          title="Struktura kontraktu"
          description="Wybierz kontrakt w tabeli, aby zobaczyć wykres zgodny z obecną aplikacją."
        >
          <p className="panel__description">Brak aktywnego kontraktu do analizy struktury.</p>
        </Panel>
        <Panel
          title="Miesięczny przebieg kontraktu"
          description="Wybierz kontrakt w tabeli, aby zobaczyć miesięczne rozbicie."
        >
          <p className="panel__description">Brak aktywnego kontraktu do analizy miesięcznej.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="dashboard-chart-grid">
      <ContractStructureChart contract={contract} />
      <ContractMonthlyChart rows={contract.monthly_breakdown || []} />
    </div>
  );
}
