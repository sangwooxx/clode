"use client";

import { ActionButton } from "@/components/ui/action-button";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { formatEmployeeCodeLabel, formatEmployeeDisplayName } from "@/features/employees/formatters";
import { formatVacationDays } from "@/features/vacations/formatters";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import type {
  VacationBalanceFormValues,
  VacationBalanceLookup,
  VacationEmployeeStats,
} from "@/features/vacations/types";
import type { FormEvent } from "react";

type VacationsEmployeePanelProps = {
  selectedEmployee: EmployeeDirectoryRecord | null;
  selectedStats: VacationEmployeeStats | null;
  selectedEmployeeInactive: boolean;
  selectedBalanceLookup: VacationBalanceLookup | null;
  balanceValues: VacationBalanceFormValues;
  isSavingBalance: boolean;
  onBalanceFieldChange: (field: keyof VacationBalanceFormValues, value: string) => void;
  onSubmitBalance: (event: FormEvent<HTMLFormElement>) => void;
};

export function VacationsEmployeePanel({
  selectedEmployee,
  selectedStats,
  selectedEmployeeInactive,
  selectedBalanceLookup,
  balanceValues,
  isSavingBalance,
  onBalanceFieldChange,
  onSubmitBalance,
}: VacationsEmployeePanelProps) {
  return (
    <Panel title="Pracownik i pula">
      {selectedEmployee ? (
        <div className="vacations-spotlight">
          <div className="data-table__stack">
            <span className="data-table__primary">
              {formatEmployeeDisplayName(selectedEmployee, selectedEmployee.name)}
            </span>
            <span className="data-table__secondary">
              {selectedEmployee.position || "Bez stanowiska"} • Kod{" "}
              {formatEmployeeCodeLabel(selectedEmployee.worker_code)}
            </span>
          </div>

          {selectedStats ? (
            <div className="vacations-detail-grid">
              <div className="vacations-detail-card">
                <span className="field-card__label">Pula łączna</span>
                <strong>{formatVacationDays(selectedStats.total_pool)} dni</strong>
                <small>Roczna + zaległe + ekstra</small>
              </div>
              <div className="vacations-detail-card">
                <span className="field-card__label">Wykorzystane</span>
                <strong>{formatVacationDays(selectedStats.used_days)} dni</strong>
                <small>Zatwierdzone wpisy</small>
              </div>
              <div className="vacations-detail-card">
                <span className="field-card__label">Oczekujące</span>
                <strong>{formatVacationDays(selectedStats.pending_days)} dni</strong>
                <small>Wnioski w toku</small>
              </div>
              <div className="vacations-detail-card">
                <span className="field-card__label">Pozostało</span>
                <strong>{formatVacationDays(selectedStats.remaining_days)} dni</strong>
                <small>{selectedStats.requests_count} wpisów</small>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="status-message">Wybierz pracownika z tabeli, aby zobaczyć jego saldo.</p>
      )}

      <form className="vacations-form" onSubmit={onSubmitBalance}>
        <FormGrid columns={1}>
          <label className="form-field">
            <span>Limit roczny</span>
            <input
              value={balanceValues.base_days}
              onChange={(event) => onBalanceFieldChange("base_days", event.target.value)}
              inputMode="decimal"
              disabled={selectedEmployeeInactive || isSavingBalance || !selectedEmployee}
            />
          </label>
          <label className="form-field">
            <span>Urlop zaległy</span>
            <input
              value={balanceValues.carryover_days}
              onChange={(event) => onBalanceFieldChange("carryover_days", event.target.value)}
              inputMode="decimal"
              disabled={selectedEmployeeInactive || isSavingBalance || !selectedEmployee}
            />
          </label>
          <label className="form-field">
            <span>Dodatkowa pula</span>
            <input
              value={balanceValues.extra_days}
              onChange={(event) => onBalanceFieldChange("extra_days", event.target.value)}
              inputMode="decimal"
              disabled={selectedEmployeeInactive || isSavingBalance || !selectedEmployee}
            />
          </label>
        </FormGrid>

        {selectedEmployeeInactive ? (
          <p className="status-message">
            Nieaktywny pracownik pozostaje w historii, ale nie przyjmuje nowych operacji.
          </p>
        ) : null}

        {selectedBalanceLookup?.status === "ambiguous" ? (
          <p className="status-message status-message--warning">
            W legacy store istnieje niejednoznaczna pula urlopowa po samej nazwie. Ten rekord nie
            jest już automatycznie przypisywany do pracownika; zapis stworzy osobne saldo po
            stabilnym identyfikatorze.
          </p>
        ) : null}

        <div className="vacations-form__actions">
          <ActionButton
            type="submit"
            disabled={isSavingBalance || selectedEmployeeInactive || !selectedEmployee}
          >
            {isSavingBalance ? "Zapisywanie..." : "Zapisz pulę"}
          </ActionButton>
        </div>
      </form>
    </Panel>
  );
}
