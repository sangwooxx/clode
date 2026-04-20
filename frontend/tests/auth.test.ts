import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBackendCookieHeader } from "../src/lib/auth/server-session";
import { buildLoginRedirectPath } from "../src/lib/auth/login-redirect";
import {
  buildExpiredSessionCookieHeader,
  buildExpiredSessionCookieHeaders,
} from "../src/lib/auth/session-cookies";
import { getLoginStatusMessage } from "../src/lib/auth/login-status";
import { normalizeUser } from "../src/lib/api/auth";

describe("normalizeUser", () => {
  it("normalizes legacy and camelCase user payloads", () => {
    expect(
      normalizeUser({
        id: "user-1",
        username: "maria",
        name: "Maria Kowalska",
        displayName: "Maria K.",
        email: "maria@example.com",
        role: "admin",
        status: "inactive",
        is_active: false,
        permissions: { invoices: true },
        canApproveVacations: true,
        created_at: "2026-04-01T10:00:00Z",
        updated_at: "2026-04-02T10:00:00Z",
        last_login_at: "2026-04-03T10:00:00Z",
      })
    ).toEqual({
      id: "user-1",
      username: "maria",
      displayName: "Maria K.",
      name: "Maria Kowalska",
      email: "maria@example.com",
      role: "admin",
      status: "inactive",
      isActive: false,
      permissions: { invoices: true },
      canApproveVacations: true,
      createdAt: "2026-04-01T10:00:00Z",
      updatedAt: "2026-04-02T10:00:00Z",
      lastLoginAt: "2026-04-03T10:00:00Z",
    });
  });

  it("returns null without a username", () => {
    expect(normalizeUser({ name: "Missing username" } as never)).toBeNull();
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
