"use client";

import { type DataTableColumn } from "@/components/ui/data-table";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDate,
  formatEmployeeDisplayName,
  formatEmployeeStatus,
} from "@/features/employees/formatters";
import type { EmployeeTableRow } from "@/features/employees/types";

export function buildEmployeesTableColumns(): Array<DataTableColumn<EmployeeTableRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "employees-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "employees-col-employee",
      sortValue: (row) =>
        `${formatEmployeeDisplayName(row.employee, row.employee.name)} ${row.employee.worker_code}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatEmployeeDisplayName(row.employee, row.employee.name)}
          </span>
          <span className="data-table__secondary">
            {(row.employee.position || "Bez stanowiska")} | Kod{" "}
            {formatEmployeeCodeLabel(row.employee.worker_code)}
          </span>
        </div>
      ),
    },
    {
      key: "hr",
      header: "Kadry",
      className: "employees-col-hr",
      sortValue: (row) => `${row.employee.status} ${row.employee.position}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.employee.position || "Bez stanowiska"}</span>
          <span className="data-table__secondary">
            <span
              className={
                row.employee.status === "inactive"
                  ? "data-table__status-pill data-table__status-pill--muted"
                  : "data-table__status-pill"
              }
            >
              {formatEmployeeStatus(row.employee.status)}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: "employment",
      header: "Zatrudnienie i kontakt",
      className: "employees-col-employment",
      sortValue: (row) => row.employee.employment_date || row.employee.city || row.employee.phone,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {formatEmployeeDate(row.employee.employment_date)}
          </span>
          <span className="data-table__secondary">
            {row.employee.city || row.employee.phone
              ? [row.employee.city, row.employee.phone].filter(Boolean).join(" | ")
              : "Brak danych kontaktowych"}
          </span>
        </div>
      ),
    },
    {
      key: "medical",
      header: "Badania",
      className: "employees-col-medical",
      sortValue: (row) => row.employee.medical_exam_valid_until,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.medical.dateText}</span>
          <span className="data-table__secondary">
            {row.medical.label} | {row.medical.daysText}
          </span>
        </div>
      ),
    },
    {
      key: "relations",
      header: "Powiazania",
      className: "employees-col-relations",
      sortValue: (row) => row.relations.hoursEntries,
      render: (row) => (
        <div className="employees-relation-list">
          <span className="employees-relation-pill">Czas: {row.relations.hoursEntries}</span>
          <span className="employees-relation-pill employees-relation-pill--muted">
            Karty: {row.relations.workCards}
          </span>
          <span className="employees-relation-pill employees-relation-pill--muted">
            Mies.: {row.relations.monthsCount}
          </span>
        </div>
      ),
    },
  ];
}
