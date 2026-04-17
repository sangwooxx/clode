"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { moduleNavigation } from "@/features/navigation/module-nav";
import { useAuth } from "@/lib/auth/auth-context";
import { cn } from "@/lib/utils/cn";

export function AppShell({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__brand">
          <span className="app-shell__brand-mark">Clode</span>
        </div>

        <nav className="app-shell__nav">
          {moduleNavigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "app-shell__nav-link",
                pathname === item.href && "app-shell__nav-link--active"
              )}
            >
              <span className="app-shell__nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="app-shell__sidebar-footer">
          <Link
            href="/settings"
            className={cn(
              "app-shell__option-link",
              pathname === "/settings" && "app-shell__option-link--active"
            )}
          >
            <div className="app-shell__option-copy">
              <strong className="app-shell__option-title">
                {user?.displayName ?? "Konto"}
              </strong>
            </div>
            <span className="app-shell__option-icon" aria-hidden="true">
              &#9881;
            </span>
          </Link>

          <ActionButton
            variant="secondary"
            fullWidth
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Wylogowywanie..." : "Wyloguj"}
          </ActionButton>
        </div>
      </aside>

      <div className="app-shell__main">
        {title ? (
          <header className="app-shell__header">
            <div>{title ? <h1 className="app-shell__title">{title}</h1> : null}</div>
          </header>
        ) : null}

        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
