import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { formatTimestamp } from "@/features/settings/components/settings-formatters";
import type { SettingsAuditLogEntry } from "@/features/settings/types";

type SettingsAuditPanelProps = {
  rows: SettingsAuditLogEntry[];
  search: string;
  onSearchChange: (value: string) => void;
};

function buildAuditTableColumns(): Array<DataTableColumn<SettingsAuditLogEntry>> {
  return [
    {
      key: "timestamp",
      header: "Data i użytkownik",
      className: "settings-col-audit-date",
      sortValue: (row) => row.timestamp,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatTimestamp(row.timestamp)}</span>
          <span className="data-table__secondary">{row.user_name || "System"}</span>
        </div>
      ),
    },
    {
      key: "change",
      header: "Zmiana",
      className: "settings-col-audit-change",
      sortValue: (row) => `${row.action || ""} ${row.module || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.action || "-"}</span>
          <span className="data-table__secondary">{row.module || "-"}</span>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Obiekt",
      className: "settings-col-audit-subject",
      sortValue: (row) => `${row.subject || ""} ${row.user_id || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.subject || "-"}</span>
          <span className="data-table__secondary">{row.user_id || "-"}</span>
        </div>
      ),
    },
    {
      key: "details",
      header: "Szczegóły",
      className: "settings-col-audit-details",
      sortValue: (row) => row.details,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.details || "Brak dodatkowych szczegółów"}</span>
        </div>
      ),
    },
  ];
}

export function SettingsAuditPanel({ rows, search, onSearchChange }: SettingsAuditPanelProps) {
  const columns = useMemo(() => buildAuditTableColumns(), []);

  return (
    <Panel title="Rejestr zmian">
      <div className="settings-audit-toolbar">
        <SearchField
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Szukaj po użytkowniku, module, akcji lub obiekcie"
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyMessage="Rejestr zmian jest pusty."
        tableClassName="settings-table settings-table--audit"
      />
    </Panel>
  );
}
