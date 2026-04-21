import { ActionButton } from "@/components/ui/action-button";
import { Panel } from "@/components/ui/panel";
import { formatHours, formatNumber } from "@/features/work-cards/formatters";
import type { WorkCardHistoryPreview } from "@/features/work-cards/work-card-view-helpers";

export function WorkCardHistoryPanel({
  items,
  selectedHistoricalCardId,
  isHistoricalPreview,
  onClearSelection,
  onSelectHistoricalCard,
}: {
  items: WorkCardHistoryPreview[];
  selectedHistoricalCardId: string | null;
  isHistoricalPreview: boolean;
  onClearSelection: () => void;
  onSelectHistoricalCard: (cardId: string, monthKey: string) => void;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <Panel title="Historia pracowników nieaktywnych">
      <div className="work-card-history">
        {isHistoricalPreview ? (
          <div className="contracts-form__actions">
            <ActionButton type="button" variant="secondary" onClick={onClearSelection}>
              Wróć do aktywnej karty
            </ActionButton>
          </div>
        ) : null}

        <div className="work-card-history__list">
          {items.map((item) => (
            <button
              key={item.cardId}
              type="button"
              className={`work-card-history__item${selectedHistoricalCardId === item.cardId ? " work-card-history__item--active" : ""}`}
              onClick={() => onSelectHistoricalCard(item.cardId, item.monthKey)}
            >
              <span className="work-card-history__item-main">
                <strong>{item.employeeLabel}</strong>
                <span>{item.employeeMeta}</span>
              </span>
              <span className="work-card-history__item-side">
                <strong>{item.monthLabel}</strong>
                <span>
                  {formatHours(item.totalHours)} | {formatNumber(item.filledDays)} dni
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </Panel>
  );
}
