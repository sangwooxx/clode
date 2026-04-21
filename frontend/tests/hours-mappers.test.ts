import { describe, expect, it } from "vitest";

import { resolveHoursMonthSwitch } from "@/features/hours/mappers";
import type { HoursMonthRecord } from "@/features/hours/types";

describe("hours month switch helpers", () => {
  it("captures both current and next month from one snapshot", () => {
    const months: HoursMonthRecord[] = [
      {
        id: "month-1",
        month_key: "2026-03",
        month_label: "marzec 2026",
        selected: true,
        visible_investments: [],
        finance: {
          zus_company_1: 0,
          zus_company_2: 0,
          zus_company_3: 0,
          pit4_company_1: 0,
          pit4_company_2: 0,
          pit4_company_3: 0,
          payouts: 0,
        },
      },
      {
        id: "month-2",
        month_key: "2026-04",
        month_label: "kwiecien 2026",
        selected: false,
        visible_investments: [],
        finance: {
          zus_company_1: 0,
          zus_company_2: 0,
          zus_company_3: 0,
          pit4_company_1: 0,
          pit4_company_2: 0,
          pit4_company_3: 0,
          payouts: 0,
        },
      },
    ];

    const result = resolveHoursMonthSwitch({
      months,
      currentMonthKey: "2026-03",
      nextMonthKey: "2026-04",
    });

    expect(result.currentMonth?.month_key).toBe("2026-03");
    expect(result.nextMonth?.month_key).toBe("2026-04");
    expect(result.isSameMonth).toBe(false);
  });

  it("flags the same month key so the view can skip redundant reloads", () => {
    const months: HoursMonthRecord[] = [
      {
        id: "month-1",
        month_key: "2026-04",
        month_label: "kwiecien 2026",
        selected: true,
        visible_investments: [],
        finance: {
          zus_company_1: 0,
          zus_company_2: 0,
          zus_company_3: 0,
          pit4_company_1: 0,
          pit4_company_2: 0,
          pit4_company_3: 0,
          payouts: 0,
        },
      },
    ];

    const result = resolveHoursMonthSwitch({
      months,
      currentMonthKey: "2026-04",
      nextMonthKey: "2026-04",
    });

    expect(result.currentMonth?.month_key).toBe("2026-04");
    expect(result.nextMonth?.month_key).toBe("2026-04");
    expect(result.isSameMonth).toBe(true);
  });
});
