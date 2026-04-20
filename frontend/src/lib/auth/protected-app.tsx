"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";

export function ProtectedApp({ children }: { children: ReactNode }) {
  const { user, initialized, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialized && !isLoading && !user) {
      const next = pathname ? `?next=${encodeURIComponent(pathname)}` : "";
      router.replace(`/login${next}` as Route);
    }
  }, [initialized, isLoading, pathname, router, user]);

  if (!initialized || isLoading) {
    return <div className="screen-state">Trwa bootstrap sesji...</div>;
  }

  if (!user) {
    return <div className="screen-state">Przekierowanie do logowania...</div>;
  }

  return <>{children}</>;
}
