import { NextRequest, NextResponse } from "next/server";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";
import { buildExpiredSessionCookieHeaders } from "@/lib/auth/session-cookies";

export const dynamic = "force-dynamic";

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  try {
    const backendOrigin = resolveBackendOrigin({ requestOrigin: request.nextUrl.origin });
    const search = request.nextUrl.search ?? "";
    const upstreamUrl = `${backendOrigin}/api/v1/${path.join("/")}${search}`;
    const headers = new Headers();

    const contentType = request.headers.get("content-type");
    const accept = request.headers.get("accept");
    const cookie = request.headers.get("cookie");
    const secureCookies = request.nextUrl.protocol === "https:";

    if (contentType) headers.set("content-type", contentType);
    if (accept) headers.set("accept", accept);
    if (cookie) headers.set("cookie", cookie);

    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text();

    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store"
    });

    const responseHeaders = new Headers();
    const responseContentType = upstream.headers.get("content-type");
    const setCookies =
      "getSetCookie" in upstream.headers &&
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : upstream.headers.get("set-cookie")
          ? [upstream.headers.get("set-cookie") as string]
          : [];

    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }
    for (const cookieValue of setCookies) {
      responseHeaders.append("set-cookie", cookieValue);
    }
    if (upstream.status === 401 && cookie) {
      for (const expiredCookie of buildExpiredSessionCookieHeaders(secureCookies)) {
        responseHeaders.append("set-cookie", expiredCookie);
      }
    }

    const payload = upstream.status === 204 ? null : await upstream.text();

    return new NextResponse(payload, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? `Next proxy could not reach backend: ${error.message}`
            : "Next proxy could not reach backend."
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  return proxyRequest(request, context);
}
