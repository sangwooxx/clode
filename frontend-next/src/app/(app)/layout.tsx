import type { ReactNode } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { ProtectedApp } from "@/lib/auth/protected-app";

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedApp>
      <AppShell>{children}</AppShell>
    </ProtectedApp>
  );
}
