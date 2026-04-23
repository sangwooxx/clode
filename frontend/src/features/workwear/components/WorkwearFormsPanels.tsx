"use client";

import { ActionButton } from "@/components/ui/action-button";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { WORKWEAR_SIZE_OPTIONS } from "@/features/workwear/types";
import type {
  WorkwearCatalogFormValues,
  WorkwearCatalogItem,
  WorkwearEmployeeOption,
  WorkwearIssueFormValues,
} from "@/features/workwear/types";
import type { FormEvent } from "react";

type WorkwearIssueFormPanelProps = {
  canWrite: boolean;
  busyAction: string | null;
  catalog: WorkwearCatalogItem[];
  employeeOptions: WorkwearEmployeeOption[];
  issueForm: WorkwearIssueFormValues;
  editingIssueId: string | null;
  selectedEmployeeInactive: boolean;
  editingHistoricalEmployee: boolean | undefined;
  onChangeField: (field: keyof WorkwearIssueFormValues, value: string) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  embedded?: boolean;
};

type WorkwearCatalogFormPanelProps = {
  canWrite: boolean;
  busyAction: string | null;
  catalogForm: WorkwearCatalogFormValues;
  editingCatalogId: string | null;
  onChangeField: (field: keyof WorkwearCatalogFormValues, value: string) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  embedded?: boolean;
};

export function WorkwearIssueFormPanel({
  canWrite,
  busyAction,
  catalog,
  employeeOptions,
  issueForm,
  editingIssueId,
  selectedEmployeeInactive,
  editingHistoricalEmployee,
  onChangeField,
  onReset,
  onSubmit,
  embedded = false,
}: WorkwearIssueFormPanelProps) {
  const content = (
    <form className="workwear-form" onSubmit={onSubmit}>
      <FormGrid columns={2}>
        <label className="form-field">
          <span>Pracownik</span>
          <select
            value={issueForm.employee_key}
            onChange={(event) => onChangeField("employee_key", event.target.value)}
            disabled={!canWrite}
          >
            <option value="">Wybierz pracownika</option>
            {employeeOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.subtitle ? `${option.label} - ${option.subtitle}` : option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Data wydania</span>
          <input
            type="date"
            value={issueForm.issue_date}
            onChange={(event) => onChangeField("issue_date", event.target.value)}
            disabled={!canWrite}
          />
        </label>
        <label className="form-field">
          <span>Element</span>
          <select
            value={issueForm.item_id}
            onChange={(event) => onChangeField("item_id", event.target.value)}
            disabled={!canWrite || catalog.length === 0}
          >
            <option value="">Wybierz element</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} • {item.category}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Rozmiar</span>
          <select
            value={issueForm.size}
            onChange={(event) => onChangeField("size", event.target.value)}
            disabled={!canWrite}
          >
            {WORKWEAR_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Ilość</span>
          <input
            type="number"
            min="1"
            step="1"
            value={issueForm.quantity}
            onChange={(event) => onChangeField("quantity", event.target.value)}
            disabled={!canWrite}
          />
        </label>
      </FormGrid>

      <label className="form-field">
        <span>Uwagi</span>
        <textarea
          value={issueForm.notes}
          onChange={(event) => onChangeField("notes", event.target.value)}
          disabled={!canWrite}
        />
      </label>

      <FormFeedback
        items={[
          !canWrite
            ? {
                tone: "warning",
                text: "Twoja rola ma dostęp tylko do odczytu tego modułu.",
              }
            : null,
          selectedEmployeeInactive && !editingIssueId
            ? {
                tone: "warning",
                text: "Wybrany pracownik jest nieaktywny. Historia pozostaje widoczna, ale nie dodasz nowego wydania.",
              }
            : null,
          editingHistoricalEmployee
            ? {
                tone: "warning",
                text: "Edytujesz historyczny wpis pracownika nieaktywnego. Zapis dotyczy korekty historii, nie nowego wydania.",
              }
            : null,
          catalog.length === 0
            ? {
                tone: "warning",
                text: "Najpierw dodaj element do katalogu odzieży.",
              }
            : null,
        ]}
      />

      <FormActions
        leading={
          <ActionButton type="button" variant="secondary" onClick={onReset}>
            {editingIssueId ? "Nowe wydanie" : "Wyczyść formularz"}
          </ActionButton>
        }
        trailing={
          <ActionButton type="submit" disabled={!canWrite || busyAction === "save-issue" || catalog.length === 0}>
            {busyAction === "save-issue" ? "Zapisywanie..." : editingIssueId ? "Zapisz zmiany" : "Zapisz wydanie"}
          </ActionButton>
        }
      />
    </form>
  );

  if (embedded) {
    return content;
  }

  return <Panel title={editingIssueId ? "Edycja wydania" : "Nowe wydanie"}>{content}</Panel>;
}

export function WorkwearCatalogFormPanel({
  canWrite,
  busyAction,
  catalogForm,
  editingCatalogId,
  onChangeField,
  onReset,
  onSubmit,
  embedded = false,
}: WorkwearCatalogFormPanelProps) {
  const content = (
    <form className="workwear-form" onSubmit={onSubmit}>
      <FormGrid columns={2}>
        <label className="form-field">
          <span>Nazwa elementu</span>
          <input
            value={catalogForm.name}
            onChange={(event) => onChangeField("name", event.target.value)}
            disabled={!canWrite}
          />
        </label>
        <label className="form-field">
          <span>Kategoria</span>
          <input
            value={catalogForm.category}
            onChange={(event) => onChangeField("category", event.target.value)}
            disabled={!canWrite}
          />
        </label>
      </FormGrid>

      <label className="form-field">
        <span>Opis standardu</span>
        <textarea
          value={catalogForm.notes}
          onChange={(event) => onChangeField("notes", event.target.value)}
          disabled={!canWrite}
        />
      </label>

      <FormActions
        leading={
          <ActionButton type="button" variant="secondary" onClick={onReset}>
            {editingCatalogId ? "Nowy element" : "Wyczyść formularz"}
          </ActionButton>
        }
        trailing={
          <ActionButton type="submit" disabled={!canWrite || busyAction === "save-catalog"}>
            {busyAction === "save-catalog" ? "Zapisywanie..." : editingCatalogId ? "Zapisz zmiany" : "Dodaj do katalogu"}
          </ActionButton>
        }
      />
    </form>
  );

  if (embedded) {
    return content;
  }

  return <Panel title={editingCatalogId ? "Edycja elementu katalogu" : "Nowy element katalogu"}>{content}</Panel>;
}
