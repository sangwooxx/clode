import type { ManagedUserRecord } from "@/lib/api/users";
import {
  createDefaultPermissions,
  isAdminRole,
  normalizePermissions,
  permissionDefinitions,
  type PermissionId,
  type PermissionMap,
} from "@/lib/auth/permissions";

export const settingsPermissionDefinitions = permissionDefinitions;

export type SettingsPermissionId = PermissionId;
export type SettingsPermissionMap = PermissionMap;

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

export function createDefaultSettingsPermissions(role: string | null | undefined): SettingsPermissionMap {
  return createDefaultPermissions(role);
}

export function normalizeSettingsPermissions(
  role: string | null | undefined,
  permissions: Record<string, boolean> | null | undefined
): SettingsPermissionMap {
  return normalizePermissions(role, permissions);
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

export { isAdminRole };
