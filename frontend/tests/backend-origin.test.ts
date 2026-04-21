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

  it("accepts NEXT_PUBLIC fallback when the server-side origin is not set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLODE_BACKEND_ORIGIN", "https://preview.example.com/");

    expect(resolveBackendOrigin()).toBe("https://preview.example.com");
  });

  it("rejects malformed configured origins instead of silently accepting them", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLODE_BACKEND_ORIGIN", "://bad host");

    expect(() => resolveBackendOrigin()).toThrow(
      "Cannot resolve backend origin without CLODE_BACKEND_ORIGIN outside local development."
    );
  });

  it("throws outside local development when there is no configured backend origin", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => resolveBackendOrigin()).toThrow(
      "Cannot resolve backend origin without CLODE_BACKEND_ORIGIN outside local development."
    );
  });
});
