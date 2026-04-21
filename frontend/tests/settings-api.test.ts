import { afterEach, describe, expect, it, vi } from "vitest";
import { appendSettingsAuditLog } from "../src/features/settings/api";

describe("settings audit api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends only business intent fields and trusts backend-generated audit metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          entry: {
            id: "audit-2",
            timestamp: "2026-04-21T10:00:00Z",
            user_id: "user-1",
            user_name: "Admin",
            module: "Administracja",
            action: "Zaktualizowano workflow",
            subject: "Obieg urlopow",
            details: "Akceptacja wg uprawnien uzytkownikow.",
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const nextEntries = await appendSettingsAuditLog({
      actor: {
        username: "admin",
        displayName: "Admin",
        role: "admin",
        permissions: {},
      } as never,
      currentEntries: [
        {
          id: "audit-1",
          timestamp: "2026-04-20T10:00:00Z",
          user_id: "user-1",
          user_name: "Admin",
          module: "Administracja",
          action: "Dodano konto",
          subject: "Nowy uzytkownik",
          details: "Login: test",
        },
      ],
      action: "Zaktualizowano workflow",
      subject: "Obieg urlopow",
      details: "Akceptacja wg uprawnien uzytkownikow.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/settings/audit-log",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          entry: {
            module: "Administracja",
            action: "Zaktualizowano workflow",
            subject: "Obieg urlopow",
            details: "Akceptacja wg uprawnien uzytkownikow.",
          },
        }),
      })
    );
    expect(nextEntries[0]).toMatchObject({
      id: "audit-2",
      timestamp: "2026-04-21T10:00:00Z",
      user_id: "user-1",
      user_name: "Admin",
    });
  });
});
