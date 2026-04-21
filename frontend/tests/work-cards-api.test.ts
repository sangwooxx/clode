import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.fn();

vi.mock("@/lib/api/http", () => ({
  http: (...args: unknown[]) => httpMock(...args),
  ApiError: class ApiError extends Error {
    status: number;
    payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
      super(message);
      this.status = status;
      this.payload = payload;
    }
  },
}));

vi.mock("@/features/hours/api", () => ({
  fetchHoursBootstrapSummary: vi.fn().mockResolvedValue({
    months: [{ month_key: "2026-04", month_label: "kwiecien 2026", selected: true }],
    selectedMonthKey: "2026-04",
  }),
  fetchHoursContracts: vi.fn().mockResolvedValue([]),
  fetchHoursData: vi.fn(),
  fetchHoursEmployeeDirectory: vi.fn().mockResolvedValue([
    { id: "emp-1", name: "Jan Nowak", worker_code: "WK-1", status: "active" },
  ]),
  fetchHoursEmployees: vi.fn().mockResolvedValue([
    { id: "emp-1", name: "Jan Nowak", worker_code: "WK-1", status: "active" },
  ]),
  removeHoursEntry: vi.fn(),
  saveHoursEntry: vi.fn(),
}));

import {
  fetchWorkCardBootstrapClient,
  fetchWorkCardCard,
} from "@/features/work-cards/api";

describe("work cards api", () => {
  beforeEach(() => {
    httpMock.mockReset();
  });

  it("loads lightweight history summaries instead of the full store on bootstrap", async () => {
    httpMock.mockResolvedValueOnce({
      cards: [
        {
          card_id: "card-1",
          employee_id: "emp-legacy",
          employee_name: "Adam Lis",
          month_key: "2026-03",
          month_label: "marzec 2026",
          updated_at: "2026-03-18T10:00:00Z",
          total_hours: 12,
          filled_days: 2,
        },
      ],
    });

    const payload = await fetchWorkCardBootstrapClient();

    expect(httpMock).toHaveBeenCalledWith("/work-cards/history", { method: "GET" });
    expect(payload.historicalCards).toHaveLength(1);
    expect(payload.selectedMonthKey).toBe("2026-04");
  });

  it("requests a single work card by month and employee reference", async () => {
    httpMock.mockResolvedValueOnce({
      card: { id: "card-1" },
    });

    await fetchWorkCardCard({
      monthKey: "2026-04",
      employee: {
        id: "emp-1",
        name: "Jan Nowak",
      },
    });

    expect(httpMock).toHaveBeenCalledWith(
      "/work-cards/card?month=2026-04&employee_id=emp-1&employee_name=Jan+Nowak",
      { method: "GET" }
    );
  });
});
