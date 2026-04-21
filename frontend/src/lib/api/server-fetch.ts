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
};

export function resolveServerApiOrigin(headerStore: Awaited<ReturnType<typeof headers>>) {
  const forwardedHost = headerStore.get("x-forwarded-host");
  const host = forwardedHost || headerStore.get("host");
  const forwardedProto = headerStore.get("x-forwarded-proto");
  const localHost = (host || "").toLowerCase();
  const protocol =
    forwardedProto ||
    (localHost.startsWith("127.0.0.1") ||
    localHost.startsWith("localhost") ||
    localHost.endsWith(".local")
      ? "http"
      : undefined) ||
    (process.env.NODE_ENV === "development" ? "http" : "https");

  if (host) {
    return `${protocol}://${host}`;
  }

  return process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:3000"
    : "https://clode-next.vercel.app";
}

export async function fetchBackendJsonServer<T>(
  path: string,
  options: ServerFetchOptions = {}
) {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieHeader = buildBackendCookieHeader(cookieStore);
  const response = await fetch(`${resolveServerApiOrigin(headerStore)}/api/v1${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    cache: options.cache ?? "no-store",
  });

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
