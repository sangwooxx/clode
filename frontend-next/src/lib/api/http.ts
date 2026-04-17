import { SESSION_STORAGE_KEYS } from "@/lib/auth/session-keys";

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function hasWindow() {
  return typeof window !== "undefined";
}

export function resolveApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_CLODE_API_BASE_URL?.trim();
  return configured && configured.length > 0
    ? configured.replace(/\/+$/, "")
    : "/api/v1";
}

export function readStoredSessionToken() {
  if (!hasWindow()) {
    return "";
  }

  for (const key of SESSION_STORAGE_KEYS) {
    const sessionValue = window.sessionStorage.getItem(key);
    if (sessionValue) {
      return sessionValue;
    }
  }

  for (const key of SESSION_STORAGE_KEYS) {
    const localValue = window.localStorage.getItem(key);
    if (localValue) {
      return localValue;
    }
  }

  return "";
}

export function writeStoredSessionToken(token: string) {
  if (!hasWindow()) {
    return;
  }

  for (const key of SESSION_STORAGE_KEYS) {
    if (token) {
      window.sessionStorage.setItem(key, token);
      window.localStorage.setItem(key, token);
    } else {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    }
  }
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  timeoutMs?: number;
};

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export function createHttpClient(baseUrl = resolveApiBaseUrl()) {
  return async function request<T = unknown>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort("Request timeout"),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
      const sessionToken = readStoredSessionToken();
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(sessionToken
            ? {
                "X-Clode-Session": sessionToken,
                "X-Agent-Session": sessionToken
              }
            : {}),
          ...options.headers
        },
        credentials: "include",
        signal: controller.signal
      });

      const payload = await parseResponseBody(response);

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof (payload as { error?: unknown }).error === "string"
            ? ((payload as { error: string }).error ?? "Request failed")
            : `Request failed with status ${response.status}`;
        throw new ApiError(message, response.status, payload);
      }

      return payload as T;
    } finally {
      clearTimeout(timeout);
    }
  };
}

export const http = createHttpClient();
