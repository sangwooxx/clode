"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { BrandMark } from "@/components/ui/brand-mark";
import { getModuleNavigation } from "@/features/navigation/module-nav";
import { useAuth } from "@/lib/auth/auth-context";
import { canAccessView } from "@/lib/auth/permissions";
import { useTheme } from "@/lib/theme/theme-context";
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
  const { theme, toggleTheme } = useTheme();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigationItems = getModuleNavigation(user);
  const canAccessSettings = canAccessView(user, "settingsView");

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
        <BrandMark className="app-shell__brand" labelClassName="app-shell__brand-mark" />

        <nav className="app-shell__nav">
          {navigationItems.map((item) => (
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
          <ActionButton type="button" variant="secondary" fullWidth onClick={toggleTheme}>
            {theme === "light" ? "Motyw ciemny" : "Motyw jasny"}
          </ActionButton>

          {canAccessSettings ? (
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
          ) : null}

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
