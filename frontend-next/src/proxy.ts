import { NextRequest, NextResponse } from "next/server";
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
  "/settings"
];

function hasSessionCookie(request: NextRequest) {
  return SESSION_COOKIE_NAMES.some((cookieName) => request.cookies.has(cookieName));
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const sessionExists = hasSessionCookie(request);

  if (pathname === "/login" && sessionExists) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (isProtected && !sessionExists) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
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
    "/settings/:path*"
  ]
};
