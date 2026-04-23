import { describe, expect, it } from "vitest";
import { getModuleNavigation } from "../src/features/navigation/module-nav";
import {
  canAccessView,
  canManageView,
  normalizePermissions,
  normalizeRole,
} from "../src/lib/auth/permissions";

describe("frontend permission model", () => {
  it("filters grouped navigation from capabilities and child-route visibility", () => {
    const user = {
      role: "read-only",
      permissions: normalizePermissions("read-only", {
        dashboardView: true,
        contractsView: true,
        invoicesView: false,
        employeesView: false,
        workwearView: true,
        hoursView: false,
        planningView: false,
        vacationsView: false,
        settingsView: true,
      }),
      capabilities: {
        "dashboard.view": true,
        "contracts.view": true,
        "finance.view": false,
        "resources.view": true,
        "operations.view": false,
        "admin.view": true,
      },
    };

    expect(getModuleNavigation(user as never)).toEqual([
      {
        href: "/dashboard",
        label: "Pulpit",
        shortLabel: "PU",
        activeHrefs: ["/dashboard"],
      },
      {
        href: "/contracts",
        label: "Kontrakty",
        shortLabel: "KO",
        activeHrefs: ["/contracts"],
      },
      {
        href: "/workwear",
        label: "Zasoby",
        shortLabel: "ZA",
        activeHrefs: ["/employees", "/workwear"],
      },
      {
        href: "/settings",
        label: "Administracja",
        shortLabel: "AD",
        activeHrefs: ["/settings"],
      },
    ]);
  });

  it("uses deterministic first-visible-child ordering inside grouped nav", () => {
    const user = {
      role: "kierownik",
      permissions: normalizePermissions("kierownik", {
        hoursView: false,
        hoursManage: false,
        planningView: true,
        vacationsView: true,
        employeesView: true,
        workwearView: true,
      }),
      capabilities: {
        "resources.view": true,
        "operations.view": true,
      },
    };

    expect(
      getModuleNavigation(user as never).map((item) => [item.label, item.href])
    ).toContainEqual(["Zasoby", "/employees"]);
    expect(
      getModuleNavigation(user as never).map((item) => [item.label, item.href])
    ).toContainEqual(["Operacje", "/planning"]);
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

  it("falls back to grouped navigation derived from legacy role names and permissions", () => {
    expect(normalizeRole("ksi\u0119gowo\u015b\u0107")).toBe("ksiegowosc");
    expect(normalizeRole("u\u017cytkownik")).toBe("read-only");

    const accountingNavigation = getModuleNavigation({
      role: "ksi\u0119gowo\u015b\u0107",
      permissions: normalizePermissions("ksi\u0119gowo\u015b\u0107", {}),
    } as never).map((item) => item.href);

    expect(accountingNavigation).toEqual([
      "/dashboard",
      "/contracts",
      "/invoices",
      "/hours",
    ]);
  });
});
