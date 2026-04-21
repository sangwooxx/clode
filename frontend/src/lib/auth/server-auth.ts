import { redirect } from "next/navigation";
import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import {
  toAuthenticatedUser,
  type ApiUserRecord,
  type AuthenticatedUser,
} from "@/lib/api/user-record";

export async function readOptionalServerSession(): Promise<AuthenticatedUser | null> {
  const { payload } = await fetchBackendJsonServer<{ user?: ApiUserRecord }>("/auth/me", {
    allowStatuses: [401],
  });

  return toAuthenticatedUser(payload?.user);
}

export async function requireServerSession(nextPath: string) {
  const user = await readOptionalServerSession();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return user;
}
