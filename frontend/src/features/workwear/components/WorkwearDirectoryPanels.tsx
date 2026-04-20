"use client";

import { DataTable } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import { formatWorkwearDate, formatWorkwearQuantity } from "@/features/workwear/formatters";
import {
  buildWorkwearAttentionColumns,
  buildWorkwearCatalogColumns,
  buildWorkwearEmployeeColumns,
  buildWorkwearIssueColumns,
} from "@/features/workwear/workwear-columns";
import type {
  WorkwearAttentionRow,
  WorkwearCatalogRow,
  WorkwearEmployeeRow,
  WorkwearIssueEntry,
  WorkwearIssueRow,
} from "@/features/workwear/types";

type WorkwearDirectoryPanelsProps = {
  activeRows: WorkwearEmployeeRow[];
  historicalRows: WorkwearEmployeeRow[];
  selectedEmployeeKey: string | null;
  selectedEmployee: EmployeeDirectoryRecord | null;
  selectedIssueRows: WorkwearIssueRow[];
  canWrite: boolean;
  onSelectEmployee: (employee: EmployeeDirectoryRecord) => void;
  onEditIssue: (entry: WorkwearIssueEntry) => void;
  onDeleteIssue: (entry: WorkwearIssueEntry) => void;
};

type WorkwearAttentionPanelProps = {
  attentionRows: WorkwearAttentionRow[];
};

type WorkwearCatalogPanelProps = {
  rows: WorkwearCatalogRow[];
  canWrite: boolean;
  onEditCatalogItem: (row: WorkwearCatalogRow) => void;
  onDeleteCatalogItem: (row: WorkwearCatalogRow) => void;
};

function WorkwearActiveEmployeesPanel({
  rows,
  selectedEmployeeKey,
  onSelectEmployee,
}: {
  rows: WorkwearEmployeeRow[];
  selectedEmployeeKey: string | null;
  onSelectEmployee: (employee: EmployeeDirectoryRecord) => void;
}) {
  const columns = buildWorkwearEmployeeColumns();

  return (
    <Panel title="Aktywni pracownicy">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.employee.key}
        onRowClick={(row) => onSelectEmployee(row.employee)}
        getRowClassName={(row) => (row.employee.key === selectedEmployeeKey ? "data-table__row--active" : undefined)}
        tableClassName="workwear-table"
        emptyMessage="Brak aktywnych pracowników dla tego filtra."
      />
    </Panel>
  );
}

function WorkwearHistoricalEmployeesPanel({
  rows,
  selectedEmployeeKey,
  onSelectEmployee,
}: {
  rows: WorkwearEmployeeRow[];
  selectedEmployeeKey: string | null;
  onSelectEmployee: (employee: EmployeeDirectoryRecord) => void;
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Panel title="Historia pracowników nieaktywnych">
      <div className="workwear-history-list">
        {rows.map((row) => (
          <button
            key={row.employee.key}
            type="button"
            className={`workwear-history-list__item${row.employee.key === selectedEmployeeKey ? " is-active" : ""}`}
            onClick={() => onSelectEmployee(row.employee)}
          >
            <strong>{row.employee.name}</strong>
            <span>
              {row.issuesCount} wydań • ostatnio{" "}
              {row.lastIssueDate ? formatWorkwearDate(row.lastIssueDate) : "brak"}
            </span>
          </button>
        ))}
      </div>
    </Panel>
  );
}

function WorkwearSelectionPanel({
  selectedEmployee,
  selectedIssueRows,
  onEditIssue,
  onDeleteIssue,
  canWrite,
}: {
  selectedEmployee: EmployeeDirectoryRecord | null;
  selectedIssueRows: WorkwearIssueRow[];
  onEditIssue: (entry: WorkwearIssueEntry) => void;
  onDeleteIssue: (entry: WorkwearIssueEntry) => void;
  canWrite: boolean;
}) {
  const columns = buildWorkwearIssueColumns({
    canWrite,
    onEditIssue,
    onDeleteIssue,
  });
  const totalQuantity = selectedIssueRows.reduce((sum, row) => sum + Number(row.entry.issue.quantity || 0), 0);

  return (
    <Panel
      title={
        selectedEmployee
          ? `Karta wydań: ${formatEmployeeDisplayName(selectedEmployee, selectedEmployee.name)}`
          : "Karta wydań pracownika"
      }
    >
      {selectedEmployee ? (
        <div className="workwear-spotlight">
          <div className="workwear-detail-grid">
            <div className="workwear-detail-card">
              <small>Status</small>
              <strong>{selectedEmployee.status === "inactive" ? "Nieaktywny" : "Aktywny"}</strong>
            </div>
            <div className="workwear-detail-card">
              <small>Kod i stanowisko</small>
              <strong>
                {formatEmployeeCodeLabel(selectedEmployee.worker_code)} •{" "}
                {selectedEmployee.position || "Bez stanowiska"}
              </strong>
            </div>
            <div className="workwear-detail-card">
              <small>Liczba wydań</small>
              <strong>{selectedIssueRows.length}</strong>
            </div>
            <div className="workwear-detail-card">
              <small>Łączna ilość</small>
              <strong>{formatWorkwearQuantity(totalQuantity)} szt.</strong>
            </div>
          </div>
          <DataTable
            columns={columns}
            rows={selectedIssueRows}
            rowKey={(row) => row.entry.issue.id}
            tableClassName="workwear-table"
            emptyMessage="Brak wydań dla tego pracownika."
          />
        </div>
      ) : (
        <p className="status-message">Wybierz pracownika z listy, aby zobaczyć jego kartę.</p>
      )}
    </Panel>
  );
}

export function WorkwearDirectoryPanels({
  activeRows,
  historicalRows,
  selectedEmployeeKey,
  selectedEmployee,
  selectedIssueRows,
  canWrite,
  onSelectEmployee,
  onEditIssue,
  onDeleteIssue,
}: WorkwearDirectoryPanelsProps) {
  return (
    <>
      <WorkwearActiveEmployeesPanel
        rows={activeRows}
        selectedEmployeeKey={selectedEmployeeKey}
        onSelectEmployee={onSelectEmployee}
      />
      <WorkwearHistoricalEmployeesPanel
        rows={historicalRows}
        selectedEmployeeKey={selectedEmployeeKey}
        onSelectEmployee={onSelectEmployee}
      />
      <WorkwearSelectionPanel
        selectedEmployee={selectedEmployee}
        selectedIssueRows={selectedIssueRows}
        canWrite={canWrite}
        onEditIssue={onEditIssue}
        onDeleteIssue={onDeleteIssue}
      />
    </>
  );
}

export function WorkwearAttentionPanel({ attentionRows }: WorkwearAttentionPanelProps) {
  if (attentionRows.length === 0) {
    return null;
  }

  return (
    <Panel title="Wpisy wymagające uwagi">
      <DataTable
        columns={buildWorkwearAttentionColumns()}
        rows={attentionRows}
        rowKey={(row) => row.entry.issue.id}
        tableClassName="workwear-table"
      />
    </Panel>
  );
}

export function WorkwearCatalogPanel({
  rows,
  canWrite,
  onEditCatalogItem,
  onDeleteCatalogItem,
}: WorkwearCatalogPanelProps) {
  const columns = buildWorkwearCatalogColumns({
    canWrite,
    onEditCatalogItem,
    onDeleteCatalogItem,
  });

  return (
    <Panel title="Katalog elementów">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.item.id}
        tableClassName="workwear-table"
        emptyMessage="Katalog odzieży jest pusty."
      />
    </Panel>
  );
}
