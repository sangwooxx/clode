"use client";

import type { ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/api/auth";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme/theme-context";

export function AppProviders({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: AuthenticatedUser | null;
}) {
  return (
    <ThemeProvider>
      <AuthProvider initialUser={initialUser}>{children}</AuthProvider>
    </ThemeProvider>
  );
}
