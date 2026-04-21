import { NextRequest, NextResponse } from "next/server";
import { buildLoginRedirectPath } from "@/lib/auth/login-redirect";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";

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

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
}

function isProtectedPath(pathname: string) {
  return protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
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

  if (loginPath) {
    return NextResponse.next();
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
