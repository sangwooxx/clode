"use client";

import type { ReactNode } from "react";
import type { AuthenticatedUser } from "@/lib/api/auth";
import { AuthProvider } from "@/lib/auth/auth-context";

export function AppProviders({
  children,
  initialUser,
}: {
  children: ReactNode;
  initialUser: AuthenticatedUser | null;
}) {
  return <AuthProvider initialUser={initialUser}>{children}</AuthProvider>;
}
