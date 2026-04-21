import { describe, expect, it } from "vitest";

import {
  buildEmployeeDirectory,
  buildEmployeeRelations,
} from "@/features/employees/mappers";

describe("employee summary mappers", () => {
  it("merges canonical and operational employees without raw history payloads", () => {
    const employees = buildEmployeeDirectory({
      directoryEmployees: [
        {
          id: "emp-1",
          name: "Nowak Jan",
          first_name: "Jan",
          last_name: "Nowak",
          worker_code: "WK-1",
          status: "active",
        },
      ],
      operationalEmployees: [
        {
          id: "emp-1",
          name: "Nowak Jan",
          status: "active",
        },
      ],
    });

    expect(employees).toHaveLength(1);
    expect(employees[0]?.key).toBe("id:emp-1");
    expect(employees[0]?.worker_code).toBe("WK-1");
  });

  it("builds relation snapshots from aggregated summaries", () => {
    const employees = buildEmployeeDirectory({
      directoryEmployees: [
        {
          id: "emp-1",
          name: "Nowak Jan",
          status: "active",
        },
      ],
      operationalEmployees: [],
    });
    const relation = buildEmployeeRelations({
      employee: employees[0]!,
      employees,
      relationSummaries: [
        {
          employee_id: "emp-1",
          employee_name: "Nowak Jan",
          hours_entries: 3,
          work_cards: 2,
          months_count: 2,
          total_hours: 24,
          total_cost: 960,
        },
      ],
    });

    expect(relation).toEqual({
      hoursEntries: 3,
      workCards: 2,
      monthsCount: 2,
      totalHours: 24,
      totalCost: 960,
    });
  });
});
