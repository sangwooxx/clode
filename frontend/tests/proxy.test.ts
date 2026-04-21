import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

describe("proxy auth boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows protected routes when the session validates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
        })
      )
    );

    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects protected routes to login when the session is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
      )
    );

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

  it("fails closed for protected routes when session validation cannot be completed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("backend unavailable")));

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
