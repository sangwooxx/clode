"use client";

import type { FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import {
  formatEmployeeStatus,
  formatHours,
  formatMoney,
} from "@/features/employees/formatters";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeeMedicalState,
  EmployeeRelationSnapshot,
} from "@/features/employees/types";

type EmployeesEditorPanelProps = {
  canWrite: boolean;
  isSubmitting: boolean;
  editingEmployee: EmployeeDirectoryRecord | null;
  detailEmployee: EmployeeDirectoryRecord | null;
  detailRelations: EmployeeRelationSnapshot | null;
  selectedMedical: EmployeeMedicalState;
  formValues: EmployeeFormValues;
  formError: string | null;
  formStatus: string | null;
  deleteBlocked: boolean;
  onCreateNew: () => void;
  onDeleteEmployee: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onFieldChange: (field: keyof EmployeeFormValues, value: string) => void;
  embedded?: boolean;
};

export function EmployeesEditorPanel({
  canWrite,
  isSubmitting,
  editingEmployee,
  detailEmployee,
  detailRelations,
  selectedMedical,
  formValues,
  formError,
  formStatus,
  deleteBlocked,
  onCreateNew,
  onDeleteEmployee,
  onSubmit,
  onFieldChange,
  embedded = false,
}: EmployeesEditorPanelProps) {
  const formDisabled = !canWrite || isSubmitting;

  const content = (
    <>
      {detailEmployee ? (
        <div className="employees-spotlight">
          <div className="data-table__stack">
            <span className="data-table__primary">{detailEmployee.name}</span>
            <span className="data-table__secondary">
              {detailEmployee.position || "Bez stanowiska"} | {formatEmployeeStatus(detailEmployee.status)}
            </span>
          </div>

          {detailRelations ? (
            <div className="employees-detail-grid">
              <div className="employees-detail-card">
                <span className="field-card__label">Wpisy czasu</span>
                <strong>{detailRelations.hoursEntries}</strong>
                <small>{formatHours(detailRelations.totalHours)}</small>
              </div>
              <div className="employees-detail-card">
                <span className="field-card__label">Karty pracy</span>
                <strong>{detailRelations.workCards}</strong>
                <small>{detailRelations.monthsCount} mies.</small>
              </div>
              <div className="employees-detail-card">
                <span className="field-card__label">Koszt godzin</span>
                <strong>{formatMoney(detailRelations.totalCost)}</strong>
                <small>{detailEmployee.worker_code || "Bez kodu"}</small>
              </div>
              <div className="employees-detail-card">
                <span className="field-card__label">Badania</span>
                <strong>{selectedMedical.dateText}</strong>
                <small>{selectedMedical.label}</small>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="status-message">Dodaj nowego pracownika albo wybierz rekord do edycji.</p>
      )}

      <form className="employees-form" onSubmit={onSubmit}>
        <FormGrid columns={2}>
          <label className="form-field">
            <span>Imię</span>
            <input
              value={formValues.first_name}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("first_name", event.target.value)}
              placeholder="Paweł"
            />
          </label>

          <label className="form-field">
            <span>Nazwisko</span>
            <input
              value={formValues.last_name}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("last_name", event.target.value)}
              placeholder="Dąbrowski"
            />
          </label>

          <label className="form-field">
            <span>Kod pracownika</span>
            <input
              value={formValues.worker_code}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("worker_code", event.target.value)}
              placeholder="PD-01"
            />
          </label>

          <label className="form-field">
            <span>Stanowisko</span>
            <input
              value={formValues.position}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("position", event.target.value)}
              placeholder="Monter"
            />
          </label>

          <label className="form-field">
            <span>Status</span>
            <select
              value={formValues.status}
              disabled={formDisabled}
              onChange={(event) =>
                onFieldChange("status", event.target.value === "inactive" ? "inactive" : "active")
              }
            >
              <option value="active">Aktywny</option>
              <option value="inactive">Nieaktywny</option>
            </select>
          </label>

          <label className="form-field">
            <span>Data zatrudnienia</span>
            <input
              type="date"
              value={formValues.employment_date}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("employment_date", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Data zakończenia</span>
            <input
              type="date"
              value={formValues.employment_end_date}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("employment_end_date", event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Telefon</span>
            <input
              value={formValues.phone}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("phone", event.target.value)}
              placeholder="+48 500 000 000"
            />
          </label>

          <label className="form-field form-grid__span-2">
            <span>Ulica</span>
            <input
              value={formValues.street}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("street", event.target.value)}
              placeholder="ul. Przykładowa 1"
            />
          </label>

          <label className="form-field">
            <span>Kod i miejscowość</span>
            <input
              value={formValues.city}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("city", event.target.value)}
              placeholder="00-000 Warszawa"
            />
          </label>

          <label className="form-field">
            <span>Badania ważne do</span>
            <input
              type="date"
              value={formValues.medical_exam_valid_until}
              disabled={formDisabled}
              onChange={(event) => onFieldChange("medical_exam_valid_until", event.target.value)}
            />
          </label>
        </FormGrid>

        <FormFeedback
          items={[
            !canWrite
              ? {
                  tone: "warning",
                  text: "Masz dostęp tylko do odczytu kartoteki pracowników.",
                }
              : null,
            formError ? { tone: "error", text: formError } : null,
            formStatus ? { tone: "success", text: formStatus } : null,
            editingEmployee && deleteBlocked
              ? {
                  tone: "warning",
                  text:
                    "Rekord ma powiązane wpisy czasu lub karty pracy. Zmień status na nieaktywny zamiast usuwać pracownika.",
                }
              : null,
          ]}
        />

        <FormActions
          leading={
            <>
              {canWrite ? (
                <ActionButton type="button" variant="secondary" onClick={onCreateNew} disabled={isSubmitting}>
                  {editingEmployee ? "Nowy rekord" : "Wyczyść formularz"}
                </ActionButton>
              ) : null}
              {editingEmployee && canWrite ? (
                <ActionButton
                  type="button"
                  variant="ghost"
                  onClick={onDeleteEmployee}
                  disabled={isSubmitting || deleteBlocked}
                >
                  Usuń
                </ActionButton>
              ) : null}
            </>
          }
          trailing={
            canWrite ? (
              <ActionButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Zapisywanie..." : editingEmployee ? "Zapisz zmiany" : "Dodaj pracownika"}
              </ActionButton>
            ) : null
          }
        />
      </form>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Panel title={editingEmployee ? "Edycja pracownika" : "Nowy pracownik"}>{content}</Panel>;
}
