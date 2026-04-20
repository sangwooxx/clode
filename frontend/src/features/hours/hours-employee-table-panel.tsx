import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatEmployeeCodeLabel } from "@/features/employees/formatters";
import { formatContractStatusLabel, formatHours, formatMoney, formatNumber } from "@/features/hours/formatters";
import type { HoursEmployeeRow, HoursContractSummaryRow } from "@/features/hours/view-types";

function buildHoursEmployeeColumns(handlers: {
  canWrite: boolean;
  onOpenCorrection: (row: HoursEmployeeRow) => void;
}): Array<DataTableColumn<HoursEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "hours-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "hours-col-employee",
      sortValue: (row) => `${row.employeeLabel} ${row.employeeCode}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.employeeLabel}</span>
          <span className="data-table__secondary">
            {row.employeePosition} | Kod {formatEmployeeCodeLabel(row.employeeCode, "—")}
          </span>
          {row.employeeStatus === "inactive" ? (
            <span className="data-table__status-pill data-table__status-pill--muted">
              Historia • nieaktywny
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "contracts",
      header: "Kontrakty i godziny",
      className: "hours-col-contracts",
      sortValue: (row) => row.contracts.map((contract) => contract.label).join(" "),
      render: (row) => (
        <div className="hours-contract-list">
          {row.contracts.map((contract) => (
            <div
              key={contract.key}
              className={
                contract.status === "active"
                  ? "hours-contract-pill"
                  : "hours-contract-pill hours-contract-pill--muted"
              }
            >
              <span className="hours-contract-pill__name">{contract.label}</span>
              <span className="hours-contract-pill__meta">
                {contract.code} • {formatHours(contract.hours)}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "hours",
      header: "Suma godzin",
      className: "data-table__numeric hours-col-hours",
      sortValue: (row) => row.totalHours,
      render: (row) => formatHours(row.totalHours),
    },
    {
      key: "cost",
      header: "Koszt",
      className: "data-table__numeric hours-col-money",
      sortValue: (row) => row.totalCost,
      render: (row) => formatMoney(row.totalCost),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "hours-col-actions",
      sortable: false,
      render: (row) =>
        handlers.canWrite ? (
          <div className="contracts-table__actions-stack">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                handlers.onOpenCorrection(row);
              }}
            >
              {row.employeeStatus === "inactive" ? "Historia" : "Korekta"}
            </ActionButton>
          </div>
        ) : (
          <span className="data-table__secondary">Podgląd</span>
        ),
    },
  ];
}

export const hoursContractSummaryColumns: Array<DataTableColumn<HoursContractSummaryRow>> = [
  {
    key: "lp",
    header: "Lp.",
    className: "hours-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index,
  },
  {
    key: "contract",
    header: "Kontrakt",
    className: "hours-col-contract",
    sortValue: (row) => `${row.option.label} ${row.option.code}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.option.label}</span>
        <span className="data-table__secondary">ID: {row.option.code}</span>
      </div>
    ),
  },
  {
    key: "status",
    header: "Status",
    className: "hours-col-status",
    sortValue: (row) => row.option.status,
    render: (row) => (
      <span
        className={
          row.option.status === "active"
            ? "data-table__status-pill"
            : "data-table__status-pill data-table__status-pill--muted"
        }
      >
        {formatContractStatusLabel(row.option.status)}
      </span>
    ),
  },
  {
    key: "entries",
    header: "Wpisy",
    className: "data-table__numeric hours-col-count",
    sortValue: (row) => row.aggregate.entries_count,
    render: (row) => formatNumber(row.aggregate.entries_count),
  },
  {
    key: "hours",
    header: "Godziny",
    className: "data-table__numeric hours-col-hours",
    sortValue: (row) => row.aggregate.hours_total,
    render: (row) => formatHours(row.aggregate.hours_total),
  },
  {
    key: "cost",
    header: "Koszt",
    className: "data-table__numeric hours-col-money",
    sortValue: (row) => row.aggregate.cost_total,
    render: (row) => formatMoney(row.aggregate.cost_total),
  },
];

type HoursEmployeeTablePanelProps = {
  rows: HoursEmployeeRow[];
  canWrite: boolean;
  selectedEmployeeRowKey: string | null;
  monthEntriesCount: number;
  onOpenCorrection: (row: HoursEmployeeRow) => void;
  onSelectRow: (row: HoursEmployeeRow) => void;
};

export function HoursEmployeeTablePanel({
  rows,
  canWrite,
  selectedEmployeeRowKey,
  monthEntriesCount,
  onOpenCorrection,
  onSelectRow,
}: HoursEmployeeTablePanelProps) {
  return (
    <Panel title="Zbiorcza ewidencja pracowników">
      <DataTable
        columns={buildHoursEmployeeColumns({ canWrite, onOpenCorrection })}
        rows={rows}
        rowKey={(row) => row.key}
        tableClassName="hours-employee-table"
        onRowClick={(row) => onSelectRow(row)}
        getRowClassName={(row) => (row.key === selectedEmployeeRowKey ? "data-table__row--active" : undefined)}
        emptyMessage={
          monthEntriesCount === 0
            ? "Brak wpisów czasu pracy w wybranym miesiącu."
            : "Brak pracowników dla podanego wyszukiwania."
        }
      />
    </Panel>
  );
}
