import { redirect } from "next/navigation";
import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import type { ApiUserRecord } from "@/lib/api/user-record";

export async function requireServerSession(nextPath: string) {
  const { payload } = await fetchBackendJsonServer<{ user?: ApiUserRecord }>("/auth/me", {
    nextPath,
  });

  if (!payload?.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return payload.user;
}
