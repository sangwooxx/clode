import { afterEach, describe, expect, it } from "vitest";
import { resolveBackendOrigin } from "../src/lib/api/backend-origin";

describe("resolveBackendOrigin", () => {
  afterEach(() => {
    delete process.env.CLODE_BACKEND_ORIGIN;
    delete process.env.NEXT_PUBLIC_CLODE_BACKEND_ORIGIN;
    delete process.env.VERCEL_ENV;
  });

  it("defaults to localhost outside production", () => {
    expect(resolveBackendOrigin()).toBe("http://127.0.0.1:8787");
  });

  it("uses the canonical backend alias for production when nothing is configured", () => {
    process.env.VERCEL_ENV = "production";

    expect(resolveBackendOrigin()).toBe("https://clode-iota.vercel.app");
  });

  it("normalizes stale immutable Vercel backend urls to the canonical production alias", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CLODE_BACKEND_ORIGIN =
      "https://backend-mz97ajkt8-sangwooxxs-projects.vercel.app///";

    expect(resolveBackendOrigin()).toBe("https://clode-iota.vercel.app");
  });

  it("normalizes the legacy production backend alias to the canonical production alias", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CLODE_BACKEND_ORIGIN = "https://clode-api.vercel.app///";

    expect(resolveBackendOrigin()).toBe("https://clode-iota.vercel.app");
  });

  it("keeps explicit non-Vercel origins unchanged", () => {
    process.env.VERCEL_ENV = "production";
    process.env.CLODE_BACKEND_ORIGIN = "https://api.example.com///";

    expect(resolveBackendOrigin()).toBe("https://api.example.com");
  });
});
