import { cache } from "react";
import { redirect } from "next/navigation";
import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
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
