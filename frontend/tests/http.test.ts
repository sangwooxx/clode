import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createHttpClient, resolveApiBaseUrl } from "../src/lib/api/http";

describe("resolveApiBaseUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_CLODE_API_BASE_URL;
  });

  it("defaults to the Next API proxy path", () => {
    expect(resolveApiBaseUrl()).toBe("/api/v1");
  });

  it("trims trailing slashes from configured base URLs", () => {
    process.env.NEXT_PUBLIC_CLODE_API_BASE_URL = "https://api.example.com///";
    expect(resolveApiBaseUrl()).toBe("https://api.example.com");
  });
});

describe("createHttpClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses successful JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const request = createHttpClient("https://api.example.com");
    await expect(request<{ ok: boolean }>("/ping")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/ping",
      expect.objectContaining({
        credentials: "include",
        headers: expect.objectContaining({
          Accept: "application/json",
          "Content-Type": "application/json",
        }),
      })
    );
  });

  it("throws ApiError with backend error payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        })
      )
    );

    const request = createHttpClient("https://api.example.com");
    await expect(request("/secure")).rejects.toMatchObject({
      name: "ApiError",
      status: 403,
      payload: { error: "Access denied" },
      message: "Access denied",
    } satisfies Partial<ApiError>);
  });
});
