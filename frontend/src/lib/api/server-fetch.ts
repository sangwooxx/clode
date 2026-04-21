import { cookies } from "next/headers";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { buildLoginRedirectPath } from "@/lib/auth/login-redirect";
import { buildBackendCookieHeader } from "@/lib/auth/server-session";

type ServerFetchOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  nextPath?: string;
  allowStatuses?: number[];
  cache?: RequestCache;
  timeoutMs?: number;
};

const DEFAULT_SERVER_FETCH_TIMEOUT_MS = 10_000;

type ServerHeaderStore = Awaited<ReturnType<typeof headers>>;

function getSingleHeaderValue(value: string | null) {
  const normalized = value?.split(",")[0]?.trim();
  return normalized ? normalized : null;
}

function normalizeHostHeader(value: string | null) {
  const candidate = getSingleHeaderValue(value);
  if (!candidate || candidate.includes("://")) {
    return null;
  }

  try {
    const parsed = new URL(`http://${candidate}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }

    return {
      host: parsed.host,
      hostname: parsed.hostname,
    };
  } catch {
    return null;
  }
}

function normalizeForwardedProto(value: string | null) {
  const candidate = getSingleHeaderValue(value)?.toLowerCase();
  return candidate === "http" || candidate === "https" ? candidate : null;
}

function isLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized === "localhost" ||
    normalized.endsWith(".local")
  );
}

export function resolveServerApiOrigin(headerStore: ServerHeaderStore) {
  const forwardedHost = normalizeHostHeader(headerStore.get("x-forwarded-host"));
  const directHost = normalizeHostHeader(headerStore.get("host"));
  const requestHost = forwardedHost || directHost;

  if (!requestHost) {
    if (process.env.NODE_ENV === "development") {
      return "http://127.0.0.1:3000";
    }

    throw new Error("Cannot resolve server API origin without a valid request host.");
  }

  const protocol =
    normalizeForwardedProto(headerStore.get("x-forwarded-proto")) ||
    (isLocalHostname(requestHost.hostname) ? "http" : undefined) ||
    (process.env.NODE_ENV === "development" ? "http" : "https");

  return `${protocol}://${requestHost.host}`;
}

export async function fetchBackendJsonServer<T>(
  path: string,
  options: ServerFetchOptions = {}
) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieHeader = buildBackendCookieHeader(cookieStore);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_SERVER_FETCH_TIMEOUT_MS
  );

  let response: Response;

  try {
    response = await fetch(new URL(`/api/v1${path}`, resolveServerApiOrigin(headerStore)), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: options.cache ?? "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Backend timed out while fetching ${path}.`);
    }

    throw error instanceof Error
      ? error
      : new Error(`Backend request failed for ${path}.`);
  } finally {
    clearTimeout(timeout);
  }

  const payload =
    response.status === 204
      ? null
      : ((await response.json().catch(() => null)) as T | { error?: string } | null);

  if (response.status === 401 && !options.allowStatuses?.includes(401)) {
    redirect(buildLoginRedirectPath(options.nextPath, "session-expired") as never);
  }

  if (!response.ok && !options.allowStatuses?.includes(response.status)) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof (payload as { error?: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Backend returned status ${response.status}.`;
    throw new Error(message);
  }

  return {
    status: response.status,
    payload: payload as T | null,
  };
}
