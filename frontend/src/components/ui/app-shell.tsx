"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { BrandMark } from "@/components/ui/brand-mark";
import {
  getModuleNavigation,
  isModuleNavigationChildActive,
  isModuleNavigationItemActive,
} from "@/features/navigation/module-nav";
import { useAuth } from "@/lib/auth/auth-context";
import { useTheme } from "@/lib/theme/theme-context";
import {
  applySidebarCollapsedToRoot,
  readSidebarCollapsedPreference,
  persistSidebarCollapsedPreference,
} from "@/lib/ui/app-shell-preferences";
import { cn } from "@/lib/utils/cn";

const COMPACT_SIDEBAR_MEDIA_QUERY = "(max-width: 1200px)";

function resolveInitialSidebarCollapsed() {
  if (typeof document !== "undefined") {
    return document.documentElement.dataset.sidebarCollapsed === "true";
  }
  if (typeof window !== "undefined") {
    return readSidebarCollapsedPreference(window.localStorage);
  }
  return false;
}

function resolveInitialCompactViewport() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY).matches;
}

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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(resolveInitialSidebarCollapsed);
  const [isCompactViewport, setIsCompactViewport] = useState(resolveInitialCompactViewport);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const navigationItems = getModuleNavigation(user);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia(COMPACT_SIDEBAR_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setIsCompactViewport(event.matches);
    };

    setIsCompactViewport(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  useEffect(() => {
    applySidebarCollapsedToRoot(document.documentElement, isSidebarCollapsed);
    persistSidebarCollapsedPreference(window.localStorage, isSidebarCollapsed);
  }, [isSidebarCollapsed]);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isCompactViewport) {
      setIsMobileNavOpen(false);
    }
  }, [isCompactViewport]);

  useEffect(() => {
    if (!isCompactViewport || !isMobileNavOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isCompactViewport, isMobileNavOpen]);

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

  function handleSidebarToggle() {
    if (isCompactViewport) {
      setIsMobileNavOpen((current) => !current);
      return;
    }
    setIsSidebarCollapsed((current) => !current);
  }

  const isRail = !isCompactViewport && isSidebarCollapsed;
  const sidebarToggleLabel = isMobileNavOpen ? "Zamknij menu glowne" : "Otworz menu glowne";

  const shellClassName = cn(
    "app-shell",
    isRail && "app-shell--sidebar-collapsed",
    isCompactViewport && "app-shell--compact",
    isCompactViewport && isMobileNavOpen && "app-shell--mobile-open",
  );

  const themeButtonLabel = theme === "light" ? "Motyw ciemny" : "Motyw jasny";
  const themeButtonIcon = theme === "light" ? "D" : "L";
  const collapseButtonLabel = isSidebarCollapsed ? "Rozwin menu" : "Zwin menu";
  const collapseButtonIcon = isSidebarCollapsed ? ">>" : "<<";

  return (
    <div className={shellClassName} data-sidebar-collapsed={isRail ? "true" : "false"}>
      {isCompactViewport ? (
        <button
          type="button"
          className="app-shell__backdrop"
          aria-label="Zamknij menu glowne"
          onClick={() => setIsMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "app-shell__sidebar",
          isRail && "app-shell__sidebar--collapsed",
          isCompactViewport && "app-shell__sidebar--drawer",
          isCompactViewport && isMobileNavOpen && "app-shell__sidebar--open",
        )}
        aria-label="Menu glowne"
      >
        <div className="app-shell__sidebar-top">
          {isCompactViewport ? (
            <ActionButton
              type="button"
              variant="ghost"
              className="app-shell__sidebar-close"
              aria-label="Zamknij menu glowne"
              onClick={() => setIsMobileNavOpen(false)}
            >
              <span aria-hidden="true">X</span>
              <span className="app-shell__sidebar-close-label">Zamknij</span>
            </ActionButton>
          ) : null}
        </div>

        <nav className="app-shell__nav">
          {navigationItems.map((item) => (
            <div key={item.label} className="app-shell__nav-group">
              <Link
                href={item.href}
                aria-label={item.label}
                title={isRail ? item.label : undefined}
                className={cn(
                  "app-shell__nav-link",
                  isModuleNavigationItemActive(pathname, item) && "app-shell__nav-link--active",
                )}
              >
                <span className="app-shell__nav-badge" aria-hidden="true">
                  {item.shortLabel}
                </span>
                <span className="app-shell__nav-label">{item.label}</span>
              </Link>

              {item.showChildren ? (
                <div className="app-shell__nav-children" aria-label={`${item.label} moduly`}>
                  {item.children.map((child) => (
                    <Link
                      key={child.href}
                      href={child.href}
                      className={cn(
                        "app-shell__nav-child-link",
                        isModuleNavigationChildActive(pathname, child.href) &&
                          "app-shell__nav-child-link--active",
                      )}
                    >
                      {child.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </nav>

        <div className="app-shell__sidebar-footer">
          <div className="app-shell__utility-buttons">
            {!isCompactViewport ? (
              <ActionButton
                type="button"
                variant="ghost"
                fullWidth={!isRail}
                className="app-shell__utility-button"
                aria-label={collapseButtonLabel}
                title={isRail ? collapseButtonLabel : undefined}
                onClick={handleSidebarToggle}
              >
                <span className="app-shell__footer-icon" aria-hidden="true">
                  {collapseButtonIcon}
                </span>
                <span className="app-shell__footer-label">{collapseButtonLabel}</span>
              </ActionButton>
            ) : null}
            <ActionButton
              type="button"
              variant="ghost"
              fullWidth={!isRail}
              className="app-shell__utility-button"
              aria-label={themeButtonLabel}
              title={isRail ? themeButtonLabel : undefined}
              onClick={toggleTheme}
            >
              <span className="app-shell__footer-icon" aria-hidden="true">
                {themeButtonIcon}
              </span>
              <span className="app-shell__footer-label">{themeButtonLabel}</span>
            </ActionButton>
          </div>

          <BrandMark
            className="app-shell__sidebar-brand"
            labelClassName="app-shell__sidebar-brand-mark"
          />

          <ActionButton
            variant="secondary"
            fullWidth={!isRail}
            className="app-shell__footer-button app-shell__footer-button--logout"
            aria-label="Wyloguj"
            title={isRail ? "Wyloguj" : undefined}
            onClick={() => void handleLogout()}
            disabled={isLoggingOut}
          >
            <span className="app-shell__footer-icon" aria-hidden="true">
              {"=>"}
            </span>
            <span className="app-shell__footer-label">
              {isLoggingOut ? "Wylogowywanie..." : "Wyloguj"}
            </span>
          </ActionButton>
        </div>
      </aside>

      <div className="app-shell__main">
        <header className="app-shell__header">
          <div className="app-shell__header-bar">
            {isCompactViewport ? (
              <ActionButton
                type="button"
                variant="secondary"
                className="app-shell__sidebar-toggle"
                aria-label={sidebarToggleLabel}
                onClick={handleSidebarToggle}
              >
                <span className="app-shell__sidebar-toggle-icon" aria-hidden="true">
                  =
                </span>
                <span className="app-shell__sidebar-toggle-label">Menu</span>
              </ActionButton>
            ) : null}

            <div className="app-shell__title-block">
              {title ? <h1 className="app-shell__title">{title}</h1> : null}
            </div>
          </div>
        </header>

        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
