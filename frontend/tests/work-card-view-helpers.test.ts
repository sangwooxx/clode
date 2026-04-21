import { describe, expect, it } from "vitest";
import {
  buildHistoricalWorkCardPreviews,
  buildWorkCardMonthKey,
} from "../src/features/work-cards/work-card-view-helpers";

describe("work-card view helpers", () => {
  it("builds only inactive historical previews", () => {
    const previews = buildHistoricalWorkCardPreviews({
      historicalCards: [
        {
          card_id: "card-1",
          employee_id: "emp-1",
          employee_name: "Jan Nowak",
          month_key: "2026-04",
          month_label: "kwiecien 2026",
          updated_at: "2026-04-20T10:00:00Z",
          total_hours: 16,
          filled_days: 2,
        },
        {
          card_id: "card-2",
          employee_id: "emp-2",
          employee_name: "Adam Lis",
          month_key: "2026-03",
          month_label: "marzec 2026",
          updated_at: "2026-03-10T10:00:00Z",
          total_hours: 8,
          filled_days: 1,
        },
      ],
      historicalEmployees: [
        {
          id: "emp-1",
          name: "Jan Nowak",
          position: "Monter",
          worker_code: "WK-1",
          status: "inactive",
        },
        {
          id: "emp-2",
          name: "Adam Lis",
          position: "Brygadzista",
          worker_code: "WK-2",
          status: "active",
        },
      ],
    });

    expect(previews).toHaveLength(1);
    expect(previews[0]).toMatchObject({
      cardId: "card-1",
      monthKey: "2026-04",
      totalHours: 16,
      filledDays: 2,
    });
  });

  it("validates month key input", () => {
    expect(buildWorkCardMonthKey("2026", "04")).toBe("2026-04");
    expect(buildWorkCardMonthKey("2026", "13")).toBe("");
    expect(buildWorkCardMonthKey("26", "04")).toBe("");
  });
});
