import { ActionButton } from "@/components/ui/action-button";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";

type HoursToolbarProps = {
  monthOptions: Array<{ value: string; label: string }>;
  selectedMonthKey: string;
  search: string;
  showMonthSettings: boolean;
  monthError: string | null;
  monthStatus: string | null;
  onSelectMonth: (monthKey: string) => void;
  onSearchChange: (value: string) => void;
  onToggleMonthSettings: () => void;
};

export function HoursToolbar({
  monthOptions,
  selectedMonthKey,
  search,
  showMonthSettings,
  monthError,
  monthStatus,
  onSelectMonth,
  onSearchChange,
  onToggleMonthSettings,
}: HoursToolbarProps) {
  return (
    <Panel className="panel--toolbar panel--toolbar--filters">
      <div className="hours-toolbar">
        <label className="form-field">
          <span>Miesiąc roboczy</span>
          <select
            value={selectedMonthKey}
            onChange={(event) => onSelectMonth(event.target.value)}
            className="select-field"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Szukaj pracownika lub kontraktu</span>
          <SearchField
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Pracownik lub kontrakt"
            aria-label="Szukaj pracowników i kontraktów w ewidencji czasu pracy"
          />
        </label>

        <div className="hours-toolbar__actions">
          <ActionButton type="button" variant="secondary" onClick={onToggleMonthSettings}>
            {showMonthSettings ? "Zamknij ustawienia miesiąca" : "Ustawienia miesiąca"}
          </ActionButton>
        </div>
      </div>

      {monthError ? <p className="status-message status-message--error">{monthError}</p> : null}
      {monthStatus ? <p className="status-message status-message--success">{monthStatus}</p> : null}
    </Panel>
  );
}
