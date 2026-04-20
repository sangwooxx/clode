import type { AuthenticatedUser } from "@/lib/api/auth";
import type { ManagedUserRecord } from "@/lib/api/users";

export const settingsPermissionDefinitions = [
  { viewId: "dashboardView", label: "Dashboard" },
  { viewId: "contractsView", label: "Rejestr kontraktow" },
  { viewId: "hoursView", label: "Ewidencja czasu pracy" },
  { viewId: "invoicesView", label: "Rejestr faktur" },
  { viewId: "employeesView", label: "Kartoteka pracownikow" },
  { viewId: "planningView", label: "Planowanie zasobow" },
  { viewId: "workwearView", label: "Odziez robocza" },
  { viewId: "vacationsView", label: "Urlopy i nieobecnosci" },
  { viewId: "settingsView", label: "Ustawienia konta" },
] as const;

export type SettingsPermissionId = (typeof settingsPermissionDefinitions)[number]["viewId"];

export type SettingsPermissionMap = Record<SettingsPermissionId, boolean>;

export type SettingsWorkflowValues = {
  vacationApprovalMode: "permission" | "admin";
  vacationNotifications: "on" | "off";
};

export type SettingsAuditLogEntry = {
  id: string;
  timestamp: string;
  module: string;
  action: string;
  subject: string;
  details: string;
  user_id: string;
  user_name: string;
};

export type SettingsUserFormValues = {
  name: string;
  username: string;
  email: string;
  password: string;
  role: string;
  status: "active" | "inactive";
  canApproveVacations: boolean;
  permissions: SettingsPermissionMap;
};

export type SettingsAdminBootstrap = {
  users: ManagedUserRecord[];
  workflow: SettingsWorkflowValues;
  auditLog: SettingsAuditLogEntry[];
};

export type SettingsUsersFilter = "all" | "active" | "inactive";

export function isAdminRole(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "administrator";
}

export function createDefaultSettingsPermissions(role: string | null | undefined): SettingsPermissionMap {
  const admin = isAdminRole(role);
  return settingsPermissionDefinitions.reduce<SettingsPermissionMap>((accumulator, definition) => {
    accumulator[definition.viewId] = admin ? true : definition.viewId !== "settingsView";
    return accumulator;
  }, {} as SettingsPermissionMap);
}

export function normalizeSettingsPermissions(
  role: string | null | undefined,
  permissions: Record<string, boolean> | null | undefined
): SettingsPermissionMap {
  const defaults = createDefaultSettingsPermissions(role);
  const normalized = { ...defaults };

  for (const definition of settingsPermissionDefinitions) {
    if (definition.viewId in (permissions || {})) {
      normalized[definition.viewId] = Boolean(permissions?.[definition.viewId]);
    }
  }

  if (isAdminRole(role)) {
    for (const definition of settingsPermissionDefinitions) {
      normalized[definition.viewId] = true;
    }
    return normalized;
  }

  normalized.settingsView = false;
  return normalized;
}

export function createEmptySettingsUserForm(): SettingsUserFormValues {
  return {
    name: "",
    username: "",
    email: "",
    password: "",
    role: "read-only",
    status: "active",
    canApproveVacations: false,
    permissions: createDefaultSettingsPermissions("read-only"),
  };
}

export function buildSettingsUserFormValues(user?: ManagedUserRecord | null): SettingsUserFormValues {
  if (!user) {
    return createEmptySettingsUserForm();
  }

  return {
    name: user.name || "",
    username: user.username || "",
    email: user.email || "",
    password: "",
    role: user.role || "read-only",
    status: user.status === "inactive" ? "inactive" : "active",
    canApproveVacations: Boolean(user.canApproveVacations),
    permissions: normalizeSettingsPermissions(user.role, user.permissions),
  };
}

export function createDefaultWorkflowValues(values?: Partial<SettingsWorkflowValues> | null): SettingsWorkflowValues {
  return {
    vacationApprovalMode: values?.vacationApprovalMode === "admin" ? "admin" : "permission",
    vacationNotifications: values?.vacationNotifications === "off" ? "off" : "on",
  };
}

export function createAuditLogEntry(args: {
  actor: AuthenticatedUser;
  action: string;
  subject: string;
  details?: string;
  module?: string;
}): SettingsAuditLogEntry {
  return {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    module: args.module || "Administracja",
    action: args.action,
    subject: args.subject,
    details: args.details || "",
    user_id: args.actor.id || "unknown-user",
    user_name: args.actor.displayName || args.actor.username,
  };
}
