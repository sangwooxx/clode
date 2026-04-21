import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveServerApiOrigin } from "../src/lib/api/server-fetch";

describe("resolveServerApiOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers forwarded host and proto when available", () => {
    const headersLike = {
      get(name: string) {
        const values: Record<string, string | null> = {
          "x-forwarded-host": "clode-next.vercel.app",
          "x-forwarded-proto": "https",
          host: "internal-host",
        };
        return values[name] ?? null;
      },
    };

    expect(resolveServerApiOrigin(headersLike as never)).toBe(
      "https://clode-next.vercel.app"
    );
  });

  it("falls back to the request host when forwarded headers are absent", () => {
    const headersLike = {
      get(name: string) {
        const values: Record<string, string | null> = {
          host: "127.0.0.1:3000",
        };
        return values[name] ?? null;
      },
    };

    expect(resolveServerApiOrigin(headersLike as never)).toBe(
      "http://127.0.0.1:3000"
    );
  });

  it("falls back to the direct host when the forwarded host is malformed", () => {
    const headersLike = {
      get(name: string) {
        const values: Record<string, string | null> = {
          "x-forwarded-host": "https://evil.example.com/bad",
          "x-forwarded-proto": "https",
          host: "app.example.com",
        };
        return values[name] ?? null;
      },
    };

    expect(resolveServerApiOrigin(headersLike as never)).toBe("https://app.example.com");
  });

  it("throws in production when no valid request host is available", () => {
    vi.stubEnv("NODE_ENV", "production");

    const headersLike = {
      get() {
        return null;
      },
    };

    expect(() => resolveServerApiOrigin(headersLike as never)).toThrow(
      "Cannot resolve server API origin without a valid request host."
    );
  });
});
