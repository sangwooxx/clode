"use client";

import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { buildEmployeesTableColumns } from "@/features/employees/table-columns";
import type {
  EmployeeDirectoryRecord,
  EmployeeTableRow,
} from "@/features/employees/types";

type EmployeesDirectoryTableProps = {
  rows: EmployeeTableRow[];
  selectedEmployeeKey: string | null | undefined;
  onSelectEmployee: (employee: EmployeeDirectoryRecord) => void;
};

export function EmployeesDirectoryTable({
  rows,
  selectedEmployeeKey,
  onSelectEmployee,
}: EmployeesDirectoryTableProps) {
  return (
    <Panel title="Lista pracownikow">
      <DataTable
        columns={buildEmployeesTableColumns()}
        rows={rows}
        emptyMessage="Brak pracownikow dla biezacych filtrow."
        rowKey={(row) => row.employee.key}
        onRowClick={(row) => onSelectEmployee(row.employee)}
        getRowClassName={(row) =>
          row.employee.key === selectedEmployeeKey ? "data-table__row--active" : undefined
        }
        tableClassName="employees-table"
      />
    </Panel>
  );
}
