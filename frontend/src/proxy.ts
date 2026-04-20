import { NextRequest, NextResponse } from "next/server";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { buildLoginRedirectPath } from "@/lib/auth/login-redirect";
import {
  buildExpiredSessionCookieHeaders,
} from "@/lib/auth/session-cookies";
import { PRIMARY_SESSION_COOKIE_NAME } from "@/lib/auth/session-keys";

const protectedPrefixes = [
  "/dashboard",
  "/contracts",
  "/invoices",
  "/work-cards",
  "/hours",
  "/employees",
  "/planning",
  "/vacations",
  "/workwear",
  "/settings",
];

type SessionValidationResult = "missing" | "valid" | "invalid" | "unknown";

function hasSessionCookie(request: NextRequest) {
  return request.cookies.has(PRIMARY_SESSION_COOKIE_NAME);
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function applyExpiredSessionCookies(response: NextResponse, request: NextRequest) {
  const secure = request.nextUrl.protocol === "https:";
  for (const cookieHeader of buildExpiredSessionCookieHeaders(secure)) {
    response.headers.append("set-cookie", cookieHeader);
  }
  return response;
}

function buildProtectedLoginRedirect(request: NextRequest) {
  const loginUrl = new URL(
    buildLoginRedirectPath(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
      "session-expired"
    ),
    request.url
  );
  return loginUrl;
}

function buildAuthenticatedRedirect(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next");
  const target =
    typeof requestedNext === "string" && requestedNext.startsWith("/")
      ? requestedNext
      : "/dashboard";
  return new URL(target, request.url);
}

async function validateSession(request: NextRequest): Promise<SessionValidationResult> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return "missing";
  }

  try {
    const response = await fetch(`${resolveBackendOrigin()}/api/v1/auth/session`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader,
      },
      cache: "no-store",
      redirect: "manual",
    });

    if (response.status === 204 || response.ok) {
      return "valid";
    }
    if (response.status === 401) {
      return "invalid";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedPath = isProtectedPath(pathname);
  const loginPath = pathname === "/login";
  const sessionExists = hasSessionCookie(request);

  if (!protectedPath && !loginPath) {
    return NextResponse.next();
  }

  if (!sessionExists) {
    if (protectedPath) {
      return NextResponse.redirect(buildProtectedLoginRedirect(request));
    }
    return NextResponse.next();
  }

  const validation = await validateSession(request);

  if (validation === "valid") {
    if (loginPath) {
      return NextResponse.redirect(buildAuthenticatedRedirect(request));
    }
    return NextResponse.next();
  }

  if (validation === "invalid") {
    if (loginPath) {
      return applyExpiredSessionCookies(NextResponse.next(), request);
    }
    return applyExpiredSessionCookies(
      NextResponse.redirect(buildProtectedLoginRedirect(request)),
      request
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/contracts/:path*",
    "/invoices/:path*",
    "/work-cards/:path*",
    "/hours/:path*",
    "/employees/:path*",
    "/planning/:path*",
    "/vacations/:path*",
    "/workwear/:path*",
    "/settings/:path*",
  ],
};
