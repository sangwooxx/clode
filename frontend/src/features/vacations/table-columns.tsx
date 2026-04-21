"use client";

import { ActionButton } from "@/components/ui/action-button";
import { type DataTableColumn } from "@/components/ui/data-table";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import {
  formatVacationDateRange,
  formatVacationDays,
  formatVacationStatus,
  formatVacationType,
  normalizeVacationStatus,
} from "@/features/vacations/formatters";
import type {
  VacationApprovalRow,
  VacationEmployeeRow,
  VacationHistoryRow,
} from "@/features/vacations/types";

export function buildVacationEmployeeTableColumns(): Array<DataTableColumn<VacationEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "vacations-col-employee",
      sortValue: (row) =>
        `${formatEmployeeDisplayName(row.employee, row.employee.name)} ${row.employee.worker_code}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatEmployeeDisplayName(row.employee, row.employee.name)}
          </span>
          <span className="data-table__secondary">
            {row.employee.position || "Bez stanowiska"} • Kod{" "}
            {formatEmployeeCodeLabel(row.employee.worker_code)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status i wpisy",
      className: "vacations-col-status",
      sortValue: (row) => `${row.employee.status} ${row.stats.requests_count}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.employee.status === "inactive"
                ? "data-table__status-pill data-table__status-pill--muted"
                : "data-table__status-pill"
            }
          >
            {row.employee.status === "inactive" ? "Nieaktywny" : "Aktywny"}
          </span>
          <span className="data-table__secondary">
            {row.stats.requests_count} wpisów • {row.stats.approved_requests} zatwierdz.
          </span>
        </div>
      ),
    },
    {
      key: "pool",
      header: "Pula",
      className: "vacations-col-pool",
      sortValue: (row) => row.stats.remaining_days,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.stats.total_pool)} dni</span>
          <span className="data-table__secondary">
            Pozostało {formatVacationDays(row.stats.remaining_days)} dni
          </span>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Wykorzystanie",
      className: "vacations-col-usage",
      sortValue: (row) => row.stats.used_days,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            Wykorzystane {formatVacationDays(row.stats.used_days)}
          </span>
          <span className="data-table__secondary">
            Oczekujące {formatVacationDays(row.stats.pending_days)}
          </span>
        </div>
      ),
    },
  ];
}

export function buildVacationHistoryTableColumns(args: {
  canWrite: boolean;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
}): Array<DataTableColumn<VacationHistoryRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "range",
      header: "Zakres i typ",
      className: "vacations-col-range",
      sortValue: (row) => `${row.request.start_date} ${row.request.end_date} ${row.request.type}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationType(row.request.type)}</span>
          <span className="data-table__secondary">
            {formatVacationDateRange(row.request.start_date, row.request.end_date)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Dni / status",
      className: "vacations-col-status",
      sortValue: (row) => `${normalizeVacationStatus(row.request.status)} ${row.request.days}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.request.days)} dni</span>
          <span className="data-table__secondary">
            <span
              className={
                normalizeVacationStatus(row.request.status) === "approved"
                  ? "data-table__status-pill"
                  : normalizeVacationStatus(row.request.status) === "rejected"
                    ? "data-table__status-pill data-table__status-pill--muted"
                    : "data-table__status-pill data-table__status-pill--warning"
              }
            >
              {formatVacationStatus(row.request.status)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "meta",
      header: "Operacyjnie",
      className: "vacations-col-meta",
      sortValue: (row) => `${row.request.requested_by || ""} ${row.request.notes || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.request.requested_by || "Brak autora"}</span>
          <span className="data-table__secondary">{row.request.notes || "Bez uwag"}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "vacations-col-actions",
      sortable: false,
      render: (row) => (
        <div className="vacations-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onEdit(row.request.id);
            }}
          >
            Edytuj
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onDelete(row.request.id);
            }}
          >
            Usuń
          </ActionButton>
        </div>
      ),
    },
  ];
}

export function buildVacationApprovalTableColumns(args: {
  canWrite: boolean;
  canApprove: boolean;
  onEdit: (requestId: string) => void;
  onDelete: (requestId: string) => void;
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}): Array<DataTableColumn<VacationApprovalRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "vacations-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "vacations-col-employee",
      sortValue: (row) => `${row.displayName} ${row.subtitle}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.displayName}</span>
          <span className="data-table__secondary">{row.subtitle}</span>
        </div>
      ),
    },
    {
      key: "range",
      header: "Zakres i typ",
      className: "vacations-col-range",
      sortValue: (row) => `${row.request.start_date} ${row.request.end_date} ${row.request.type}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationType(row.request.type)}</span>
          <span className="data-table__secondary">
            {formatVacationDateRange(row.request.start_date, row.request.end_date)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status / dni",
      className: "vacations-col-status",
      sortValue: (row) => `${normalizeVacationStatus(row.request.status)} ${row.request.days}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatVacationDays(row.request.days)} dni</span>
          <span className="data-table__secondary">
            <span
              className={
                normalizeVacationStatus(row.request.status) === "approved"
                  ? "data-table__status-pill"
                  : normalizeVacationStatus(row.request.status) === "rejected"
                    ? "data-table__status-pill data-table__status-pill--muted"
                    : "data-table__status-pill data-table__status-pill--warning"
              }
            >
              {formatVacationStatus(row.request.status)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "meta",
      header: "Operacyjnie",
      className: "vacations-col-meta",
      sortValue: (row) => `${row.request.requested_by || ""} ${row.request.notes || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.request.requested_by || "Brak autora"}</span>
          <span className="data-table__secondary">{row.request.notes || "Bez uwag"}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "vacations-col-actions",
      sortable: false,
      render: (row) => (
        <div className="vacations-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onEdit(row.request.id);
            }}
          >
            Edytuj
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!args.canWrite}
            onClick={(event) => {
              event.stopPropagation();
              args.onDelete(row.request.id);
            }}
          >
            Usuń
          </ActionButton>
          <ActionButton
            type="button"
            disabled={!args.canApprove}
            onClick={(event) => {
              event.stopPropagation();
              args.onApprove(row.request.id);
            }}
          >
            Zatwierdź
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!args.canApprove}
            onClick={(event) => {
              event.stopPropagation();
              args.onReject(row.request.id);
            }}
          >
            Odrzuć
          </ActionButton>
        </div>
      ),
    },
  ];
}
