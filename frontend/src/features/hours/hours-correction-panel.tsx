import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import { formatHours, formatNumber } from "@/features/hours/formatters";
import type {
  HoursContractOption,
  HoursEntryFormValues,
  HoursEmployeeRecord,
  TimeEntryRecord,
} from "@/features/hours/types";
import type { HoursEmployeeRow } from "@/features/hours/view-types";

type HoursCorrectionPanelProps = {
  canWrite: boolean;
  showManualCorrection: boolean;
  editingEntry: TimeEntryRecord | null;
  selectedEmployeeRow: HoursEmployeeRow | null;
  selectedEmployeeAllowsNewEntries: boolean;
  activeEmployeeName: string;
  activeEmployeeLabel: string;
  activeEmployeeMeta: string;
  employeeEntries: TimeEntryRecord[];
  employeeHoursTotal: number;
  employeeContractsCount: number;
  roster: HoursEmployeeRecord[];
  contractOptions: HoursContractOption[];
  entryFormValues: HoursEntryFormValues;
  isSubmitting: boolean;
  formError: string | null;
  formStatus: string | null;
  onStartNewEntryForEmployee: (employeeName?: string | null) => void;
  onSetShowManualCorrection: (value: boolean) => void;
  onSetFormError: (value: string | null) => void;
  onSetFormStatus: (value: string | null) => void;
  onSetEntryFormValues: Dispatch<SetStateAction<HoursEntryFormValues>>;
  onEditEntry: (entry: TimeEntryRecord) => void;
  onSaveEntry: (event: FormEvent<HTMLFormElement>) => void;
  embedded?: boolean;
};

export function HoursCorrectionPanel({
  canWrite,
  showManualCorrection,
  editingEntry,
  selectedEmployeeRow,
  selectedEmployeeAllowsNewEntries,
  activeEmployeeName,
  activeEmployeeLabel,
  activeEmployeeMeta,
  employeeEntries,
  employeeHoursTotal,
  employeeContractsCount,
  roster,
  contractOptions,
  entryFormValues,
  isSubmitting,
  formError,
  formStatus,
  onStartNewEntryForEmployee,
  onSetShowManualCorrection,
  onSetFormError,
  onSetFormStatus,
  onSetEntryFormValues,
  onEditEntry,
  onSaveEntry,
  embedded = false,
}: HoursCorrectionPanelProps) {
  const content = (
    <>
      {selectedEmployeeRow ? (
        <div className="hours-selected-entry">
          <div className="hours-selected-entry__meta">
            <span className="hours-selected-entry__label">Wybrany pracownik</span>
            <strong>{selectedEmployeeRow.employeeLabel}</strong>
            <span>
              {selectedEmployeeRow.employeePosition} | Kod{" "}
              {formatEmployeeCodeLabel(selectedEmployeeRow.employeeCode, "—")}
            </span>
            <span>
              {formatHours(selectedEmployeeRow.totalHours)} • {formatNumber(selectedEmployeeRow.contracts.length)} kontrakty •{" "}
              {formatNumber(selectedEmployeeRow.entriesCount)} wpisy
            </span>
          </div>
          {canWrite && selectedEmployeeAllowsNewEntries ? (
            <ActionButton
              type="button"
              variant="secondary"
              onClick={() => onStartNewEntryForEmployee(selectedEmployeeRow.employeeName)}
            >
              Dodaj lub popraw godziny
            </ActionButton>
          ) : null}
        </div>
      ) : null}

      {selectedEmployeeRow?.employeeStatus === "inactive" ? (
        <p className="status-message">
          Pracownik jest nieaktywny. W ewidencji zostają jego wpisy historyczne, ale z tego panelu
          nie można dodać nowego wpisu.
        </p>
      ) : null}

      {canWrite ? (
        showManualCorrection ? (
          <form className="contracts-form" onSubmit={onSaveEntry}>
            <FormGrid columns={1}>
              <label className="form-field">
                <span>Pracownik</span>
                <select
                  value={entryFormValues.employee_name}
                  onChange={(event) =>
                    onSetEntryFormValues((current) => ({
                      ...current,
                      employee_name: event.target.value,
                    }))
                  }
                  className="select-field"
                >
                  <option value="">Wybierz pracownika</option>
                  {roster
                    .filter((employee) => employee.status !== "inactive")
                    .map((employee) => (
                      <option key={employee.name} value={employee.name}>
                        {`${formatEmployeeDisplayName(employee, employee.name)} - ${employee.position || "Bez stanowiska"} | Kod ${formatEmployeeCodeLabel(employee.worker_code, "—")}`}
                      </option>
                    ))}
                  {editingEntry && !roster.some((employee) => employee.name === editingEntry.employee_name) ? (
                    <option value={editingEntry.employee_name}>{editingEntry.employee_name}</option>
                  ) : null}
                </select>
              </label>

              {activeEmployeeName ? (
                <div className="hours-entry-helper">
                  <div className="hours-entry-helper__header">
                    <div className="data-table__stack">
                      <span className="data-table__primary">{activeEmployeeLabel}</span>
                      <span className="data-table__secondary">
                        {activeEmployeeMeta} | Wpisy w wybranym miesiącu: {formatNumber(employeeEntries.length)}
                      </span>
                    </div>
                    {selectedEmployeeAllowsNewEntries ? (
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={() => onStartNewEntryForEmployee(activeEmployeeName)}
                      >
                        Nowy wpis
                      </ActionButton>
                    ) : null}
                  </div>

                  {employeeEntries.length > 0 ? (
                    <>
                      <div className="hours-entry-helper__summary">
                        <div className="hours-entry-helper__summary-card">
                          <span className="hours-entry-helper__summary-label">Pracownik</span>
                          <strong>{activeEmployeeLabel}</strong>
                          <span>{activeEmployeeMeta}</span>
                        </div>
                        <div className="hours-entry-helper__summary-card">
                          <span className="hours-entry-helper__summary-label">Kontrakty</span>
                          <strong>{formatNumber(employeeContractsCount)}</strong>
                          <span>Aktywny przekrój</span>
                        </div>
                        <div className="hours-entry-helper__summary-card">
                          <span className="hours-entry-helper__summary-label">Suma</span>
                          <strong>{formatHours(employeeHoursTotal)}</strong>
                          <span>Razem w miesiącu</span>
                        </div>
                      </div>

                      <div className="hours-entry-helper__list">
                        {employeeEntries.map((entry) => (
                          <button
                            key={entry.id}
                            type="button"
                            className={
                              entry.id === editingEntry?.id
                                ? "hours-entry-helper__row hours-entry-helper__row--active"
                                : "hours-entry-helper__row"
                            }
                            onClick={() => onEditEntry(entry)}
                          >
                            <div className="hours-entry-helper__row-main">
                              <span className="hours-entry-helper__row-title">
                                {entry.contract_name || "Nieprzypisane"}
                              </span>
                              <span className="hours-entry-helper__row-subtitle">
                                {entry.contract_id ? "Powiązany kontrakt" : "Bez przypisanego kontraktu"}
                              </span>
                            </div>
                            <div className="hours-entry-helper__row-side">
                              <strong>{formatHours(entry.hours)}</strong>
                              <span>Kliknij, aby poprawić</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="status-message">Ten pracownik nie ma jeszcze wpisów w wybranym miesiącu.</p>
                  )}

                  {!selectedEmployeeAllowsNewEntries && activeEmployeeName ? (
                    <p className="status-message">
                      Ten pracownik jest nieaktywny, więc można przeglądać lub poprawiać historię,
                      ale nie można zacząć nowego wpisu od zera.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <label className="form-field">
                <span>Kontrakt</span>
                <select
                  value={entryFormValues.contract_id}
                  onChange={(event) =>
                    onSetEntryFormValues((current) => ({
                      ...current,
                      contract_id: event.target.value,
                    }))
                  }
                  className="select-field"
                >
                  {contractOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.code} • {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span>Liczba godzin</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={entryFormValues.hours}
                  onChange={(event) =>
                    onSetEntryFormValues((current) => ({
                      ...current,
                      hours: event.target.value,
                    }))
                  }
                  placeholder="Np. 8"
                />
              </label>
            </FormGrid>

            {formError ? <p className="status-message status-message--error">{formError}</p> : null}
            {formStatus ? <p className="status-message status-message--success">{formStatus}</p> : null}

            <div className="contracts-form__actions">
              <ActionButton
                type="button"
                variant="ghost"
                onClick={() => {
                  if (editingEntry) {
                    onStartNewEntryForEmployee(activeEmployeeName);
                    return;
                  }

                  onSetShowManualCorrection(false);
                  onSetFormError(null);
                  onSetFormStatus(null);
                }}
              >
                {editingEntry ? "Anuluj edycję" : "Zamknij panel"}
              </ActionButton>
              <ActionButton type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Zapisywanie..." : editingEntry ? "Zapisz zmiany" : "Dodaj wpis"}
              </ActionButton>
            </div>

            <p className="status-message">
              Możesz też użyć pozycji „Nieprzypisane”. Po zapisie zachowujemy wybranego
              pracownika, żeby szybciej dodać kolejny wpis na inny kontrakt.
            </p>
          </form>
        ) : (
          <div className="status-stack">
            <p className="status-message">
              Główne godziny wpisujemy przez kartę pracy pracownika. Ten panel zostaje do korekt,
              wyjątków i ręcznego dopisania pojedynczego wpisu.
            </p>
            <ActionButton
              type="button"
              onClick={() => {
                onSetShowManualCorrection(true);
                onStartNewEntryForEmployee(selectedEmployeeAllowsNewEntries ? activeEmployeeName : "");
              }}
            >
              Otwórz korektę ręczną
            </ActionButton>
          </div>
        )
      ) : (
        <p className="status-message">Masz dostęp tylko do podglądu ewidencji czasu pracy.</p>
      )}
    </>
  );

  if (embedded) {
    return content;
  }

  return (
    <Panel
      title={
        showManualCorrection
          ? editingEntry
            ? "Korekta wpisu czasu"
            : "Ręczna korekta wpisów"
          : "Korekta ręczna"
      }
    >
      {content}
    </Panel>
  );
}
