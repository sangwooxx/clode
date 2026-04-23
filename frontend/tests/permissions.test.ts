import { describe, expect, it } from "vitest";
import { getModuleNavigation } from "../src/features/navigation/module-nav";
import {
  canAccessView,
  canManageView,
  normalizePermissions,
  normalizeRole,
} from "../src/lib/auth/permissions";

function navigationLabels(role: string, permissions?: Record<string, boolean>) {
  return getModuleNavigation({
    role,
    permissions: normalizePermissions(role, permissions ?? {}),
  } as never).map((item) => item.label);
}

function navigationByLabel(role: string, permissions?: Record<string, boolean>) {
  return new Map(
    getModuleNavigation({
      role,
      permissions: normalizePermissions(role, permissions ?? {}),
    } as never).map((item) => [item.label, item])
  );
}

describe("frontend permission model", () => {
  it("zachowuje grouped nav i discoverability dla admina", () => {
    const navigation = navigationByLabel("admin");

    expect([...navigation.keys()]).toEqual([
      "Pulpit",
      "Kontrakty",
      "Finanse",
      "Zasoby",
      "Operacje",
      "Administracja",
    ]);

    expect(navigation.get("Finanse")).toMatchObject({
      href: "/invoices",
      children: [{ href: "/invoices", label: "Faktury" }],
      showChildren: true,
    });
    expect(navigation.get("Zasoby")).toMatchObject({
      href: "/employees",
      children: [
        { href: "/employees", label: "Pracownicy" },
        { href: "/workwear", label: "Odziez" },
      ],
      showChildren: true,
    });
    expect(navigation.get("Operacje")).toMatchObject({
      href: "/hours",
      children: [
        { href: "/hours", label: "Godziny" },
        { href: "/work-cards", label: "Karty pracy" },
        { href: "/planning", label: "Planowanie" },
        { href: "/vacations", label: "Urlopy" },
      ],
      showChildren: true,
    });
  });

  it("nie gubi modułów ksiegowosci po zgrupowaniu", () => {
    const navigation = navigationByLabel("ksiegowosc");

    expect([...navigation.keys()]).toEqual(["Pulpit", "Kontrakty", "Finanse", "Operacje"]);
    expect(navigation.get("Finanse")).toMatchObject({
      href: "/invoices",
      children: [{ href: "/invoices", label: "Faktury" }],
    });
    expect(navigation.get("Operacje")).toMatchObject({
      href: "/hours",
      children: [
        { href: "/hours", label: "Godziny" },
        { href: "/work-cards", label: "Karty pracy" },
      ],
    });
  });

  it("nie gubi modułów kierownika po zgrupowaniu", () => {
    const navigation = navigationByLabel("kierownik");

    expect([...navigation.keys()]).toEqual([
      "Pulpit",
      "Kontrakty",
      "Finanse",
      "Zasoby",
      "Operacje",
    ]);
    expect(navigation.get("Finanse")).toMatchObject({
      children: [{ href: "/invoices", label: "Faktury" }],
    });
    expect(navigation.get("Zasoby")).toMatchObject({
      children: [
        { href: "/employees", label: "Pracownicy" },
        { href: "/workwear", label: "Odziez" },
      ],
    });
    expect(navigation.get("Operacje")).toMatchObject({
      children: [
        { href: "/hours", label: "Godziny" },
        { href: "/work-cards", label: "Karty pracy" },
        { href: "/planning", label: "Planowanie" },
        { href: "/vacations", label: "Urlopy" },
      ],
    });
  });

  it("nie gubi modułów read-only po zgrupowaniu", () => {
    const navigation = navigationByLabel("read-only");

    expect([...navigation.keys()]).toEqual(["Pulpit", "Kontrakty", "Finanse"]);
    expect(navigation.get("Finanse")).toMatchObject({
      href: "/invoices",
      children: [{ href: "/invoices", label: "Faktury" }],
      showChildren: true,
    });
  });

  it("uzywa deterministycznej kolejnosci first-visible-child", () => {
    const operationsNavigation = navigationByLabel("kierownik", {
      hoursView: false,
      hoursManage: false,
      planningView: true,
      vacationsView: true,
      employeesView: true,
      workwearView: true,
    });

    expect(operationsNavigation.get("Zasoby")).toMatchObject({
      href: "/employees",
      children: [
        { href: "/employees", label: "Pracownicy" },
        { href: "/workwear", label: "Odziez" },
      ],
    });
    expect(operationsNavigation.get("Operacje")).toMatchObject({
      href: "/planning",
      children: [
        { href: "/planning", label: "Planowanie" },
        { href: "/vacations", label: "Urlopy" },
      ],
    });
  });

  it("zostawia child discoverability przy pojedynczym widocznym dziecku", () => {
    const navigation = navigationByLabel("kierownik", {
      employeesView: false,
      employeesManage: false,
      workwearView: true,
      hoursView: true,
      planningView: false,
      planningManage: false,
      vacationsView: false,
      vacationsManage: false,
    });

    expect(navigation.get("Zasoby")).toMatchObject({
      href: "/workwear",
      children: [{ href: "/workwear", label: "Odziez" }],
    });
    expect(navigation.get("Operacje")).toMatchObject({
      href: "/hours",
      children: [
        { href: "/hours", label: "Godziny" },
        { href: "/work-cards", label: "Karty pracy" },
      ],
    });
  });

  it("nie pozwala nowym capabilities ukryc legacy-dozwolonego modułu", () => {
    const navigation = getModuleNavigation({
      role: "read-only",
      permissions: normalizePermissions("read-only", {
        dashboardView: true,
        contractsView: true,
        invoicesView: true,
      }),
      capabilities: {
        "dashboard.view": true,
        "contracts.view": true,
        "finance.view": false,
      },
    } as never);

    expect(navigation.map((item) => item.label)).toEqual(["Pulpit", "Kontrakty", "Finanse"]);
    expect(navigation.find((item) => item.label === "Finanse")).toMatchObject({
      href: "/invoices",
      children: [{ href: "/invoices", label: "Faktury" }],
    });
  });

  it("traktuje manage permissions jako source of truth dla write affordances", () => {
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

  it("zachowuje fallback do legacy role names i grouped nav z permissions", () => {
    expect(normalizeRole("ksi\u0119gowo\u015b\u0107")).toBe("ksiegowosc");
    expect(normalizeRole("u\u017cytkownik")).toBe("read-only");

    expect(navigationLabels("ksi\u0119gowo\u015b\u0107")).toEqual([
      "Pulpit",
      "Kontrakty",
      "Finanse",
      "Operacje",
    ]);
  });

  it("utrzymuje role matrix dla route access expectations", () => {
    const routeViewMap = {
      "/dashboard": "dashboardView",
      "/contracts": "contractsView",
      "/invoices": "invoicesView",
      "/employees": "employeesView",
      "/hours": "hoursView",
      "/work-cards": "hoursView",
      "/planning": "planningView",
      "/vacations": "vacationsView",
      "/workwear": "workwearView",
      "/settings": "settingsView",
    } as const;

    const expectations = [
      {
        role: "ksiegowosc",
        allowed: ["/dashboard", "/contracts", "/invoices", "/hours", "/work-cards"],
        denied: ["/employees", "/planning", "/vacations", "/workwear", "/settings"],
      },
      {
        role: "kierownik",
        allowed: [
          "/dashboard",
          "/contracts",
          "/invoices",
          "/employees",
          "/hours",
          "/work-cards",
          "/planning",
          "/vacations",
          "/workwear",
        ],
        denied: ["/settings"],
      },
      {
        role: "read-only",
        allowed: ["/dashboard", "/contracts", "/invoices"],
        denied: ["/employees", "/hours", "/work-cards", "/planning", "/vacations", "/workwear", "/settings"],
      },
    ] as const;

    for (const expectation of expectations) {
      const user = {
        role: expectation.role,
        permissions: normalizePermissions(expectation.role, {}),
      };

      for (const route of expectation.allowed) {
        expect(canAccessView(user as never, routeViewMap[route])).toBe(true);
      }
      for (const route of expectation.denied) {
        expect(canAccessView(user as never, routeViewMap[route])).toBe(false);
      }
    }
  });
});
