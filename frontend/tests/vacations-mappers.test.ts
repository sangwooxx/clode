import { describe, expect, it } from "vitest";

import { resolveVacationApprovalMode } from "@/features/vacations/mappers";

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
});
