import type { AuthenticatedUser } from "@/lib/api/auth";

export const viewPermissionDefinitions = [
  { id: "dashboardView", label: "Dashboard" },
  { id: "contractsView", label: "Rejestr kontraktow" },
  { id: "hoursView", label: "Ewidencja czasu pracy" },
  { id: "invoicesView", label: "Rejestr faktur" },
  { id: "employeesView", label: "Kartoteka pracownikow" },
  { id: "planningView", label: "Planowanie zasobow" },
  { id: "workwearView", label: "Odziez robocza" },
  { id: "vacationsView", label: "Urlopy i nieobecnosci" },
  { id: "settingsView", label: "Ustawienia konta" },
] as const;

export const managePermissionDefinitions = [
  { id: "contractsManage", label: "Zarzadzanie kontraktami", viewId: "contractsView" },
  { id: "hoursManage", label: "Zarzadzanie czasem pracy", viewId: "hoursView" },
  { id: "invoicesManage", label: "Zarzadzanie fakturami", viewId: "invoicesView" },
  { id: "employeesManage", label: "Zarzadzanie pracownikami", viewId: "employeesView" },
  { id: "planningManage", label: "Zarzadzanie planowaniem", viewId: "planningView" },
  { id: "workwearManage", label: "Zarzadzanie odzieza robocza", viewId: "workwearView" },
  { id: "vacationsManage", label: "Zarzadzanie urlopami", viewId: "vacationsView" },
  { id: "settingsManage", label: "Zarzadzanie ustawieniami", viewId: "settingsView" },
] as const;

export const permissionDefinitions = [
  ...viewPermissionDefinitions.map((definition) => ({ ...definition, kind: "view" as const })),
  ...managePermissionDefinitions.map((definition) => ({ ...definition, kind: "manage" as const })),
] as const;

export type ViewPermissionId = (typeof viewPermissionDefinitions)[number]["id"];
export type ManagePermissionId = (typeof managePermissionDefinitions)[number]["id"];
export type PermissionId = (typeof permissionDefinitions)[number]["id"];
export type PermissionMap = Record<PermissionId, boolean>;

const managePermissionByView = new Map<ViewPermissionId, ManagePermissionId>(
  managePermissionDefinitions.map((definition) => [definition.viewId, definition.id])
);

const defaultPermissionsByRole: Record<string, Partial<PermissionMap>> = {
  admin: Object.fromEntries(permissionDefinitions.map((definition) => [definition.id, true])),
  ksiegowosc: {
    dashboardView: true,
    contractsView: true,
    hoursView: true,
    invoicesView: true,
    invoicesManage: true,
  },
  kierownik: {
    dashboardView: true,
    contractsView: true,
    hoursView: true,
    invoicesView: true,
    employeesView: true,
    planningView: true,
    workwearView: true,
    vacationsView: true,
    hoursManage: true,
    employeesManage: true,
    planningManage: true,
    workwearManage: true,
    vacationsManage: true,
  },
  "read-only": {
    dashboardView: true,
    contractsView: true,
    invoicesView: true,
  },
};

export function normalizeRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "administrator") return "admin";
  if (normalized === "księgowość" || normalized === "ksiegowosc") return "ksiegowosc";
  if (normalized === "kadry") return "kierownik";
  if (normalized === "readonly" || normalized === "uzytkownik" || normalized === "użytkownik") {
    return "read-only";
  }
  return normalized || "read-only";
}

export function isAdminRole(role: string | null | undefined) {
  return normalizeRole(role) === "admin";
}

export function createDefaultPermissions(role: string | null | undefined): PermissionMap {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "admin") {
    return Object.fromEntries(permissionDefinitions.map((definition) => [definition.id, true])) as PermissionMap;
  }

  const defaults = defaultPermissionsByRole[normalizedRole] ?? defaultPermissionsByRole["read-only"];
  const normalized = Object.fromEntries(
    permissionDefinitions.map((definition) => [definition.id, Boolean(defaults[definition.id])])
  ) as PermissionMap;
  return promoteManagePermissions(normalized);
}

export function normalizePermissions(
  role: string | null | undefined,
  permissions: Record<string, boolean> | null | undefined
): PermissionMap {
  if (isAdminRole(role)) {
    return Object.fromEntries(permissionDefinitions.map((definition) => [definition.id, true])) as PermissionMap;
  }

  const normalized = createDefaultPermissions(role);
  for (const definition of permissionDefinitions) {
    if (definition.id in (permissions || {})) {
      normalized[definition.id] = Boolean(permissions?.[definition.id]);
    }
  }
  return promoteManagePermissions(normalized);
}

export function canAccessView(
  subject: Pick<AuthenticatedUser, "role" | "permissions"> | null | undefined,
  viewId: ViewPermissionId
) {
  return Boolean(normalizePermissions(subject?.role, subject?.permissions)[viewId]);
}

export function canManageView(
  subject: Pick<AuthenticatedUser, "role" | "permissions"> | null | undefined,
  viewId: ViewPermissionId
) {
  const manageId = managePermissionByView.get(viewId);
  if (!manageId) return isAdminRole(subject?.role);
  return Boolean(normalizePermissions(subject?.role, subject?.permissions)[manageId]);
}

export function buildPermissionLabels(permissions: Record<string, boolean> | null | undefined) {
  return permissionDefinitions
    .filter((definition) => Boolean(permissions?.[definition.id]))
    .map((definition) => definition.label);
}

function promoteManagePermissions(permissions: PermissionMap) {
  for (const definition of managePermissionDefinitions) {
    if (permissions[definition.id]) {
      permissions[definition.viewId] = true;
    }
  }
  return permissions;
}
