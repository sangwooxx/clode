import { describe, expect, it } from "vitest";

import {
  buildSelectableVacationEmployeeOptions,
  resolveVacationApprovalMode,
} from "@/features/vacations/mappers";

describe("vacations workflow helpers", () => {
  it("falls back to permission when workflow is missing", () => {
    expect(resolveVacationApprovalMode(undefined)).toBe("permission");
    expect(resolveVacationApprovalMode(null)).toBe("permission");
  });

  it("returns the configured approval mode when present", () => {
    expect(
      resolveVacationApprovalMode({
        vacationApprovalMode: "admin",
      } as Parameters<typeof resolveVacationApprovalMode>[0])
    ).toBe("admin");
  });

  it("keeps an edited inactive employee selectable without duplicating active options", () => {
    const options = buildSelectableVacationEmployeeOptions({
      activeEmployees: [
        {
          key: "id:emp-2",
          id: "emp-2",
          name: "Anna Kowalska",
          first_name: "Anna",
          last_name: "Kowalska",
          worker_code: "AK-1",
          position: "Brygadzistka",
          status: "active",
          source: "directory",
          isPersisted: true,
        },
      ],
      editingEmployee: {
        key: "id:emp-1",
        id: "emp-1",
        name: "Jan Nowak",
        first_name: "Jan",
        last_name: "Nowak",
        worker_code: "JN-1",
        position: "Monter",
        status: "inactive",
        source: "directory",
        isPersisted: true,
      },
    });

    expect(options).toHaveLength(2);
    expect(options[1]).toMatchObject({
      key: "id:emp-1",
      status: "inactive",
      description: "Historyczny wpis pracownika nieaktywnego",
    });
  });
});
