import { describe, expect, it } from "vitest";
import {
  buildHoursEmployeeRows,
  buildHoursMonthKey,
} from "../src/features/hours/hours-view-helpers";

describe("hours view helpers", () => {
  it("builds a valid month key only for YYYY-MM values", () => {
    expect(buildHoursMonthKey("2026", "04")).toBe("2026-04");
    expect(buildHoursMonthKey("2026", "4")).toBe("");
    expect(buildHoursMonthKey("202", "04")).toBe("");
  });

  it("aggregates employee rows by employee and contract", () => {
    const rows = buildHoursEmployeeRows({
      entries: [
        {
          id: "te-1",
          month_id: "hm-1",
          month_key: "2026-04",
          month_label: "kwiecien 2026",
          employee_id: "emp-1",
          employee_name: "Jan Nowak",
          contract_id: "c-1",
          contract_name: "Kontrakt 1",
          hours: 8,
          cost_amount: 120,
        },
        {
          id: "te-2",
          month_id: "hm-1",
          month_key: "2026-04",
          month_label: "kwiecien 2026",
          employee_id: "emp-1",
          employee_name: "Jan Nowak",
          contract_id: "",
          contract_name: "Nieprzypisane",
          hours: 2,
          cost_amount: 20,
        },
      ],
      historicalEmployees: [
        {
          id: "emp-1",
          name: "Jan Nowak",
          position: "Monter",
          worker_code: "WK-1",
          status: "active",
        },
      ],
      contracts: [
        {
          id: "c-1",
          contract_number: "001",
          name: "Kontrakt 1",
          investor: "Inwestor",
          signed_date: "2026-01-01",
          end_date: "",
          contract_value: 1000,
          status: "active",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
      search: "",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      employeeId: "emp-1",
      totalHours: 10,
      totalCost: 140,
      entriesCount: 2,
    });
    expect(rows[0].contracts).toHaveLength(2);
  });
});
