import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

describe("proxy auth boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows protected routes when the primary session cookie exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://clode-next.vercel.app/api/v1/auth/session"),
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Cookie: "clode_session=test-session",
        }),
      })
    );
  });

  it("allows protected routes when only the legacy session cookie exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "agent_session=legacy-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects protected routes to login when the session cookie is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clode-next.vercel.app/login?next=%2Femployees&reason=session-expired"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the login route to render even when a stale cookie is present", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/login?next=%2Femployees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects protected routes when the backend rejects the session cookie", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "clode_session=stale-session; agent_session=legacy-session" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clode-next.vercel.app/login?next=%2Femployees&reason=session-expired"
    );
    expect(response.cookies.get("clode_session")?.value).toBe("");
    expect(response.cookies.get("agent_session")?.value).toBe("");
  });

  it("redirects protected routes when session validation cannot reach the backend", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream unavailable")));

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clode-next.vercel.app/login?next=%2Femployees&reason=session-expired"
    );
  });
});
