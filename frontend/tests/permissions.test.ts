import { describe, expect, it } from "vitest";
import { getModuleNavigation } from "../src/features/navigation/module-nav";
import {
  canAccessView,
  canManageView,
  normalizePermissions,
} from "../src/lib/auth/permissions";

describe("frontend permission model", () => {
  it("filters module navigation by effective permissions", () => {
    const user = {
      role: "read-only",
      permissions: normalizePermissions("read-only", {
        dashboardView: true,
        contractsView: true,
        invoicesView: true,
        hoursView: true,
      }),
    };

    expect(getModuleNavigation(user as never).map((item) => item.href)).toEqual([
      "/dashboard",
      "/contracts",
      "/invoices",
      "/work-cards",
      "/hours",
    ]);
  });

  it("treats manage permissions as the source of truth for write affordances", () => {
    const user = {
      role: "kierownik",
      permissions: normalizePermissions("read-only", {
        employeesView: true,
        employeesManage: false,
        vacationsView: true,
        vacationsManage: true,
      }),
    };

    expect(canAccessView(user as never, "employeesView")).toBe(true);
    expect(canManageView(user as never, "employeesView")).toBe(false);
    expect(canManageView(user as never, "vacationsView")).toBe(true);
  });
});
