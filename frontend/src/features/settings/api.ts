import type { AuthenticatedUser } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/http";
import {
  createUser,
  deleteUser,
  listUsers,
  updateUser,
  type ManagedUserRecord,
  type SaveManagedUserPayload,
} from "@/lib/api/users";
import { getStore, saveStore } from "@/lib/api/stores";
import {
  createAuditLogEntry,
  createDefaultWorkflowValues,
  isAdminRole,
  normalizeSettingsPermissions,
  type SettingsAdminBootstrap,
  type SettingsAuditLogEntry,
  type SettingsUserFormValues,
  type SettingsWorkflowValues,
} from "@/features/settings/types";

type UnknownRecord = Record<string, unknown>;

function normalizeUsername(value: string, fallback: string) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
}

function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readOptionalStore<T>(storeKey: string, fallbackValue: T): Promise<T> {
  try {
    const response = await getStore<T>(storeKey);
    return response.payload ?? fallbackValue;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return fallbackValue;
    }
    throw error;
  }
}

function normalizeWorkflowStore(payload: unknown): SettingsWorkflowValues {
  if (isPlainObject(payload) && isPlainObject(payload.workflow)) {
    return createDefaultWorkflowValues({
      vacationApprovalMode: String(payload.workflow.vacationApprovalMode || "") as
        | "permission"
        | "admin",
      vacationNotifications: String(payload.workflow.vacationNotifications || "") as
        | "on"
        | "off",
    });
  }

  if (isPlainObject(payload)) {
    return createDefaultWorkflowValues({
      vacationApprovalMode: String(payload.vacationApprovalMode || "") as "permission" | "admin",
      vacationNotifications: String(payload.vacationNotifications || "") as "on" | "off",
    });
  }

  return createDefaultWorkflowValues();
}

function normalizeAuditLog(payload: unknown): SettingsAuditLogEntry[] {
  const entries = Array.isArray(payload)
    ? payload
    : isPlainObject(payload) && Array.isArray(payload.entries)
      ? payload.entries
      : [];

  return entries
    .map((entry) => {
      if (!isPlainObject(entry)) {
        return null;
      }

      return {
        id: String(entry.id || ""),
        timestamp: String(entry.timestamp || ""),
        module: String(entry.module || ""),
        action: String(entry.action || ""),
        subject: String(entry.subject || ""),
        details: String(entry.details || ""),
        user_id: String(entry.user_id || ""),
        user_name: String(entry.user_name || ""),
      } satisfies SettingsAuditLogEntry;
    })
    .filter((entry): entry is SettingsAuditLogEntry => Boolean(entry?.id))
    .sort((left, right) => String(right.timestamp || "").localeCompare(String(left.timestamp || "")));
}

function sortUsers(users: ManagedUserRecord[]) {
  return [...users].sort((left, right) => {
    const statusDelta = Number(left.status === "inactive") - Number(right.status === "inactive");
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

export async function fetchSettingsAdminBootstrap(): Promise<SettingsAdminBootstrap> {
  const [usersResponse, settingsPayload, auditPayload] = await Promise.all([
    listUsers(),
    readOptionalStore<unknown>("settings", {}),
    readOptionalStore<unknown>("audit_logs", []),
  ]);

  return {
    users: sortUsers(usersResponse.users || []),
    workflow: normalizeWorkflowStore(settingsPayload),
    auditLog: normalizeAuditLog(auditPayload),
  };
}

export async function appendSettingsAuditLog(args: {
  actor: AuthenticatedUser;
  currentEntries: SettingsAuditLogEntry[];
  action: string;
  subject: string;
  details?: string;
}) {
  const nextEntries = [
    createAuditLogEntry({
      actor: args.actor,
      action: args.action,
      subject: args.subject,
      details: args.details,
    }),
    ...args.currentEntries,
  ].slice(0, 1500);

  await saveStore("audit_logs", nextEntries);
  return nextEntries;
}

function buildUserPayload(values: SettingsUserFormValues): SaveManagedUserPayload {
  const normalizedRole = String(values.role || "read-only").trim() || "read-only";
  const permissions = normalizeSettingsPermissions(normalizedRole, values.permissions);

  return {
    name: String(values.name || "").trim(),
    username: normalizeUsername(values.username, values.name),
    email: String(values.email || "").trim().toLowerCase(),
    password: String(values.password || "").trim() || undefined,
    role: normalizedRole,
    status: values.status === "inactive" ? "inactive" : "active",
    permissions,
    canApproveVacations: isAdminRole(normalizedRole) ? true : Boolean(values.canApproveVacations),
  };
}

export async function saveSettingsManagedUser(args: {
  actor: AuthenticatedUser;
  existingUser?: ManagedUserRecord | null;
  values: SettingsUserFormValues;
  currentAuditLog: SettingsAuditLogEntry[];
}) {
  const payload = buildUserPayload(args.values);

  if (!payload.name) {
    throw new Error("Podaj imie i nazwisko uzytkownika.");
  }

  if (!payload.username) {
    throw new Error("Podaj login uzytkownika.");
  }

  if (!args.existingUser && !payload.password) {
    throw new Error("Haslo jest wymagane przy tworzeniu nowego konta.");
  }

  const response = args.existingUser
    ? await updateUser(args.existingUser.id, payload)
    : await createUser(payload);

  const savedUser = response.user;
  if (!savedUser) {
    throw new Error("Backend nie zwrocil zapisanego uzytkownika.");
  }

  await appendSettingsAuditLog({
    actor: args.actor,
    currentEntries: args.currentAuditLog,
    action: args.existingUser ? "Zaktualizowano konto" : "Dodano konto",
    subject: savedUser.name,
    details: `Login: ${savedUser.username}`,
  });

  return savedUser;
}

export async function deleteSettingsManagedUser(args: {
  actor: AuthenticatedUser;
  user: ManagedUserRecord;
  currentAuditLog: SettingsAuditLogEntry[];
}) {
  await deleteUser(args.user.id);
  await appendSettingsAuditLog({
    actor: args.actor,
    currentEntries: args.currentAuditLog,
    action: "Usunieto konto",
    subject: args.user.name,
    details: `Login: ${args.user.username}`,
  });
}

export async function saveSettingsWorkflow(args: {
  actor: AuthenticatedUser;
  values: SettingsWorkflowValues;
  currentAuditLog: SettingsAuditLogEntry[];
}) {
  const currentStore = await readOptionalStore<unknown>("settings", {});
  const nextWorkflow = createDefaultWorkflowValues(args.values);
  const nextStore = isPlainObject(currentStore)
    ? { ...currentStore, workflow: nextWorkflow }
    : { workflow: nextWorkflow };

  await saveStore("settings", nextStore);
  await appendSettingsAuditLog({
    actor: args.actor,
    currentEntries: args.currentAuditLog,
    action: "Zaktualizowano workflow",
    subject: "Obieg urlopow",
    details:
      nextWorkflow.vacationApprovalMode === "admin"
        ? "Akceptacja tylko przez administratora."
        : "Akceptacja wg uprawnien uzytkownikow.",
  });

  return nextWorkflow;
}
