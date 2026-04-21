import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

describe("proxy auth boundary", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows protected routes when the primary session cookie exists", async () => {
    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects protected routes to login when the session cookie is missing", async () => {
    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/employees")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://clode-next.vercel.app/login?next=%2Femployees&reason=session-expired"
    );
  });

  it("allows the login route to render even when a stale cookie is present", async () => {
    const response = await proxy(
      new NextRequest("https://clode-next.vercel.app/login?next=%2Femployees", {
        headers: { cookie: "clode_session=test-session" },
      })
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
