import { describe, expect, it } from "vitest";
import { resolveServerApiOrigin } from "../src/lib/api/server-fetch";

describe("resolveServerApiOrigin", () => {
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
});
