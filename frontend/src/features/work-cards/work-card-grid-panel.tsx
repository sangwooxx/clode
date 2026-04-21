import { Panel } from "@/components/ui/panel";
import { formatHours, formatMonthLabel, formatNumber } from "@/features/work-cards/formatters";
import type { WorkCardDayViewModel } from "@/features/work-cards/types";

type WorkCardContractOption = {
  id: string;
  label: string;
  code: string;
  status: string;
};

export function WorkCardGridPanel({
  title,
  isHistoricalPreview,
  displayedEmployeeLabel,
  displayedEmployeeMeta,
  selectedMonthKey,
  selectedMonthLabel,
  contractOptions,
  gridTemplate,
  draftRows,
  canWrite,
  monthTotalHours,
  filledDaysCount,
  contractTotals,
  onHoursChange,
  onNoteChange,
}: {
  title: string;
  isHistoricalPreview: boolean;
  displayedEmployeeLabel: string;
  displayedEmployeeMeta: string;
  selectedMonthKey: string;
  selectedMonthLabel?: string;
  contractOptions: WorkCardContractOption[];
  gridTemplate: string;
  draftRows: WorkCardDayViewModel[];
  canWrite: boolean;
  monthTotalHours: number;
  filledDaysCount: number;
  contractTotals: Map<string, number>;
  onHoursChange: (date: string, contractId: string, value: string) => void;
  onNoteChange: (date: string, value: string) => void;
}) {
  return (
    <Panel title={title}>
      <div className="work-card-meta">
        <div className="data-table__stack">
          <span className="data-table__primary">
            {displayedEmployeeLabel} | {selectedMonthLabel || formatMonthLabel(selectedMonthKey)}
          </span>
          {displayedEmployeeMeta ? (
            <span className="data-table__secondary">{displayedEmployeeMeta}</span>
          ) : null}
        </div>
        <div className="work-card-meta__legend">
          <span className="work-card-meta__badge">Weekend</span>
          <span className="work-card-meta__badge work-card-meta__badge--muted">
            Nieprzypisane
          </span>
        </div>
      </div>

      {isHistoricalPreview ? (
        <p className="status-message">
          To jest karta historyczna pracownika nieaktywnego. Ten widok pozostaje tylko do odczytu.
        </p>
      ) : null}

      <div className="work-card-grid">
        <div
          className="work-card-grid__row work-card-grid__row--head"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="work-card-grid__cell work-card-grid__cell--date">Dzień</div>
          {contractOptions.map((option) => (
            <div
              key={`head-${option.id}`}
              className={`work-card-grid__cell work-card-grid__cell--contract-head work-card-grid__cell--status-${option.status}`}
              title={`${option.code} | ${option.label}`}
            >
              <span className="work-card-grid__contract-code">{option.code}</span>
              <span className="work-card-grid__contract-name">{option.label}</span>
            </div>
          ))}
          <div className="work-card-grid__cell work-card-grid__cell--total">Razem</div>
          <div className="work-card-grid__cell work-card-grid__cell--note">Opis pracy</div>
        </div>

        {draftRows.map((row) => (
          <div
            key={row.date}
            className={`work-card-grid__row${row.isWeekend ? " work-card-grid__row--weekend" : ""}${row.totalHours > 0 ? " work-card-grid__row--filled" : ""}`}
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="work-card-grid__cell work-card-grid__cell--date">
              <div className="work-card-grid__day">
                <strong>{row.dayNumber}</strong>
                <span>{row.weekdayLabel}</span>
                {row.isWeekend ? <em>Weekend</em> : null}
              </div>
            </div>

            {contractOptions.map((option) => {
              const isLocked = option.status === "archived" || option.status === "missing";
              return (
                <div key={`${row.date}-${option.id}`} className="work-card-grid__cell">
                  <input
                    className={`text-input work-card-grid__hours-input${isLocked ? " work-card-grid__hours-input--locked" : ""}`}
                    inputMode="decimal"
                    value={row.hoursByContract[option.id] || ""}
                    onChange={(event) => onHoursChange(row.date, option.id, event.target.value)}
                    placeholder="0"
                    disabled={!canWrite || isHistoricalPreview || isLocked}
                    title={
                      isLocked
                        ? `${option.label} jest archiwalny lub niedostępny do nowych wpisów.`
                        : `${option.label}`
                    }
                  />
                </div>
              );
            })}

            <div className="work-card-grid__cell work-card-grid__cell--total">
              {formatHours(row.totalHours)}
            </div>

            <div className="work-card-grid__cell work-card-grid__cell--note">
              <input
                className="text-input work-card-grid__note-input"
                value={row.note}
                onChange={(event) => onNoteChange(row.date, event.target.value)}
                placeholder={row.isWeekend ? "Opcjonalna adnotacja weekendowa" : "Opcjonalny opis pracy"}
                disabled={!canWrite || isHistoricalPreview}
              />
            </div>
          </div>
        ))}

        <div
          className="work-card-grid__row work-card-grid__row--footer"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="work-card-grid__cell work-card-grid__cell--date">
            <div className="work-card-grid__day work-card-grid__day--summary">
              <strong>Podsumowanie</strong>
              <span>{formatNumber(filledDaysCount)} dni z wpisami</span>
            </div>
          </div>
          {contractOptions.map((option) => (
            <div
              key={`total-${option.id}`}
              className="work-card-grid__cell work-card-grid__cell--footer-value"
            >
              {formatHours(contractTotals.get(option.id) || 0)}
            </div>
          ))}
          <div className="work-card-grid__cell work-card-grid__cell--total work-card-grid__cell--footer-value">
            {formatHours(monthTotalHours)}
          </div>
          <div className="work-card-grid__cell work-card-grid__cell--note work-card-grid__cell--footer-note">
            {isHistoricalPreview
              ? "Historia pracownika nieaktywnego zostaje zachowana tylko do odczytu."
              : "Zapis tej karty aktualizuje miesięczną ewidencję czasu pracy bez podwójnego wprowadzania danych."}
          </div>
        </div>
      </div>
    </Panel>
  );
}
