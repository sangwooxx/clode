"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { fetchDashboardSnapshot } from "@/features/dashboard/api";
import { DashboardContractCharts } from "@/features/dashboard/contract-charts";
import {
  formatDate,
  formatHours,
  formatInteger,
  formatMoney,
  formatMonthLabel
} from "@/features/dashboard/formatters";
import { mapDashboardSnapshot } from "@/features/dashboard/mappers";
import type {
  DashboardContractItem,
  DashboardMonthlyBreakdown,
  DashboardSnapshot,
  DashboardUnassignedInvoice,
  DashboardUnmatchedHours,
  DashboardViewModel
} from "@/features/dashboard/types";

type DashboardMode = "contracts" | "unassigned";

type DashboardState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: DashboardViewModel };

type DashboardContractRow = {
  index: number;
  item: DashboardContractItem;
};

type DashboardMonthlyRow = {
  index: number;
  item: DashboardMonthlyBreakdown;
};

type DashboardUnassignedInvoiceRow = {
  index: number;
  item: DashboardUnassignedInvoice;
};

type DashboardUnmatchedHoursRow = {
  index: number;
  item: DashboardUnmatchedHours;
};

const contractColumns: Array<DataTableColumn<DashboardContractRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "dashboard-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index
  },
  {
    key: "contract",
    header: "Kontrakt",
    className: "dashboard-col-contract",
    sortValue: (row) => `${row.item.contract.contract_number} ${row.item.contract.name}`,
    render: (row) => (
      <span className="data-table__primary">
        {row.item.contract.contract_number
          ? `${row.item.contract.contract_number} - ${row.item.contract.name}`
          : row.item.contract.name}
      </span>
    )
  },
  {
    key: "sales",
    header: "Faktury sprzedażowe",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.metrics.revenue_total,
    render: (row) => formatMoney(row.item.metrics.revenue_total)
  },
  {
    key: "invoice-cost",
    header: "Faktury kosztowe",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.metrics.invoice_cost_total,
    render: (row) => formatMoney(row.item.metrics.invoice_cost_total)
  },
  {
    key: "labor-cost",
    header: "Koszt wynagrodzeń",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.metrics.labor_cost_total,
    render: (row) => formatMoney(row.item.metrics.labor_cost_total)
  },
  {
    key: "total-cost",
    header: "Łączny koszt",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.metrics.cost_total,
    render: (row) => formatMoney(row.item.metrics.cost_total)
  },
  {
    key: "hours",
    header: "Godziny",
    className: "data-table__numeric dashboard-col-hours",
    sortValue: (row) => row.item.metrics.labor_hours_total,
    render: (row) => formatHours(row.item.metrics.labor_hours_total)
  },
  {
    key: "margin",
    header: "Marża",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.metrics.margin,
    render: (row) => formatMoney(row.item.metrics.margin)
  }
];

const monthlyColumns: Array<DataTableColumn<DashboardMonthlyRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "dashboard-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index
  },
  {
    key: "month",
    header: "Miesiąc",
    className: "dashboard-col-month",
    sortValue: (row) => row.item.month_key,
    render: (row) => formatMonthLabel(row.item.month_label || row.item.month_key)
  },
  {
    key: "sales",
    header: "Faktury sprzedażowe",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.revenue_total,
    render: (row) => formatMoney(row.item.revenue_total)
  },
  {
    key: "invoice-cost",
    header: "Faktury kosztowe",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.invoice_cost_total,
    render: (row) => formatMoney(row.item.invoice_cost_total)
  },
  {
    key: "labor-cost",
    header: "Koszt wynagrodzeń",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.labor_cost_total,
    render: (row) => formatMoney(row.item.labor_cost_total)
  },
  {
    key: "hours",
    header: "Godziny",
    className: "data-table__numeric dashboard-col-hours",
    sortValue: (row) => row.item.labor_hours_total,
    render: (row) => formatHours(row.item.labor_hours_total)
  },
  {
    key: "total-cost",
    header: "Łączny koszt",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.cost_total,
    render: (row) => formatMoney(row.item.cost_total)
  },
  {
    key: "margin",
    header: "Marża",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.margin,
    render: (row) => formatMoney(row.item.margin)
  }
];

const unassignedInvoiceColumns: Array<DataTableColumn<DashboardUnassignedInvoiceRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "dashboard-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index
  },
  {
    key: "date",
    header: "Data wystawienia",
    className: "dashboard-col-date",
    sortValue: (row) => row.item.issue_date,
    render: (row) => formatDate(row.item.issue_date)
  },
  {
    key: "type",
    header: "Typ",
    className: "dashboard-col-type",
    sortValue: (row) => row.item.type,
    render: (row) => (row.item.type === "sales" ? "Faktura sprzedażowa" : "Faktura kosztowa")
  },
  {
    key: "number",
    header: "Numer faktury",
    className: "dashboard-col-number",
    sortValue: (row) => row.item.document_number,
    render: (row) => row.item.document_number || "-"
  },
  {
    key: "contract",
    header: "Wpisany kontrakt",
    className: "dashboard-col-contract-name",
    sortValue: (row) => row.item.contract_name,
    render: (row) => row.item.contract_name || "Brak kontraktu"
  },
  {
    key: "party",
    header: "Kontrahent",
    className: "dashboard-col-party",
    sortValue: (row) => row.item.party,
    render: (row) => row.item.party || "-"
  },
  {
    key: "description",
    header: "Kategoria / opis",
    className: "dashboard-col-description",
    sortValue: (row) => `${row.item.category || ""} ${row.item.description || ""}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.item.category || "-"}</span>
        {row.item.description ? (
          <span className="data-table__secondary">{row.item.description}</span>
        ) : null}
      </div>
    )
  },
  {
    key: "net",
    header: "Netto",
    className: "data-table__numeric dashboard-col-money",
    sortValue: (row) => row.item.net_amount,
    render: (row) => formatMoney(row.item.net_amount)
  },
  {
    key: "vat",
    header: "VAT",
    className: "data-table__numeric dashboard-col-vat",
    sortValue: (row) =>
      Math.max(0, Number(row.item.gross_amount || 0) - Number(row.item.net_amount || 0)),
    render: (row) => {
      const net = Number(row.item.net_amount || 0);
      const gross = Number(row.item.gross_amount || 0);
      const vatAmount = gross && net ? Math.max(0, gross - net) : 0;
      const vatRateLabel = Number(row.item.vat_rate || 0)
        ? `${Number(row.item.vat_rate || 0).toLocaleString("pl-PL")}%`
        : "bez VAT";

      return (
        <div className="data-table__stack data-table__stack--numeric">
          <span className="data-table__primary">{vatRateLabel}</span>
          <span className="data-table__secondary">{formatMoney(vatAmount)}</span>
        </div>
      );
    }
  },
  {
    key: "gross",
    header: "Brutto",
    className: "data-table__numeric dashboard-col-money",
    sortValue: (row) => row.item.gross_amount,
    render: (row) => formatMoney(row.item.gross_amount)
  }
];

const unmatchedHoursColumns: Array<DataTableColumn<DashboardUnmatchedHoursRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "dashboard-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index
  },
  {
    key: "name",
    header: "Pozycja",
    className: "dashboard-col-position",
    sortValue: (row) => row.item.source_name,
    render: (row) => row.item.source_name
  },
  {
    key: "entries",
    header: "Zapisy",
    className: "data-table__numeric dashboard-col-count",
    sortValue: (row) => row.item.entries,
    render: (row) => formatInteger(row.item.entries)
  },
  {
    key: "hours",
    header: "Godziny",
    className: "data-table__numeric dashboard-col-hours",
    sortValue: (row) => row.item.labor_hours,
    render: (row) => formatHours(row.item.labor_hours)
  },
  {
    key: "cost",
    header: "Koszt wynagrodzeń",
    className: "data-table__numeric dashboard-col-money-wide",
    sortValue: (row) => row.item.labor_cost,
    render: (row) => formatMoney(row.item.labor_cost)
  }
];

function dataFromState(state: DashboardState): DashboardViewModel {
  return state.status === "success"
    ? state.data
    : {
        summary: [],
        contracts: [],
        unassignedInvoices: [],
        unmatchedHours: [],
        totals: {
          revenue_total: 0,
          invoice_cost_total: 0,
          labor_cost_total: 0,
          labor_hours_total: 0,
          cost_total: 0,
          margin: 0,
          invoice_count: 0,
          cost_invoice_count: 0,
          sales_invoice_count: 0,
          cost_by_category: {}
        },
        unassigned: {
          contract_id: "",
          revenue_total: 0,
          invoice_cost_total: 0,
          labor_cost_total: 0,
          labor_hours_total: 0,
          cost_total: 0,
          cost_by_category: {},
          invoice_count: 0,
          cost_invoice_count: 0,
          sales_invoice_count: 0,
          margin: 0
        }
      };
}

export function DashboardView({
  initialSnapshot,
  initialError
}: {
  initialSnapshot?: DashboardSnapshot | null;
  initialError?: string | null;
}) {
  const [state, setState] = useState<DashboardState>(() => {
    if (initialSnapshot) {
      return { status: "success", data: mapDashboardSnapshot(initialSnapshot) };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [mode, setMode] = useState<DashboardMode>("contracts");
  const [search, setSearch] = useState("");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    const shouldUseInitialData =
      refreshTick === 0 && (Boolean(initialSnapshot) || Boolean(initialError));

    if (shouldUseInitialData) {
      return () => {
        active = false;
      };
    }

    setState({ status: "loading" });

    async function load() {
      try {
        const snapshot = await fetchDashboardSnapshot();
        if (!active) return;

        const mapped = mapDashboardSnapshot(snapshot);
        setState({ status: "success", data: mapped });
        setSelectedContractId((current) => {
          if (current && mapped.contracts.some((item) => item.contract.id === current)) {
            return current;
          }
          return mapped.contracts[0]?.contract.id ?? null;
        });
      } catch (error) {
        if (!active) return;

        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Nie udalo sie zaladowac danych dashboardu."
        });
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [initialError, initialSnapshot, refreshTick]);

  const contracts = useMemo(() => {
    if (state.status !== "success") return [];

    const term = search.trim().toLowerCase();
    if (!term) return state.data.contracts;

    return state.data.contracts.filter((item) => {
      const haystack = [
        item.contract.contract_number,
        item.contract.name,
        item.contract.investor
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [search, state]);

  const selectedContract = useMemo(() => {
    if (state.status !== "success") return null;

    return (
      state.data.contracts.find((item) => item.contract.id === selectedContractId) ??
      state.data.contracts[0] ??
      null
    );
  }, [selectedContractId, state]);

  const contractRows = useMemo(
    () => contracts.map((item, index) => ({ index: index + 1, item })),
    [contracts]
  );

  const monthlyRows = useMemo(
    () =>
      (selectedContract?.monthly_breakdown || []).map((item, index) => ({
        index: index + 1,
        item
      })),
    [selectedContract]
  );

  const unassignedInvoiceRows = useMemo(
    () =>
      dataFromState(state).unassignedInvoices.map((item, index) => ({
        index: index + 1,
        item
      })),
    [state]
  );

  const unmatchedHoursRows = useMemo(
    () =>
      dataFromState(state).unmatchedHours.map((item, index) => ({
        index: index + 1,
        item
      })),
    [state]
  );

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Dashboard" title="Dashboard" />
        <div className="module-page__stats module-page__stats--compact">
          {Array.from({ length: 4 }).map((_, index) => (
            <StatCard key={index} label="Ladowanie" value="..." hint="Trwa pobieranie snapshotu" />
          ))}
        </div>
        <Panel title="Snapshot kontraktow">
          <p className="status-message">Trwa odczyt danych.</p>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Dashboard"
          title="Dashboard"
          actions={
            <ActionButton type="button" onClick={() => setRefreshTick((value) => value + 1)}>
              Sprobuj ponownie
            </ActionButton>
          }
        />
        <Panel title="Blad odczytu" description={state.message}>
          <p className="panel__description">
            Sprawdz dostepnosc backendu lub sesje uzytkownika, a potem odswiez dashboard.
          </p>
        </Panel>
      </div>
    );
  }

  if (state.data.contracts.length === 0 && state.data.unassignedInvoices.length === 0) {
    return (
      <div className="module-page">
        <SectionHeader
          eyebrow="Dashboard"
          title="Dashboard"
          actions={
            <ActionButton type="button" onClick={() => setRefreshTick((value) => value + 1)}>
              Odswiez
            </ActionButton>
          }
        />
        <Panel title="Pusty stan">
          <p className="panel__description">
            Backend zwrocil pusty snapshot. Gdy pojawia sie kontrakty, faktury lub godziny,
            dashboard wypelni sie automatycznie.
          </p>
        </Panel>
      </div>
    );
  }

  const { data } = state;

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Dashboard"
        title="Dashboard"
        actions={
          <ActionButton
            type="button"
            variant="secondary"
            onClick={() => setRefreshTick((value) => value + 1)}
          >
            Odswiez snapshot
          </ActionButton>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {data.summary.slice(0, 4).map((item) => (
          <StatCard
            key={item.id}
            label={item.label}
            value={item.value}
            accent={item.accent}
            hint={item.hint}
          />
        ))}
      </div>

      <Panel className="panel--toolbar" title="Tryb pracy dashboardu">
        <div className="dashboard-toolbar">
          <div className="dashboard-toolbar__tabs">
            <ActionButton
              type="button"
              variant={mode === "contracts" ? "primary" : "secondary"}
              onClick={() => setMode("contracts")}
            >
              Kontrakty
            </ActionButton>
            <ActionButton
              type="button"
              variant={mode === "unassigned" ? "primary" : "secondary"}
              onClick={() => setMode("unassigned")}
            >
              Nieprzypisane
            </ActionButton>
          </div>
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj kontraktu"
          />
        </div>
      </Panel>

      {mode === "contracts" ? (
        <>
          <Panel title="Kontrakty">
            <DataTable
              columns={contractColumns}
              rows={contractRows}
              rowKey={(row) => row.item.contract.id}
              tableClassName="dashboard-table dashboard-table--investments"
              onRowClick={(row) => setSelectedContractId(row.item.contract.id)}
              getRowClassName={(row) =>
                row.item.contract.id === selectedContract?.contract.id
                  ? "data-table__row--active"
                  : undefined
              }
              emptyMessage="Brak kontraktow dla podanego filtra."
            />
          </Panel>

          {selectedContract ? (
            <>
              <Panel
                title={`Wybrany kontrakt: ${
                  selectedContract.contract.contract_number
                    ? `${selectedContract.contract.contract_number} - ${selectedContract.contract.name}`
                    : selectedContract.contract.name
                }`}
              >
                <div className="module-page__stats module-page__stats--compact">
                  <StatCard label="Sprzedaż" value={formatMoney(selectedContract.metrics.revenue_total)} accent />
                  <StatCard label="Koszt" value={formatMoney(selectedContract.metrics.cost_total)} />
                  <StatCard label="Godziny" value={formatHours(selectedContract.metrics.labor_hours_total)} />
                  <StatCard label="Marża" value={formatMoney(selectedContract.metrics.margin)} />
                </div>
              </Panel>

              <Panel title="Rozbicie miesieczne">
                <DataTable
                  columns={monthlyColumns}
                  rows={monthlyRows}
                  rowKey={(row) => row.item.month_key}
                  tableClassName="dashboard-table dashboard-table--monthly"
                  emptyMessage="Brak miesiecznego rozbicia dla wybranego kontraktu."
                />
              </Panel>
            </>
          ) : null}
        </>
      ) : (
        <>
          <Panel title="Snapshot nieprzypisanych pozycji">
            <div className="module-page__stats module-page__stats--compact">
              <StatCard
                label="Faktury kosztowe"
                value={formatInteger(data.unassigned.cost_invoice_count)}
              />
              <StatCard
                label="Koszty netto"
                value={formatMoney(data.unassigned.invoice_cost_total)}
              />
              <StatCard
                label="Faktury sprzedażowe"
                value={formatInteger(data.unassigned.sales_invoice_count)}
                accent
              />
              <StatCard
                label="Faktury sprzedażowe netto"
                value={formatMoney(data.unassigned.revenue_total)}
              />
              <StatCard
                label="Godziny poza kontraktami"
                value={formatHours(data.unassigned.labor_hours_total)}
              />
              <StatCard
                label="Koszt wynagrodzeń"
                value={formatMoney(data.unassigned.labor_cost_total)}
              />
            </div>
          </Panel>

          <Panel title="Nieprzypisane faktury">
            <DataTable
              columns={unassignedInvoiceColumns}
              rows={unassignedInvoiceRows}
              rowKey={(row) => row.item.id}
              tableClassName="dashboard-table dashboard-table--unassigned"
              emptyMessage="Brak nieprzypisanych faktur w aktualnym snapshotcie."
            />
          </Panel>

          <Panel title="Godziny poza kontraktami">
            <DataTable
              columns={unmatchedHoursColumns}
              rows={unmatchedHoursRows}
              rowKey={(row, index) => `${row.item.source_name}-${index}`}
              tableClassName="dashboard-table dashboard-table--hours"
              emptyMessage="Brak godzin poza kontraktami."
            />
          </Panel>
        </>
      )}

      <SectionHeader
        eyebrow="Dashboard"
        title="Wykresy kontraktu"
      />
      <DashboardContractCharts contract={selectedContract} />
    </div>
  );
}
