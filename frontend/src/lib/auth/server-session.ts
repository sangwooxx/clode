import { cookies } from "next/headers";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";

export function buildBackendCookieHeader(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  return SESSION_COOKIE_NAMES.map((name) => {
    const value = cookieStore.get(name)?.value;
    return value ? `${name}=${value}` : "";
  })
    .filter(Boolean)
    .join("; ");
}

export async function getBackendCookieHeader() {
  return buildBackendCookieHeader(await cookies());
}
