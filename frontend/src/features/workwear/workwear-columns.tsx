"use client";

import { ActionButton } from "@/components/ui/action-button";
import type { DataTableColumn } from "@/components/ui/data-table";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import { formatWorkwearDate, formatWorkwearQuantity } from "@/features/workwear/formatters";
import type {
  WorkwearAttentionRow,
  WorkwearCatalogRow,
  WorkwearEmployeeRow,
  WorkwearIssueEntry,
  WorkwearIssueRow,
} from "@/features/workwear/types";

type WorkwearIssueColumnHandlers = {
  canWrite: boolean;
  onEditIssue: (entry: WorkwearIssueEntry) => void;
  onDeleteIssue: (entry: WorkwearIssueEntry) => void;
};

type WorkwearCatalogColumnHandlers = {
  canWrite: boolean;
  onEditCatalogItem: (row: WorkwearCatalogRow) => void;
  onDeleteCatalogItem: (row: WorkwearCatalogRow) => void;
};

export function buildWorkwearEmployeeColumns(): Array<DataTableColumn<WorkwearEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "workwear-col-employee",
      sortValue: (row) =>
        `${formatEmployeeDisplayName(row.employee, row.employee.name)} ${row.employee.worker_code}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatEmployeeDisplayName(row.employee, row.employee.name)}
          </span>
          <span className="data-table__secondary">
            {row.employee.position || "Bez stanowiska"} • Kod {formatEmployeeCodeLabel(row.employee.worker_code)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "workwear-col-status",
      sortValue: (row) => `${row.employee.status} ${row.issuesCount}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.employee.status === "inactive"
                ? "data-table__status-pill data-table__status-pill--muted"
                : "data-table__status-pill"
            }
          >
            {row.employee.status === "inactive" ? "Historia" : "Aktywny"}
          </span>
          <span className="data-table__secondary">
            {row.issuesCount > 0 ? `${row.issuesCount} wydań` : "Brak wydań"}
          </span>
        </div>
      ),
    },
    {
      key: "issues",
      header: "Wydania",
      className: "workwear-col-issues",
      sortValue: (row) => row.totalQuantity,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatWorkwearQuantity(row.totalQuantity)} szt.</span>
          <span className="data-table__secondary">
            {row.lastItemName ? `Ostatnio: ${row.lastItemName}` : "Bez historii"}
          </span>
        </div>
      ),
    },
    {
      key: "last_issue",
      header: "Ostatnie wydanie",
      className: "workwear-col-date",
      sortValue: (row) => row.lastIssueDate,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.lastIssueDate ? formatWorkwearDate(row.lastIssueDate) : "Brak"}
          </span>
          <span className="data-table__secondary">
            {row.lastIssueDate ? row.lastIssueDate : "Brak wpisów"}
          </span>
        </div>
      ),
    },
  ];
}

export function buildWorkwearIssueColumns({
  canWrite,
  onEditIssue,
  onDeleteIssue,
}: WorkwearIssueColumnHandlers): Array<DataTableColumn<WorkwearIssueRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "issue",
      header: "Data i element",
      className: "workwear-col-issue",
      sortValue: (row) => `${row.entry.issue.issue_date} ${row.entry.issue.item_name || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.item_name || "Element spoza katalogu"}
          </span>
          <span className="data-table__secondary">{formatWorkwearDate(row.entry.issue.issue_date)}</span>
        </div>
      ),
    },
    {
      key: "spec",
      header: "Rozmiar / ilość",
      className: "workwear-col-spec",
      sortValue: (row) => `${row.entry.issue.size || ""} ${row.entry.issue.quantity}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.size || "UNI"} • {formatWorkwearQuantity(row.entry.issue.quantity)} szt.
          </span>
          <span className="data-table__secondary">
            {row.entry.item?.category || "Bez kategorii"}
          </span>
        </div>
      ),
    },
    {
      key: "state",
      header: "Semantyka wpisu",
      className: "workwear-col-state",
      sortValue: (row) => `${row.entry.resolution} ${row.entry.issue.notes || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.entry.resolution === "ambiguous" || row.entry.resolution === "missing_employee"
                ? "data-table__status-pill data-table__status-pill--warning"
                : row.entry.isHistorical
                  ? "data-table__status-pill data-table__status-pill--muted"
                  : "data-table__status-pill"
            }
          >
            {row.entry.resolutionLabel}
          </span>
          <span className="data-table__secondary">{row.entry.issue.notes || "Bez uwag"}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "workwear-col-actions",
      sortable: false,
      render: (row) =>
        canWrite ? (
          <div className="workwear-row-actions">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                onEditIssue(row.entry);
              }}
            >
              Edytuj
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteIssue(row.entry);
              }}
            >
              Usuń
            </ActionButton>
          </div>
        ) : (
          <span className="data-table__secondary">Podgląd</span>
        ),
    },
  ];
}

export function buildWorkwearCatalogColumns({
  canWrite,
  onEditCatalogItem,
  onDeleteCatalogItem,
}: WorkwearCatalogColumnHandlers): Array<DataTableColumn<WorkwearCatalogRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "item",
      header: "Element",
      className: "workwear-col-item",
      sortValue: (row) => `${row.item.name} ${row.item.category || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.name}</span>
          <span className="data-table__secondary">{row.item.category || "Bez kategorii"}</span>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Wydania",
      className: "workwear-col-issues",
      sortValue: (row) => row.issuesCount,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.issuesCount}</span>
          <span className="data-table__secondary">
            {row.activeAssignments} aktywnych pracowników
          </span>
        </div>
      ),
    },
    {
      key: "notes",
      header: "Standard",
      className: "workwear-col-notes",
      sortValue: (row) => `${row.item.notes || ""} ${row.lastIssueDate || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.notes || "Bez opisu"}</span>
          <span className="data-table__secondary">
            {row.lastIssueDate ? `Ostatnie: ${formatWorkwearDate(row.lastIssueDate)}` : "Brak wydań"}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "workwear-col-actions",
      sortable: false,
      render: (row) =>
        canWrite ? (
          <div className="workwear-row-actions">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                onEditCatalogItem(row);
              }}
            >
              Edytuj
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                onDeleteCatalogItem(row);
              }}
            >
              Usuń
            </ActionButton>
          </div>
        ) : (
          <span className="data-table__secondary">Podgląd</span>
        ),
    },
  ];
}

export function buildWorkwearAttentionColumns(): Array<DataTableColumn<WorkwearAttentionRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "entry",
      header: "Wpis legacy",
      className: "workwear-col-issue",
      sortValue: (row) => `${row.entry.issue.issue_date} ${row.entry.issue.employee_name || ""} ${row.entry.issue.item_name || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.employee_name || "Brak pracownika"} • {row.entry.issue.item_name}
          </span>
          <span className="data-table__secondary">{formatWorkwearDate(row.entry.issue.issue_date)}</span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Powód",
      className: "workwear-col-notes",
      sortValue: (row) => row.reason,
      render: (row) => row.reason,
    },
  ];
}
