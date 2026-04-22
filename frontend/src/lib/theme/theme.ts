export const THEME_STORAGE_KEY = "clode-theme";
export const DEFAULT_THEME = "light";
export const APP_THEMES = ["light", "dark"] as const;

export type AppTheme = (typeof APP_THEMES)[number];
export type ThemeRoot = {
  dataset: { theme?: string };
  style: { colorScheme?: string };
};
export type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

export function isAppTheme(value: unknown): value is AppTheme {
  return typeof value === "string" && APP_THEMES.includes(value as AppTheme);
}

export function resolveThemePreference(value: unknown): AppTheme {
  return isAppTheme(value) ? value : DEFAULT_THEME;
}

export function readThemePreference(storage?: Pick<Storage, "getItem"> | null): AppTheme {
  if (!storage) {
    return DEFAULT_THEME;
  }
  try {
    return resolveThemePreference(storage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function persistThemePreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  theme: AppTheme
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep runtime theme state only.
  }
}

export function applyThemeToRoot(root: ThemeRoot | null | undefined, theme: AppTheme) {
  if (!root) {
    return;
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function getThemeInitScript() {
  return `
    (() => {
      const root = document.documentElement;
      const applyTheme = (theme) => {
        root.dataset.theme = theme;
        root.style.colorScheme = theme;
      };
      try {
        const stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
        applyTheme(stored === "dark" || stored === "light" ? stored : ${JSON.stringify(DEFAULT_THEME)});
      } catch (_error) {
        applyTheme(${JSON.stringify(DEFAULT_THEME)});
      }
    })();
  `;
}
