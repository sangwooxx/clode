import { beforeEach, describe, expect, it, vi } from "vitest";

const createEmployeeMock = vi.fn();
const updateEmployeeMock = vi.fn();
const deleteEmployeeMock = vi.fn();
const listEmployeesSummaryMock = vi.fn();

vi.mock("@/lib/api/employees", () => ({
  createEmployee: (...args: unknown[]) => createEmployeeMock(...args),
  updateEmployee: (...args: unknown[]) => updateEmployeeMock(...args),
  deleteEmployee: (...args: unknown[]) => deleteEmployeeMock(...args),
  listEmployeesSummary: (...args: unknown[]) => listEmployeesSummaryMock(...args),
}));
import { saveEmployeeRecord } from "@/features/employees/api";

describe("employees api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves a worker without client-side hours or work-card reconciliation", async () => {
    createEmployeeMock.mockResolvedValueOnce({
      employee: {
        id: "emp-1",
        name: "Jan Nowak",
        first_name: "Jan",
        last_name: "Nowak",
        status: "active",
      },
    });
    listEmployeesSummaryMock.mockResolvedValueOnce({
      employees: [
        {
          id: "emp-1",
          name: "Jan Nowak",
          first_name: "Jan",
          last_name: "Nowak",
          status: "active",
        },
      ],
      operational_employees: [],
      relation_summaries: [],
    });

    const result = await saveEmployeeRecord({
      employee: null,
      values: {
        first_name: "Jan",
        last_name: "Nowak",
        worker_code: "WK-1",
        position: "Monter",
        status: "active",
        employment_date: "",
        employment_end_date: "",
        street: "",
        city: "",
        phone: "",
        medical_exam_valid_until: "",
      },
      bootstrap: {
        directoryEmployees: [],
        operationalEmployees: [],
        relationSummaries: [],
      },
    });

    expect(createEmployeeMock).toHaveBeenCalledTimes(1);
    expect(updateEmployeeMock).not.toHaveBeenCalled();
    expect(listEmployeesSummaryMock).toHaveBeenCalledTimes(1);
    expect(result.selectedEmployeeKey).toBe("id:emp-1");
  });
});
