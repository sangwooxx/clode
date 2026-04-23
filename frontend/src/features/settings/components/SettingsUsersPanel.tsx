import { useMemo } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import {
  buildPermissionLabels,
  formatRoleLabel,
  formatStatusLabel,
  formatTimestamp,
} from "@/features/settings/components/settings-formatters";
import type { SettingsUsersFilter } from "@/features/settings/types";
import type { ManagedUserRecord } from "@/lib/api/users";

type SettingsUsersPanelProps = {
  currentUserId: string;
  editingUserId: string | null;
  filter: SettingsUsersFilter;
  search: string;
  rows: ManagedUserRecord[];
  showTable: boolean;
  onEdit: (user: ManagedUserRecord) => void;
  onFilterChange: (nextFilter: SettingsUsersFilter) => void;
  onSearchChange: (value: string) => void;
  onSelect: (user: ManagedUserRecord) => void;
};

function buildUsersTableColumns(args: {
  currentUserId: string;
  onEdit: (user: ManagedUserRecord) => void;
}): Array<DataTableColumn<ManagedUserRecord>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "settings-col-lp",
      sortValue: (_row, index) => index + 1,
      render: (_row, index) => index + 1,
    },
    {
      key: "user",
      header: "Konto",
      className: "settings-col-user",
      sortValue: (row) => `${row.name} ${row.username} ${row.email || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.name}</span>
          <span className="data-table__secondary">
            {row.username}
            {row.email ? ` • ${row.email}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "access",
      header: "Dostęp",
      className: "settings-col-access",
      sortValue: (row) => `${row.role || ""} ${row.status || ""} ${row.canApproveVacations ? "1" : "0"}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatRoleLabel(row.role)}</span>
          <span className="data-table__secondary">
            <span
              className={
                row.status === "inactive"
                  ? "data-table__status-pill data-table__status-pill--muted"
                  : "data-table__status-pill"
              }
            >
              {formatStatusLabel(row.status)}
            </span>
            {row.canApproveVacations ? " • Akceptuje urlopy" : ""}
          </span>
        </div>
      ),
    },
    {
      key: "modules",
      header: "Uprawnienia",
      className: "settings-col-modules",
      sortValue: (row) => buildPermissionLabels(row.permissions).length,
      render: (row) => {
        const labels = buildPermissionLabels(row.permissions);
        return (
          <div className="data-table__stack">
            <span className="data-table__primary">{labels.length} modułów</span>
            <span className="data-table__secondary">
              {labels.length ? labels.join(", ") : "Brak dostępu do modułów"}
            </span>
          </div>
        );
      },
    },
    {
      key: "activity",
      header: "Aktywność",
      className: "settings-col-activity",
      sortValue: (row) => row.last_login_at || row.created_at,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.last_login_at ? formatTimestamp(row.last_login_at) : "Brak logowania"}
          </span>
          <span className="data-table__secondary">Utworzono: {formatTimestamp(row.created_at)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "settings-col-actions",
      sortable: false,
      render: (row) => (
        <div className="planning-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              args.onEdit(row);
            }}
          >
            Edytuj
          </ActionButton>
          {row.id === args.currentUserId ? <span className="data-table__secondary">Bieżące konto</span> : null}
        </div>
      ),
    },
  ];
}

export function SettingsUsersPanel({
  currentUserId,
  editingUserId,
  filter,
  search,
  rows,
  showTable,
  onEdit,
  onFilterChange,
  onSearchChange,
  onSelect,
}: SettingsUsersPanelProps) {
  const columns = useMemo(
    () =>
      buildUsersTableColumns({
        currentUserId,
        onEdit,
      }),
    [currentUserId, onEdit],
  );

  return (
    <>
      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="settings-toolbar">
          <div className="toolbar-tabs">
            <ActionButton type="button" variant={filter === "all" ? "primary" : "secondary"} onClick={() => onFilterChange("all")}>
              Wszystkie
            </ActionButton>
            <ActionButton type="button" variant={filter === "active" ? "primary" : "secondary"} onClick={() => onFilterChange("active")}>
              Aktywne
            </ActionButton>
            <ActionButton type="button" variant={filter === "inactive" ? "primary" : "secondary"} onClick={() => onFilterChange("inactive")}>
              Nieaktywne
            </ActionButton>
          </div>
          <SearchField
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Szukaj po nazwie, loginie, e-mailu lub roli"
          />
        </div>
      </Panel>

      {showTable ? (
        <Panel title="Konta użytkowników">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            emptyMessage="Brak kont użytkowników dla bieżącego filtra."
            onRowClick={onSelect}
            getRowClassName={(row) => (row.id === editingUserId ? "data-table__row--active" : undefined)}
            tableClassName="settings-table"
          />
        </Panel>
      ) : null}
    </>
  );
}
