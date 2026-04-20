import type { AuthenticatedUser } from "@/lib/api/auth";
import { http } from "@/lib/api/http";
import {
  createUser,
  deleteUser,
  updateUser,
  type ManagedUserRecord,
  type SaveManagedUserPayload,
} from "@/lib/api/users";
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

function normalizeUsername(value: string, fallback: string) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ".");
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

function normalizeAuditLog(entries: SettingsAuditLogEntry[] | undefined) {
  return [...(entries || [])].sort((left, right) =>
    String(right.timestamp || "").localeCompare(String(left.timestamp || ""))
  );
}

export async function fetchSettingsAdminBootstrap(): Promise<SettingsAdminBootstrap> {
  const response = await http<{
    users?: ManagedUserRecord[];
    workflow?: SettingsWorkflowValues;
    audit_log?: SettingsAuditLogEntry[];
  }>("/settings/bootstrap", {
    method: "GET",
  });

  return {
    users: sortUsers(response.users || []),
    workflow: createDefaultWorkflowValues(response.workflow),
    auditLog: normalizeAuditLog(response.audit_log),
  };
}

export async function appendSettingsAuditLog(args: {
  actor: AuthenticatedUser;
  currentEntries: SettingsAuditLogEntry[];
  action: string;
  subject: string;
  details?: string;
}) {
  const nextEntry = createAuditLogEntry({
    actor: args.actor,
    action: args.action,
    subject: args.subject,
    details: args.details,
  });

  const response = await http<{
    entry?: SettingsAuditLogEntry;
    entries?: SettingsAuditLogEntry[];
  }>("/settings/audit-log", {
    method: "POST",
    body: JSON.stringify({ entry: nextEntry }),
  });

  return normalizeAuditLog(response.entries || [response.entry || nextEntry, ...args.currentEntries]);
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
  const nextWorkflow = createDefaultWorkflowValues(args.values);
  const response = await http<{ workflow?: SettingsWorkflowValues }>("/settings/workflow", {
    method: "PUT",
    body: JSON.stringify(nextWorkflow),
  });

  const savedWorkflow = createDefaultWorkflowValues(response.workflow || nextWorkflow);
  await appendSettingsAuditLog({
    actor: args.actor,
    currentEntries: args.currentAuditLog,
    action: "Zaktualizowano workflow",
    subject: "Obieg urlopow",
    details:
      savedWorkflow.vacationApprovalMode === "admin"
        ? "Akceptacja tylko przez administratora."
        : "Akceptacja wg uprawnien uzytkownikow.",
  });

  return savedWorkflow;
}
