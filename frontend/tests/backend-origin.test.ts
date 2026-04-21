import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBackendOrigin } from "../src/lib/api/backend-origin";

describe("resolveBackendOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to localhost in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveBackendOrigin()).toBe("http://127.0.0.1:8787");
  });

  it("uses the configured backend origin when provided", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLODE_BACKEND_ORIGIN", "https://api.example.com///");

    expect(resolveBackendOrigin()).toBe("https://api.example.com");
  });

  it("falls back to the current request origin when the backend is served from the same host", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(
      resolveBackendOrigin({ requestOrigin: "https://clode-web-preview.vercel.app/app" })
    ).toBe("https://clode-web-preview.vercel.app");
  });

  it("rejects malformed configured origins instead of silently accepting them", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLODE_BACKEND_ORIGIN", "://bad host");

    expect(() => resolveBackendOrigin()).toThrow(
      "Cannot resolve backend origin without CLODE_BACKEND_ORIGIN or a same-origin request context."
    );
  });

  it("throws in production when no safe backend origin can be resolved", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => resolveBackendOrigin()).toThrow(
      "Cannot resolve backend origin without CLODE_BACKEND_ORIGIN or a same-origin request context."
    );
  });
});
