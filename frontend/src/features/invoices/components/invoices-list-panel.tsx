import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { type InvoiceTableRow } from "@/features/invoices/invoice-columns";
import type { InvoiceType } from "@/features/invoices/types";

type InvoicesListPanelProps = {
  activeType: InvoiceType;
  canWrite: boolean;
  invoiceSearch: string;
  onInvoiceSearchChange: (value: string) => void;
  onActiveTypeChange: (value: InvoiceType) => void;
  selectedInvoiceIds: string[];
  onBulkDelete: () => void;
  columns: Array<DataTableColumn<InvoiceTableRow>>;
  rows: InvoiceTableRow[];
  selectedInvoiceId: string | null;
  onRowClick: (row: InvoiceTableRow) => void;
};

export function InvoicesListPanel({
  activeType,
  canWrite,
  invoiceSearch,
  onInvoiceSearchChange,
  onActiveTypeChange,
  selectedInvoiceIds,
  onBulkDelete,
  columns,
  rows,
  selectedInvoiceId,
  onRowClick
}: InvoicesListPanelProps) {
  return (
    <Panel>
      <div className="section-header">
        <div>
          <p className="section-header__eyebrow">Lista faktur</p>
          <h2 className="panel__title">
            {activeType === "cost" ? "Faktury kosztowe" : "Faktury sprzedażowe"}
          </h2>
        </div>
        <div className="section-header__actions">
          <div className="toolbar-tabs">
            {(["cost", "sales"] as InvoiceType[]).map((value) => (
              <ActionButton
                key={value}
                type="button"
                variant={activeType === value ? "primary" : "secondary"}
                onClick={() => onActiveTypeChange(value)}
              >
                {value === "cost" ? "Kosztowe" : "Sprzedażowe"}
              </ActionButton>
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar-strip invoices-toolbar-strip">
        <SearchField
          value={invoiceSearch}
          onChange={(event) => onInvoiceSearchChange(event.target.value)}
          placeholder="Szukaj po numerze, kontrahencie lub opisie"
          aria-label="Szukaj faktur"
        />
        {canWrite && selectedInvoiceIds.length > 0 ? (
          <ActionButton type="button" variant="ghost" onClick={onBulkDelete}>
            Usuń zaznaczone ({selectedInvoiceIds.length})
          </ActionButton>
        ) : (
          <span className="toolbar-strip__meta">Zaznaczone: {selectedInvoiceIds.length}</span>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Brak faktur dla wybranego zakresu."
        rowKey={(row) => row.item.id}
        onRowClick={onRowClick}
        getRowClassName={(row) =>
          row.item.id === selectedInvoiceId ? "data-table__row--active" : undefined
        }
        tableClassName="invoices-table"
      />
    </Panel>
  );
}
