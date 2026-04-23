import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveFirstAccessibleAppPath } from "../src/lib/auth/access-routes";
import { buildBackendCookieHeader } from "../src/lib/auth/server-session";
import { buildLoginRedirectPath } from "../src/lib/auth/login-redirect";
import {
  buildExpiredSessionCookieHeader,
  buildExpiredSessionCookieHeaders,
} from "../src/lib/auth/session-cookies";
import { getLoginStatusMessage } from "../src/lib/auth/login-status";
import { normalizeUser } from "../src/lib/api/auth";

describe("normalizeUser", () => {
  it("keeps backend-provided profile, capabilities and scope", () => {
    const normalized = normalizeUser({
      id: "user-1",
      username: "maria",
      name: "Maria Kowalska",
      displayName: "Maria K.",
      email: "maria@example.com",
      role: "read-only",
      status: "inactive",
      is_active: false,
      permissions: { invoicesView: true },
      canApproveVacations: false,
      profile: "delivery",
      capabilities: {
        "dashboard.view": true,
        "contracts.view": false,
        "finance.view": true,
        "resources.view": true,
        "operations.view": false,
        "admin.view": false,
      },
      scope: {
        contracts: {
          mode: "all",
        },
      },
      created_at: "2026-04-01T10:00:00Z",
      updated_at: "2026-04-02T10:00:00Z",
      last_login_at: "2026-04-03T10:00:00Z",
    });

    expect(normalized).toMatchObject({
      id: "user-1",
      username: "maria",
      displayName: "Maria K.",
      name: "Maria Kowalska",
      email: "maria@example.com",
      role: "read-only",
      status: "inactive",
      isActive: false,
      permissions: { invoicesView: true },
      canApproveVacations: false,
      profile: "delivery",
      scope: {
        contracts: {
          mode: "all",
        },
      },
      createdAt: "2026-04-01T10:00:00Z",
      updatedAt: "2026-04-02T10:00:00Z",
      lastLoginAt: "2026-04-03T10:00:00Z",
    });
    expect(normalized?.capabilities).toMatchObject({
      "dashboard.view": true,
      "finance.view": true,
      "resources.view": true,
      "operations.view": false,
    });
  });

  it("derives profile, capabilities and default scope from legacy payloads", () => {
    const normalized = normalizeUser({
      id: "user-2",
      username: "ania",
      name: "Anna Test",
      displayName: "Anna Test",
      email: "anna@example.com",
      role: "kierownik",
      status: "active",
      is_active: true,
      permissions: {
        dashboardView: true,
        contractsView: true,
        invoicesView: false,
        employeesView: false,
        workwearView: true,
        hoursView: false,
        planningView: true,
        vacationsView: false,
      },
      canApproveVacations: false,
    });

    expect(normalized?.profile).toBe("delivery");
    expect(normalized?.scope).toEqual({ contracts: { mode: "all" } });
    expect(normalized?.capabilities).toMatchObject({
      "dashboard.view": true,
      "contracts.view": true,
      "finance.view": false,
      "resources.view": true,
      "operations.view": true,
      "vacations.approve": false,
    });
  });

  it("nie pozwala backendowym capabilities ukryc legacy-dozwolonego dostepu", () => {
    const normalized = normalizeUser({
      id: "user-3",
      username: "ewa",
      name: "Ewa Test",
      displayName: "Ewa Test",
      email: "ewa@example.com",
      role: "read-only",
      status: "active",
      is_active: true,
      permissions: {
        dashboardView: true,
        contractsView: true,
        invoicesView: true,
      },
      canApproveVacations: false,
      capabilities: {
        "dashboard.view": true,
        "contracts.view": true,
        "finance.view": false,
      },
    });

    expect(normalized?.capabilities).toMatchObject({
      "dashboard.view": true,
      "contracts.view": true,
      "finance.view": true,
    });
  });

  it("wyprowadza spójne profile i capabilities dla ról nie-admin", () => {
    const cases = [
      {
        role: "ksiegowosc",
        expectedProfile: "finance",
        expectedCapabilities: {
          "dashboard.view": true,
          "contracts.view": true,
          "finance.view": true,
          "resources.view": false,
          "operations.view": true,
          "admin.view": false,
          "finance.manage": true,
        },
      },
      {
        role: "kierownik",
        expectedProfile: "delivery",
        expectedCapabilities: {
          "dashboard.view": true,
          "contracts.view": true,
          "finance.view": true,
          "resources.view": true,
          "operations.view": true,
          "admin.view": false,
          "resources.manage": true,
          "operations.manage": true,
        },
      },
      {
        role: "read-only",
        expectedProfile: "viewer",
        expectedCapabilities: {
          "dashboard.view": true,
          "contracts.view": true,
          "finance.view": true,
          "resources.view": false,
          "operations.view": false,
          "admin.view": false,
        },
      },
    ] as const;

    for (const testCase of cases) {
      const normalized = normalizeUser({
        id: `user-${testCase.role}`,
        username: testCase.role,
        name: `User ${testCase.role}`,
        displayName: `User ${testCase.role}`,
        email: `${testCase.role}@example.com`,
        role: testCase.role,
        status: "active",
        is_active: true,
        permissions: {},
        canApproveVacations: false,
      });

      expect(normalized?.profile).toBe(testCase.expectedProfile);
      expect(normalized?.capabilities).toMatchObject(testCase.expectedCapabilities);
    }
  });

  it("returns null without a username", () => {
    expect(normalizeUser({ name: "Missing username" } as never)).toBeNull();
  });
});

describe("resolveFirstAccessibleAppPath", () => {
  it("zwraca pierwszy dozwolony route dla ról nie-admin", () => {
    expect(
      resolveFirstAccessibleAppPath({
        role: "ksiegowosc",
        permissions: {},
      })
    ).toBe("/dashboard");
    expect(
      resolveFirstAccessibleAppPath({
        role: "kierownik",
        permissions: {},
      })
    ).toBe("/dashboard");
    expect(
      resolveFirstAccessibleAppPath({
        role: "read-only",
        permissions: {},
      })
    ).toBe("/dashboard");
  });

  it("pomija niedozwolone widoki i znajduje kolejny dostępny route", () => {
    expect(
      resolveFirstAccessibleAppPath({
        role: "read-only",
        permissions: {
          dashboardView: false,
          contractsView: true,
        },
      })
    ).toBe("/contracts");

    expect(
      resolveFirstAccessibleAppPath({
        role: "read-only",
        permissions: {
          dashboardView: false,
          contractsView: false,
          invoicesView: false,
          hoursView: true,
        },
      })
    ).toBe("/hours");
  });

  it("wraca do /login, gdy użytkownik nie ma żadnego dozwolonego route", () => {
    expect(
      resolveFirstAccessibleAppPath({
        role: "read-only",
        permissions: {
          dashboardView: false,
          contractsView: false,
          invoicesView: false,
        },
      })
    ).toBe("/login");
  });
});

describe("buildBackendCookieHeader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes the active and legacy session cookies in stable order", () => {
    const cookieStore = {
      get(name: string) {
        const values: Record<string, string | undefined> = {
          clode_session: "current-session",
          agent_session: "legacy-session",
        };

        const value = values[name];
        return value ? { value } : undefined;
      },
    };

    expect(buildBackendCookieHeader(cookieStore as never)).toBe(
      "clode_session=current-session; agent_session=legacy-session"
    );
  });

  it("skips missing cookies without adding separators", () => {
    const cookieStore = {
      get(name: string) {
        if (name === "clode_session") {
          return { value: "current-session" };
        }

        return undefined;
      },
    };

    expect(buildBackendCookieHeader(cookieStore as never)).toBe(
      "clode_session=current-session"
    );
  });
});

describe("auth boundary helpers", () => {
  it("builds login redirects with session-expired reason", () => {
    expect(buildLoginRedirectPath("/hours?month=2026-04", "session-expired")).toBe(
      "/login?next=%2Fhours%3Fmonth%3D2026-04&reason=session-expired"
    );
  });

  it("builds expired session cookie headers for every known session cookie", () => {
    expect(buildExpiredSessionCookieHeaders(false)).toEqual([
      buildExpiredSessionCookieHeader("clode_session", false),
      buildExpiredSessionCookieHeader("agent_session", false),
    ]);
  });

  it("maps known login reason to a user-facing status message", () => {
    expect(getLoginStatusMessage("session-expired")).toContain("Sesja wygasla");
    expect(getLoginStatusMessage("other")).toBeNull();
  });
});
