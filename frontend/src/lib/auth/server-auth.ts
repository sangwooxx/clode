import { cache } from "react";
import { redirect } from "next/navigation";
import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import { resolveFirstAccessibleAppPath } from "@/lib/auth/access-routes";
import { canAccessView, type ViewPermissionId } from "@/lib/auth/permissions";
import {
  toAuthenticatedUser,
  type ApiUserRecord,
  type AuthenticatedUser,
} from "@/lib/api/user-record";

const SESSION_LOOKUP_TIMEOUT_MS = 5_000;

const readOptionalServerSessionCached = cache(async (): Promise<AuthenticatedUser | null> => {
  try {
    const { payload } = await fetchBackendJsonServer<{ user?: ApiUserRecord }>("/auth/me", {
      allowStatuses: [401],
      timeoutMs: SESSION_LOOKUP_TIMEOUT_MS,
    });

    return toAuthenticatedUser(payload?.user);
  } catch {
    return null;
  }
});

export async function readOptionalServerSession(): Promise<AuthenticatedUser | null> {
  return readOptionalServerSessionCached();
}

export async function requireServerSession(nextPath: string) {
  const user = await readOptionalServerSession();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}

export async function requireServerViewAccess(nextPath: string, viewId: ViewPermissionId) {
  const user = await requireServerSession(nextPath);

  if (!canAccessView(user, viewId)) {
    const fallbackPath = resolveFirstAccessibleAppPath(user);
    if (fallbackPath === "/login") {
      redirect(`/login?next=${encodeURIComponent(nextPath)}`);
    }
    redirect(fallbackPath);
  }

  return user;
}
