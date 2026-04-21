import { beforeEach, describe, expect, it, vi } from "vitest";

const httpMock = vi.fn();
const fetchHoursBootstrapSummaryMock = vi.fn();
const fetchHoursContractsMock = vi.fn();
const fetchHoursEmployeeDirectoryMock = vi.fn();

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
  fetchHoursBootstrapSummary: (...args: unknown[]) => fetchHoursBootstrapSummaryMock(...args),
  fetchHoursContracts: (...args: unknown[]) => fetchHoursContractsMock(...args),
  fetchHoursEmployeeDirectory: (...args: unknown[]) => fetchHoursEmployeeDirectoryMock(...args),
}));

fetchHoursBootstrapSummaryMock.mockResolvedValue({
  months: [{ month_key: "2026-04", month_label: "kwiecien 2026", selected: true }],
  selectedMonthKey: "2026-04",
});

fetchHoursContractsMock.mockResolvedValue([]);
fetchHoursEmployeeDirectoryMock.mockResolvedValue([
  { id: "emp-1", name: "Jan Nowak", worker_code: "WK-1", status: "active" },
  { id: "emp-2", name: "Adam Lis", worker_code: "WK-2", status: "inactive" },
]);

vi.mock("@/features/work-cards/mappers", () => ({
  buildWorkCardEmployeeOptions: (
    employees: Array<{ id?: string; name?: string; status?: string }>
  ) =>
    employees.map((employee, index) => ({
      key: employee.id ? `id:${employee.id}` : `employee-${index}`,
      name: employee.name || "",
      label: employee.name || "",
      description: "",
      status: employee.status ?? "active",
      employee,
    })),
}));

import {
  fetchWorkCardBootstrapClient,
  fetchWorkCardCard,
  saveWorkCardAndSync,
} from "@/features/work-cards/api";

describe("work cards api", () => {
  beforeEach(() => {
    httpMock.mockReset();
    fetchHoursBootstrapSummaryMock.mockClear();
    fetchHoursContractsMock.mockClear();
    fetchHoursEmployeeDirectoryMock.mockClear();
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

    expect(fetchHoursEmployeeDirectoryMock).toHaveBeenCalledTimes(1);
    expect(httpMock).toHaveBeenCalledWith("/work-cards/history", { method: "GET" });
    expect(payload.employees).toHaveLength(1);
    expect(payload.historicalEmployees).toHaveLength(2);
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

  it("saves a work card without browser-side time entry reconciliation", async () => {
    httpMock.mockResolvedValueOnce({
      card: { id: "card-1", month_key: "2026-04" },
    });

    const result = await saveWorkCardAndSync({
      card: {
        id: "card-1",
        employee_id: "emp-1",
        employee_name: "Jan Nowak",
        month_key: "2026-04",
        month_label: "kwiecien 2026",
        updated_at: "2026-04-21T10:00:00Z",
        rows: [],
      },
      employee: {
        id: "emp-1",
        name: "Jan Nowak",
        worker_code: "WK-1",
        status: "active",
      },
    });

    expect(httpMock).toHaveBeenCalledWith("/work-cards/card", {
      method: "PUT",
      body: JSON.stringify({
        card: {
          id: "card-1",
          employee_id: "emp-1",
          employee_name: "Jan Nowak",
          month_key: "2026-04",
          month_label: "kwiecien 2026",
          updated_at: "2026-04-21T10:00:00Z",
          rows: [],
        },
      }),
    });
    expect(result.card?.id).toBe("card-1");
    expect(result.syncError).toBeNull();
  });

  it("surfaces backend sync warnings without re-running the sync in the browser", async () => {
    httpMock.mockResolvedValueOnce({
      card: { id: "card-1", month_key: "2026-04" },
      sync_error: "warning",
    });

    const result = await saveWorkCardAndSync({
      card: {
        id: "card-1",
        employee_id: "emp-1",
        employee_name: "Jan Nowak",
        month_key: "2026-04",
        month_label: "kwiecien 2026",
        updated_at: "2026-04-21T10:00:00Z",
        rows: [],
      },
      employee: {
        id: "emp-1",
        name: "Jan Nowak",
        worker_code: "WK-1",
        status: "active",
      },
    });

    expect(result.syncError).toBe("warning");
  });
});
