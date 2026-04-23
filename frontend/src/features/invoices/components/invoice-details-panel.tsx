import { ActionButton } from "@/components/ui/action-button";
import { Panel } from "@/components/ui/panel";
import { formatInvoiceType, formatMoney, formatPaymentStatus } from "@/features/invoices/formatters";
import type { InvoiceRecord } from "@/features/invoices/types";

type InvoiceDetailsPanelProps = {
  selectedInvoice: InvoiceRecord | null;
  canWrite: boolean;
  onEdit: (invoice: InvoiceRecord) => void;
};

export function InvoiceDetailsPanel({ selectedInvoice, canWrite, onEdit }: InvoiceDetailsPanelProps) {
  return (
    <Panel title="Szczegóły faktury">
      {selectedInvoice ? (
        <dl className="info-list invoices-detail-list">
          <div className="info-list__row">
            <dt>Numer</dt>
            <dd>{selectedInvoice.invoice_number}</dd>
          </div>
          <div className="info-list__row">
            <dt>Typ</dt>
            <dd>{formatInvoiceType(selectedInvoice.type)}</dd>
          </div>
          <div className="info-list__row">
            <dt>Kontrahent</dt>
            <dd>{selectedInvoice.counterparty_name || "-"}</dd>
          </div>
          <div className="info-list__row">
            <dt>Netto / brutto</dt>
            <dd>
              {formatMoney(selectedInvoice.amount_net)} / {formatMoney(selectedInvoice.amount_gross)}
            </dd>
          </div>
          <div className="info-list__row">
            <dt>Płatność</dt>
            <dd>{formatPaymentStatus(selectedInvoice.payment_status)}</dd>
          </div>
          <div className="info-list__row">
            <dt>Opis</dt>
            <dd>{selectedInvoice.category_or_description || "-"}</dd>
          </div>
        </dl>
      ) : (
        <p className="status-message">Wybierz rekord.</p>
      )}
      {canWrite && selectedInvoice ? (
        <ActionButton type="button" variant="secondary" onClick={() => onEdit(selectedInvoice)}>
          Edytuj fakturę
        </ActionButton>
      ) : null}
    </Panel>
  );
}
