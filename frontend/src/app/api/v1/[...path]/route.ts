import { NextRequest, NextResponse } from "next/server";
import { resolveBackendOrigin } from "@/lib/api/backend-origin";

export const dynamic = "force-dynamic";

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const backendOrigin = resolveBackendOrigin();
  const search = request.nextUrl.search ?? "";
  const upstreamUrl = `${backendOrigin}/api/v1/${path.join("/")}${search}`;
  const headers = new Headers();

  const contentType = request.headers.get("content-type");
  const accept = request.headers.get("accept");
  const cookie = request.headers.get("cookie");
  const clodeSession = request.headers.get("x-clode-session");
  const agentSession = request.headers.get("x-agent-session");

  if (contentType) headers.set("content-type", contentType);
  if (accept) headers.set("accept", accept);
  if (cookie) headers.set("cookie", cookie);
  if (clodeSession) headers.set("x-clode-session", clodeSession);
  if (agentSession) headers.set("x-agent-session", agentSession);

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  try {
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store"
    });

    const responseHeaders = new Headers();
    const responseContentType = upstream.headers.get("content-type");
    const setCookie = upstream.headers.get("set-cookie");

    if (responseContentType) {
      responseHeaders.set("content-type", responseContentType);
    }
    if (setCookie) {
      responseHeaders.append("set-cookie", setCookie);
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
