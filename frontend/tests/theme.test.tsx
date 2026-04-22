import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/ui/app-shell";
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
  getModuleNavigation: () => [{ href: "/contracts", label: "Kontrakty" }]
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
  it("renders the inverse quick action in the app shell for the active theme", () => {
    const html = renderToStaticMarkup(
      <AppShell title="Kontrakty">
        <div>Treść modułu</div>
      </AppShell>
    );

    expect(html).toContain("Motyw jasny");
    expect(html).not.toContain("Motyw ciemny");
  });

  it("builds a root init script that restores the persisted theme preference", () => {
    const script = getThemeInitScript();

    expect(script).toContain(THEME_STORAGE_KEY);
    expect(script).toContain("root.dataset.theme = theme");
    expect(script).toContain(DEFAULT_THEME);
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

  it("accepts only supported application themes", () => {
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("system")).toBe(false);
  });
});
