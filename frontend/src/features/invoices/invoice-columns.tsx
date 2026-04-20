import { ActionButton } from "@/components/ui/action-button";
import type { DataTableColumn } from "@/components/ui/data-table";
import { formatDate, formatMoney, formatPaymentStatus } from "@/features/invoices/formatters";
import type { InvoiceRecord } from "@/features/invoices/types";

export type InvoiceTableRow = {
  index: number;
  item: InvoiceRecord;
};

type InvoiceColumnHandlers = {
  canWrite: boolean;
  allSelected: boolean;
  isSelected: (invoiceId: string) => boolean;
  onToggleAll: (checked: boolean) => void;
  onToggleSelected: (invoiceId: string, checked: boolean) => void;
  onEdit: (invoice: InvoiceRecord) => void;
  onDelete: (invoice: InvoiceRecord) => void;
};

export function buildInvoiceColumns(
  handlers: InvoiceColumnHandlers
): Array<DataTableColumn<InvoiceTableRow>> {
  return [
    {
      key: "select",
      header: handlers.canWrite ? (
        <input
          type="checkbox"
          checked={handlers.allSelected}
          onChange={(event) => handlers.onToggleAll(event.target.checked)}
          aria-label="Zaznacz wszystkie faktury"
        />
      ) : (
        ""
      ),
      className: "invoices-col-select",
      sortable: false,
      render: (row) =>
        handlers.canWrite ? (
          <input
            type="checkbox"
            checked={handlers.isSelected(row.item.id)}
            aria-label={`Zaznacz fakturę ${row.item.invoice_number}`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => handlers.onToggleSelected(row.item.id, event.target.checked)}
          />
        ) : null
    },
    {
      key: "lp",
      header: "Lp.",
      className: "invoices-col-lp",
      sortValue: (row) => row.index,
      render: (row) => row.index
    },
    {
      key: "issue_date",
      header: "Data",
      className: "invoices-col-date",
      sortValue: (row) => row.item.issue_date,
      render: (row) => formatDate(row.item.issue_date)
    },
    {
      key: "number",
      header: "Numer / kontrahent",
      className: "invoices-col-number",
      sortValue: (row) => `${row.item.invoice_number} ${row.item.counterparty_name}`,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.invoice_number}</span>
          <span className="data-table__secondary">{row.item.counterparty_name || "-"}</span>
        </div>
      )
    },
    {
      key: "description",
      header: "Kategoria / opis",
      className: "invoices-col-description",
      sortValue: (row) => row.item.category_or_description,
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.category_or_description || "-"}</span>
          {row.item.notes ? <span className="data-table__secondary">{row.item.notes}</span> : null}
        </div>
      )
    },
    {
      key: "net",
      header: "Netto",
      className: "data-table__numeric invoices-col-money",
      sortValue: (row) => row.item.amount_net,
      render: (row) => formatMoney(row.item.amount_net)
    },
    {
      key: "vat",
      header: "VAT",
      className: "data-table__numeric invoices-col-vat",
      sortValue: (row) => row.item.amount_vat,
      render: (row) => (
        <div className="data-table__stack data-table__stack--numeric">
          <span className="data-table__primary">
            {row.item.vat_rate ? `${row.item.vat_rate.toLocaleString("pl-PL")}%` : "bez VAT"}
          </span>
          <span className="data-table__secondary">{formatMoney(row.item.amount_vat)}</span>
        </div>
      )
    },
    {
      key: "gross",
      header: "Brutto",
      className: "data-table__numeric invoices-col-money",
      sortValue: (row) => row.item.amount_gross,
      render: (row) => formatMoney(row.item.amount_gross)
    },
    {
      key: "payment",
      header: "Płatność",
      className: "invoices-col-payment",
      sortValue: (row) => `${row.item.payment_status} ${row.item.due_date || ""}`,
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.item.payment_status === "paid"
                ? "data-table__status-pill"
                : "data-table__status-pill data-table__status-pill--muted"
            }
          >
            {formatPaymentStatus(row.item.payment_status)}
          </span>
          <span className="data-table__secondary">
            Termin: {row.item.due_date ? formatDate(row.item.due_date) : "-"}
          </span>
        </div>
      )
    },
    {
      key: "actions",
      header: "Akcje",
      className: "invoices-table__actions",
      sortable: false,
      render: (row) =>
        handlers.canWrite ? (
          <div className="contracts-table__actions-stack">
            <ActionButton
              type="button"
              variant="secondary"
              onClick={(event) => {
                event.stopPropagation();
                handlers.onEdit(row.item);
              }}
            >
              Edytuj
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
                handlers.onDelete(row.item);
              }}
            >
              Usuń
            </ActionButton>
          </div>
        ) : (
          <span className="data-table__secondary">Podgląd</span>
        )
    }
  ];
}
