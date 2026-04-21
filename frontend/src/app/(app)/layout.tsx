import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { AppShell } from "@/components/ui/app-shell";
import { ProtectedApp } from "@/lib/auth/protected-app";
import { readOptionalServerSession } from "@/lib/auth/server-auth";

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const initialUser = await readOptionalServerSession();

  return (
    <AppProviders initialUser={initialUser}>
      <ProtectedApp>
        <AppShell>{children}</AppShell>
      </ProtectedApp>
    </AppProviders>
  );
}
