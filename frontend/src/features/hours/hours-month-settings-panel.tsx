import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import type { ContractRecord } from "@/features/contracts/types";
import { formatNumber, HOURS_FINANCE_FIELDS } from "@/features/hours/formatters";
import type { HoursFinanceDraft, HoursMonthRecord } from "@/features/hours/types";

type HoursMonthSettingsPanelProps = {
  canWrite: boolean;
  selectedMonth: HoursMonthRecord;
  activeContracts: ContractRecord[];
  monthContractIds: string[];
  newMonthYear: string;
  newMonthNumber: string;
  financeDraft: HoursFinanceDraft;
  onToggleContractId: (contractId: string, checked: boolean) => void;
  onSetNewMonthYear: (year: string) => void;
  onSetNewMonthNumber: (month: string) => void;
  onSetFinanceDraft: (
    updater: HoursFinanceDraft | ((current: HoursFinanceDraft) => HoursFinanceDraft)
  ) => void;
  onCreateMonth: () => void;
  onDeleteMonth: () => void;
  onSaveMonthSettings: () => void;
  embedded?: boolean;
};

export function HoursMonthSettingsPanel({
  canWrite,
  selectedMonth,
  activeContracts,
  monthContractIds,
  newMonthYear,
  newMonthNumber,
  financeDraft,
  onToggleContractId,
  onSetNewMonthYear,
  onSetNewMonthNumber,
  onSetFinanceDraft,
  onCreateMonth,
  onDeleteMonth,
  onSaveMonthSettings,
  embedded = false,
}: HoursMonthSettingsPanelProps) {
  const content = (
    <>
      <div className="hours-month-meta">
        <div className="data-table__stack">
          <span className="data-table__primary">{selectedMonth.month_label}</span>
          <span className="data-table__secondary">
            Aktywne kontrakty: {formatNumber(monthContractIds.length)}
          </span>
        </div>
      </div>

      <div className="hours-settings-grid">
        <div className="hours-settings-block">
          <p className="panel__title">Operacje na miesiącu</p>
          <div className="hours-inline-controls">
            <select
              value={newMonthNumber}
              onChange={(event) => onSetNewMonthNumber(event.target.value)}
              className="select-field"
            >
              {Array.from({ length: 12 }, (_, index) => {
                const value = String(index + 1).padStart(2, "0");
                return (
                  <option key={value} value={value}>
                    {value}
                  </option>
                );
              })}
            </select>
            <input
              className="text-input"
              inputMode="numeric"
              value={newMonthYear}
              onChange={(event) => onSetNewMonthYear(event.target.value)}
              placeholder="Rok"
            />
            <ActionButton
              type="button"
              variant="secondary"
              onClick={onCreateMonth}
              disabled={!canWrite}
            >
              Dodaj miesiąc
            </ActionButton>
          </div>

          <FormGrid columns={4}>
            {HOURS_FINANCE_FIELDS.map((field) => (
              <label key={field.key} className="form-field">
                <span>{field.label}</span>
                <input
                  className="text-input"
                  inputMode="decimal"
                  value={financeDraft[field.key]}
                  onChange={(event) =>
                    onSetFinanceDraft((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </label>
            ))}
          </FormGrid>
        </div>

        <div className="hours-settings-block">
          <p className="panel__title">Aktywne kontrakty w miesiącu</p>
          <div className="hours-contract-checklist">
            {activeContracts.map((contract) => (
              <label key={contract.id} className="hours-contract-checklist__item">
                <input
                  type="checkbox"
                  checked={monthContractIds.includes(contract.id)}
                  onChange={(event) => onToggleContractId(contract.id, event.target.checked)}
                  disabled={!canWrite}
                />
                <div className="data-table__stack">
                  <span className="data-table__primary">{contract.name}</span>
                  <span className="data-table__secondary">{contract.contract_number || "---"}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="contracts-form__actions">
        <ActionButton type="button" variant="ghost" onClick={onDeleteMonth} disabled={!canWrite}>
          Usuń miesiąc
        </ActionButton>
        <ActionButton type="button" onClick={onSaveMonthSettings} disabled={!canWrite}>
          Zapisz ustawienia miesiąca
        </ActionButton>
      </div>
    </>
  );

  if (embedded) {
    return content;
  }

  return <Panel title="Ustawienia miesiąca">{content}</Panel>;
}
