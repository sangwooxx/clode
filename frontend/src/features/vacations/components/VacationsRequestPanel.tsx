"use client";

import type { FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import type {
  VacationEmployeeOption,
  VacationRequestFormValues,
  VacationRequestRecord,
} from "@/features/vacations/types";

type VacationsRequestPanelProps = {
  canWrite: boolean;
  editingRequest: VacationRequestRecord | null;
  editingEmployeeStatus: "resolved" | "missing" | "ambiguous" | "legacy_name_only";
  editingEmployeeMessage: string | null;
  editingInactiveRequest: boolean;
  selectableEmployeeOptions: VacationEmployeeOption[];
  requestValues: VacationRequestFormValues;
  canApprove: boolean;
  approvalMessage: string | null;
  formError: string | null;
  formStatus: string | null;
  isSubmittingRequest: boolean;
  editingEmployeeNeedsManualResolution: boolean;
  onCreateNewRequest: () => void;
  onSubmitRequest: (event: FormEvent<HTMLFormElement>) => void;
  onRequestFieldChange: (field: keyof VacationRequestFormValues, value: string) => void;
};

export function VacationsRequestPanel({
  canWrite,
  editingRequest,
  editingEmployeeStatus,
  editingEmployeeMessage,
  editingInactiveRequest,
  selectableEmployeeOptions,
  requestValues,
  canApprove,
  approvalMessage,
  formError,
  formStatus,
  isSubmittingRequest,
  editingEmployeeNeedsManualResolution,
  onCreateNewRequest,
  onSubmitRequest,
  onRequestFieldChange,
}: VacationsRequestPanelProps) {
  const formDisabled = !canWrite || isSubmittingRequest;

  return (
    <Panel title={editingRequest ? "Edytuj wniosek" : "Nowy wniosek / nieobecność"}>
      <form className="vacations-form" onSubmit={onSubmitRequest}>
        <FormGrid columns={1}>
          <label className="form-field">
            <span>Pracownik</span>
            <select
              value={requestValues.employee_key}
              onChange={(event) => onRequestFieldChange("employee_key", event.target.value)}
              disabled={formDisabled || Boolean(editingInactiveRequest)}
            >
              <option value="">Wybierz pracownika</option>
              {selectableEmployeeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.description ? `${option.label} - ${option.description}` : option.label}
                </option>
              ))}
            </select>
          </label>
          {editingRequest && editingEmployeeStatus !== "resolved" ? (
            <p className="status-message status-message--warning">{editingEmployeeMessage}</p>
          ) : null}
          <label className="form-field">
            <span>Typ nieobecności</span>
            <select
              value={requestValues.type}
              onChange={(event) => onRequestFieldChange("type", event.target.value)}
              disabled={formDisabled}
            >
              <option value="vacation">Urlop wypoczynkowy</option>
              <option value="on_demand">Urlop na żądanie</option>
              <option value="sick_leave">L4</option>
              <option value="other">Inna nieobecność</option>
            </select>
          </label>
          <label className="form-field">
            <span>Data od</span>
            <input
              type="date"
              value={requestValues.start_date}
              onChange={(event) => onRequestFieldChange("start_date", event.target.value)}
              disabled={formDisabled}
            />
          </label>
          <label className="form-field">
            <span>Data do</span>
            <input
              type="date"
              value={requestValues.end_date}
              onChange={(event) => onRequestFieldChange("end_date", event.target.value)}
              disabled={formDisabled}
            />
          </label>
          <label className="form-field">
            <span>Liczba dni</span>
            <input
              value={requestValues.days}
              onChange={(event) => onRequestFieldChange("days", event.target.value)}
              inputMode="decimal"
              placeholder="Automatycznie z zakresu dat"
              disabled={formDisabled}
            />
          </label>
          <label className="form-field">
            <span>Wprowadza</span>
            <input
              value={requestValues.requested_by}
              onChange={(event) => onRequestFieldChange("requested_by", event.target.value)}
              disabled={formDisabled}
            />
          </label>
          <label className="form-field">
            <span>Status</span>
            <select
              value={requestValues.status}
              onChange={(event) => onRequestFieldChange("status", event.target.value)}
              disabled={formDisabled || !canApprove}
            >
              <option value="pending">Oczekuje</option>
              <option value="approved">Zatwierdzony</option>
              <option value="rejected">Odrzucony</option>
            </select>
          </label>
          <label className="form-field">
            <span>Uwagi</span>
            <textarea
              value={requestValues.notes}
              onChange={(event) => onRequestFieldChange("notes", event.target.value)}
              rows={4}
              placeholder="Opis, numer zwolnienia lub komentarz"
              disabled={formDisabled}
            />
          </label>
        </FormGrid>

        {!canWrite ? (
          <p className="status-message">Masz dostęp tylko do podglądu wniosków urlopowych.</p>
        ) : null}
        {approvalMessage ? <p className="status-message">{approvalMessage}</p> : null}
        {formError ? <p className="status-message status-message--error">{formError}</p> : null}
        {formStatus ? <p className="status-message status-message--success">{formStatus}</p> : null}

        <div className="vacations-form__actions">
          {editingRequest && canWrite ? (
            <ActionButton type="button" variant="ghost" onClick={onCreateNewRequest}>
              Wyczysc formularz
            </ActionButton>
          ) : null}
          {canWrite ? (
            <ActionButton
              type="submit"
              disabled={isSubmittingRequest || editingEmployeeNeedsManualResolution}
            >
              {isSubmittingRequest
                ? "Zapisywanie..."
                : editingRequest
                  ? "Zapisz zmiany"
                  : "Dodaj nieobecność"}
            </ActionButton>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
