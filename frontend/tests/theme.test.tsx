import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/ui/app-shell";
import {
  APP_SHELL_COLLAPSED_STORAGE_KEY,
  applySidebarCollapsedToRoot,
  getSidebarInitScript,
  persistSidebarCollapsedPreference,
  readSidebarCollapsedPreference,
} from "@/lib/ui/app-shell-preferences";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyThemeToRoot,
  getThemeInitScript,
  isAppTheme,
  persistThemePreference,
  readThemePreference,
  type ThemeRoot,
} from "@/lib/theme/theme";

vi.mock("next/link", () => ({
  default: ({
    href,
    className,
    children
  }: {
    href: string;
    className?: string;
    children?: unknown;
  }) => (
    <a href={href} className={className}>
      {children as never}
    </a>
  )
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/contracts",
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn()
  })
}));

vi.mock("@/features/navigation/module-nav", () => ({
  getModuleNavigation: () => [{ href: "/contracts", label: "Kontrakty", shortLabel: "KT" }]
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    user: {
      displayName: "Admin ERP",
      permissions: {},
      role: "admin"
    },
    logout: vi.fn()
  })
}));

vi.mock("@/lib/auth/permissions", () => ({
  canAccessView: () => true
}));

vi.mock("@/lib/theme/theme-context", () => ({
  useTheme: () => ({
    theme: "dark",
    setTheme: vi.fn(),
    toggleTheme: vi.fn()
  })
}));

describe("theme support", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "document");
    Reflect.deleteProperty(globalThis, "window");
  });

  it("renders the inverse quick action in the app shell for the active theme", () => {
    const html = renderToStaticMarkup(
      <AppShell title="Kontrakty">
        <div>Treść modułu</div>
      </AppShell>
    );

    expect(html).toContain("Motyw jasny");
    expect(html).not.toContain("Motyw ciemny");
    expect(html).toContain("Zwiń menu");
  });

  it("renders the collapsed rail state when the persisted sidebar preference is collapsed", () => {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        documentElement: {
          dataset: { sidebarCollapsed: "true" },
        },
      },
    });

    const html = renderToStaticMarkup(
      <AppShell title="Kontrakty">
        <div>Treść modułu</div>
      </AppShell>
    );

    expect(html).toContain('data-sidebar-collapsed="true"');
    expect(html).toContain("Rozwiń menu");
  });

  it("builds a root init script that restores the persisted theme preference", () => {
    const script = getThemeInitScript();

    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain("root.dataset.theme = theme");
    expect(script).toContain(DEFAULT_THEME);
  });

  it("builds a root init script that restores the persisted sidebar preference", () => {
    const script = getSidebarInitScript();

    expect(script).toContain(APP_SHELL_COLLAPSED_STORAGE_KEY);
    expect(script).toContain("root.dataset.sidebarCollapsed = isCollapsed ? \"true\" : \"false\"");
  });

  it("applies the selected theme directly on the root element contract", () => {
    const root: ThemeRoot = {
      dataset: {},
      style: {},
    };

    applyThemeToRoot(root, "light");
    expect(root.dataset.theme).toBe("light");
    expect(root.style.colorScheme).toBe("light");

    applyThemeToRoot(root, "dark");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("persists and restores the theme preference from storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    expect(readThemePreference(storage)).toBe(DEFAULT_THEME);

    persistThemePreference(storage, "dark");
    expect(values.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference(storage)).toBe("dark");
  });

  it("persists and restores the sidebar preference from storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    expect(readSidebarCollapsedPreference(storage)).toBe(false);

    persistSidebarCollapsedPreference(storage, true);
    expect(values.get(APP_SHELL_COLLAPSED_STORAGE_KEY)).toBe("true");
    expect(readSidebarCollapsedPreference(storage)).toBe(true);
  });

  it("applies the selected sidebar preference directly on the root element contract", () => {
    const root: { dataset: { sidebarCollapsed?: string } } = {
      dataset: {},
    };

    applySidebarCollapsedToRoot(root, true);
    expect(root.dataset.sidebarCollapsed).toBe("true");

    applySidebarCollapsedToRoot(root, false);
    expect(root.dataset.sidebarCollapsed).toBe("false");
  });

  it("accepts only supported application themes", () => {
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("system")).toBe(false);
  });
});
