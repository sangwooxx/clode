import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { UNASSIGNED_CONTRACT_ID, type InvoiceFormValues, type InvoicePaymentStatus } from "@/features/invoices/types";
import type { Dispatch, FormEvent, SetStateAction } from "react";

type InvoiceEditorPanelProps = {
  canWrite: boolean;
  editingInvoiceId: string | null;
  formOpen: boolean;
  selectedContractId: string;
  formValues: InvoiceFormValues;
  setFormValues: Dispatch<SetStateAction<InvoiceFormValues>>;
  isSubmitting: boolean;
  formError: string | null;
  formStatus: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  onOpenNew: () => void;
  embedded?: boolean;
};

export function InvoiceEditorPanel({
  canWrite,
  editingInvoiceId,
  formOpen,
  selectedContractId,
  formValues,
  setFormValues,
  isSubmitting,
  formError,
  formStatus,
  onSubmit,
  onClose,
  onOpenNew,
  embedded = false,
}: InvoiceEditorPanelProps) {
  const content = canWrite ? (
    <>
      {!editingInvoiceId && selectedContractId === UNASSIGNED_CONTRACT_ID ? (
        <p className="status-message">Wybierz konkretny kontrakt w analizie, aby dodać nową fakturę.</p>
      ) : null}
      {!formOpen && !editingInvoiceId ? (
        <ActionButton
          type="button"
          onClick={onOpenNew}
          disabled={selectedContractId === UNASSIGNED_CONTRACT_ID}
        >
          Dodaj fakturę
        </ActionButton>
      ) : null}
      {(formOpen || editingInvoiceId) && (
        <form className="contracts-form" onSubmit={onSubmit}>
          <FormGrid columns={1}>
            <label className="form-field">
              <span>Typ</span>
              <select
                value={formValues.type}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    type: event.target.value as InvoiceFormValues["type"],
                  }))
                }
              >
                <option value="cost">Kosztowa</option>
                <option value="sales">Sprzedażowa</option>
              </select>
            </label>
            <label className="form-field">
              <span>Data wystawienia</span>
              <input
                type="date"
                value={formValues.issue_date}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    issue_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Numer faktury</span>
              <input
                value={formValues.invoice_number}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    invoice_number: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Kontrahent</span>
              <input
                value={formValues.counterparty_name}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    counterparty_name: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Kategoria / opis</span>
              <input
                value={formValues.category_or_description}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    category_or_description: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Kwota netto</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formValues.amount_net}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    amount_net: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Stawka VAT</span>
              <select
                value={formValues.vat_mode}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    vat_mode: event.target.value as InvoiceFormValues["vat_mode"],
                  }))
                }
              >
                <option value="23">23%</option>
                <option value="none">Bez VAT</option>
                <option value="custom">Inna</option>
              </select>
            </label>
            {formValues.vat_mode === "custom" ? (
              <label className="form-field">
                <span>Inna stawka VAT %</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formValues.vat_rate_custom}
                  onChange={(event) =>
                    setFormValues((current) => ({
                      ...current,
                      vat_rate_custom: event.target.value,
                    }))
                  }
                />
              </label>
            ) : null}
            <label className="form-field">
              <span>Termin płatności</span>
              <input
                type="date"
                value={formValues.due_date}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    due_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Data płatności</span>
              <input
                type="date"
                value={formValues.payment_date}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    payment_date: event.target.value,
                  }))
                }
              />
            </label>
            <label className="form-field">
              <span>Status płatności</span>
              <select
                value={formValues.payment_status}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    payment_status: event.target.value as InvoicePaymentStatus,
                  }))
                }
              >
                <option value="unpaid">Nieopłacona</option>
                <option value="paid">Opłacona</option>
                <option value="overdue">Przeterminowana</option>
              </select>
            </label>
            <label className="form-field">
              <span>Uwagi</span>
              <textarea
                rows={4}
                value={formValues.notes}
                onChange={(event) =>
                  setFormValues((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </FormGrid>

          <FormFeedback
            items={[
              formError ? { tone: "error", text: formError } : null,
              formStatus ? { tone: "success", text: formStatus } : null,
            ]}
          />

          <FormActions
            leading={
              <ActionButton type="button" variant="secondary" onClick={onClose}>
                {editingInvoiceId ? "Anuluj" : "Wyczyść"}
              </ActionButton>
            }
            trailing={
              <ActionButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Zapisywanie..." : editingInvoiceId ? "Zapisz zmiany" : "Dodaj fakturę"}
              </ActionButton>
            }
          />
        </form>
      )}
    </>
  ) : (
    <p className="status-message">Masz dostęp tylko do podglądu rejestru faktur.</p>
  );

  if (embedded) {
    return content;
  }

  return <Panel title={editingInvoiceId ? "Edytuj fakturę" : "Dodaj fakturę"}>{content}</Panel>;
}
