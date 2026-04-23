export const APP_SHELL_COLLAPSED_STORAGE_KEY = "clode-sidebar-collapsed";
export const DEFAULT_SIDEBAR_COLLAPSED = false;

export type SidebarPreferenceRoot = {
  dataset: { sidebarCollapsed?: string };
};

export type SidebarStorage = Pick<Storage, "getItem" | "setItem">;

export function normalizeSidebarCollapsedPreference(value: unknown) {
  return value === "true";
}

export function readSidebarCollapsedPreference(storage?: Pick<Storage, "getItem"> | null) {
  if (!storage) {
    return DEFAULT_SIDEBAR_COLLAPSED;
  }
  try {
    return normalizeSidebarCollapsedPreference(
      storage.getItem(APP_SHELL_COLLAPSED_STORAGE_KEY)
    );
  } catch {
    return DEFAULT_SIDEBAR_COLLAPSED;
  }
}

export function persistSidebarCollapsedPreference(
  storage: Pick<Storage, "setItem"> | null | undefined,
  isCollapsed: boolean
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(APP_SHELL_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  } catch {
    // Ignore storage failures and keep the runtime state only.
  }
}

export function applySidebarCollapsedToRoot(
  root: SidebarPreferenceRoot | null | undefined,
  isCollapsed: boolean
) {
  if (!root) {
    return;
  }
  root.dataset.sidebarCollapsed = isCollapsed ? "true" : "false";
}

export function getSidebarInitScript() {
  return `
    (() => {
      const root = document.documentElement;
      const applySidebar = (isCollapsed) => {
        root.dataset.sidebarCollapsed = isCollapsed ? "true" : "false";
      };
      try {
        applySidebar(
          window.localStorage.getItem(${JSON.stringify(APP_SHELL_COLLAPSED_STORAGE_KEY)}) === "true"
        );
      } catch (_error) {
        applySidebar(${DEFAULT_SIDEBAR_COLLAPSED ? "true" : "false"});
      }
    })();
  `;
}

export function getNavigationShortLabel(label: string) {
  const words = label
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (!words.length) {
    return "?";
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}
