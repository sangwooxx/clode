import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchBackendJsonServerMock = vi.fn();
const fetchContractsServerMock = vi.fn();

vi.mock("@/lib/api/server-fetch", () => ({
  fetchBackendJsonServer: (...args: unknown[]) => fetchBackendJsonServerMock(...args),
}));

vi.mock("@/features/contracts/server", () => ({
  fetchContractsServer: (...args: unknown[]) => fetchContractsServerMock(...args),
}));

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
  mergeWorkCardEmployeeDirectory: ({
    employeeDirectory,
    historicalCards,
  }: {
    employeeDirectory: Array<{ id?: string; name?: string; status?: string }>;
    historicalCards: Array<{ employee_id?: string; employee_name?: string }>;
  }) => {
    if (employeeDirectory.length > 0) {
      return employeeDirectory;
    }

    return historicalCards.map((card) => ({
      id: card.employee_id,
      name: card.employee_name,
      status: "active",
    }));
  },
}));

import { fetchWorkCardBootstrapServer } from "@/features/work-cards/server";

describe("fetchWorkCardBootstrapServer", () => {
  beforeEach(() => {
    fetchBackendJsonServerMock.mockReset();
    fetchContractsServerMock.mockReset();
    fetchContractsServerMock.mockResolvedValue([]);
  });

  it("hydrates work cards from server bootstrap and preloads the initial card", async () => {
    fetchBackendJsonServerMock
      .mockResolvedValueOnce({
        status: 200,
        payload: {
          employees: [
            { id: "emp-1", name: "Jan Nowak", worker_code: "WK-1", status: "active" },
            { id: "emp-2", name: "Adam Lis", worker_code: "WK-2", status: "inactive" },
          ],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          months: [{ month_key: "2026-04", month_label: "kwiecien 2026", selected: true }],
          selected_month_key: "2026-04",
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        payload: {
          cards: [
            {
              card_id: "card-legacy",
              employee_id: "emp-2",
              employee_name: "Adam Lis",
              month_key: "2026-03",
              month_label: "marzec 2026",
              updated_at: "2026-03-20T10:00:00Z",
              total_hours: 16,
              filled_days: 3,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          card: {
            id: "card-1",
            employee_id: "emp-1",
            employee_name: "Jan Nowak",
            month_key: "2026-04",
            month_label: "kwiecien 2026",
            updated_at: "2026-04-21T10:00:00Z",
            rows: [],
          },
        },
      });

    const result = await fetchWorkCardBootstrapServer();

    expect(result.bootstrap.selectedMonthKey).toBe("2026-04");
    expect(result.bootstrap.selectedEmployeeKey).toBe("id:emp-1");
    expect(result.bootstrap.employees).toHaveLength(1);
    expect(result.bootstrap.historicalEmployees).toHaveLength(2);
    expect(result.bootstrap.historicalCards).toHaveLength(1);
    expect(result.initialCard?.id).toBe("card-1");
    expect(fetchBackendJsonServerMock).toHaveBeenLastCalledWith(
      "/work-cards/card?month=2026-04&employee_id=emp-1&employee_name=Jan+Nowak",
      {
        nextPath: "/work-cards",
      }
    );
  });

  it("rebuilds selectable employees from work card history when employee directory is forbidden", async () => {
    fetchBackendJsonServerMock
      .mockResolvedValueOnce({
        status: 403,
        payload: null,
      })
      .mockResolvedValueOnce({
        payload: {
          months: [{ month_key: "2026-04", month_label: "kwiecien 2026", selected: true }],
          selected_month_key: "2026-04",
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        payload: {
          cards: [
            {
              card_id: "card-legacy",
              employee_id: "emp-9",
              employee_name: "Anna Krol",
              month_key: "2026-04",
              month_label: "kwiecien 2026",
              updated_at: "2026-04-20T10:00:00Z",
              total_hours: 12,
              filled_days: 2,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        payload: {
          card: {
            id: "card-9",
            employee_id: "emp-9",
            employee_name: "Anna Krol",
            month_key: "2026-04",
            month_label: "kwiecien 2026",
            updated_at: "2026-04-21T10:00:00Z",
            rows: [],
          },
        },
      });

    const result = await fetchWorkCardBootstrapServer();

    expect(result.bootstrap.employees).toEqual([
      { id: "emp-9", name: "Anna Krol", status: "active" },
    ]);
    expect(result.bootstrap.selectedEmployeeKey).toBe("id:emp-9");
    expect(result.initialCard?.id).toBe("card-9");
  });
});
