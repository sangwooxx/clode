import { NextRequest, NextResponse } from "next/server";
import { buildLoginRedirectPath } from "@/lib/auth/login-redirect";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/session-keys";

const SESSION_VALIDATION_PATH = "/api/v1/auth/session";
const SESSION_VALIDATION_TIMEOUT_MS = 5_000;

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

function buildSessionExpiredRedirectResponse(request: NextRequest) {
  const response = NextResponse.redirect(buildProtectedLoginRedirect(request));
  const secure = request.nextUrl.protocol === "https:";

  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set({
      name,
      value: "",
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "lax",
      secure,
    });
  }

  return response;
}

async function validateProtectedSession(
  request: NextRequest
): Promise<"valid" | "invalid"> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SESSION_VALIDATION_TIMEOUT_MS);
  const cookie = request.headers.get("cookie");

  try {
    const response = await fetch(new URL(SESSION_VALIDATION_PATH, request.nextUrl.origin), {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status === 401) {
      return "invalid";
    }

    if (response.ok || response.status === 204) {
      return "valid";
    }

    return "invalid";
  } catch {
    return "invalid";
  } finally {
    clearTimeout(timeout);
  }
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

  const sessionValidation = await validateProtectedSession(request);
  if (sessionValidation !== "valid") {
    return buildSessionExpiredRedirectResponse(request);
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
