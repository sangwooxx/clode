import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";

export function buildExpiredSessionCookieHeader(name: string, secure = false) {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export function buildExpiredSessionCookieHeaders(secure = false) {
  return SESSION_COOKIE_NAMES.map((name) => buildExpiredSessionCookieHeader(name, secure));
}
