import { normalizePermissions, normalizeRole } from "@/lib/auth/permissions";

export const userProfiles = ["admin", "finance", "delivery", "viewer"] as const;

export const capabilityDefinitions = [
  "dashboard.view",
  "contracts.view",
  "finance.view",
  "resources.view",
  "operations.view",
  "admin.view",
  "contracts.manage",
  "finance.manage",
  "resources.manage",
  "operations.manage",
  "admin.manage",
  "vacations.approve",
] as const;

export type UserProfile = (typeof userProfiles)[number];
export type CapabilityId = (typeof capabilityDefinitions)[number];
export type CapabilityMap = Record<CapabilityId, boolean>;
export type UserScope = {
  contracts: {
    mode: string;
  };
};

export type UserContextSubject = {
  role?: string | null;
  permissions?: Record<string, boolean> | null;
  canApproveVacations?: boolean | null;
  profile?: string | null;
  capabilities?: Record<string, boolean> | null;
  scope?: {
    contracts?: {
      mode?: string | null;
    } | null;
  } | null;
};

const userProfileSet = new Set<string>(userProfiles);
const profileByRole: Record<string, UserProfile> = {
  admin: "admin",
  ksiegowosc: "finance",
  kierownik: "delivery",
  "read-only": "viewer",
};

export function deriveProfileFromLegacyAuthority(role: string | null | undefined): UserProfile {
  return profileByRole[normalizeRole(role)] ?? "viewer";
}

export function normalizeProfile(subject: UserContextSubject | null | undefined): UserProfile {
  const profile = String(subject?.profile || "").trim();
  if (userProfileSet.has(profile)) {
    return profile as UserProfile;
  }
  return deriveProfileFromLegacyAuthority(subject?.role);
}

export function deriveCapabilitiesFromLegacyAuthority(
  subject: Pick<UserContextSubject, "role" | "permissions" | "canApproveVacations"> | null | undefined
): CapabilityMap {
  const permissions = normalizePermissions(subject?.role, subject?.permissions);
  const capabilities = createEmptyCapabilityMap();
  const normalizedRole = normalizeRole(subject?.role);

  capabilities["dashboard.view"] = permissions.dashboardView;
  capabilities["contracts.view"] = permissions.contractsView;
  capabilities["finance.view"] = permissions.invoicesView;
  capabilities["resources.view"] = permissions.employeesView || permissions.workwearView;
  capabilities["operations.view"] =
    permissions.hoursView || permissions.planningView || permissions.vacationsView;
  capabilities["admin.view"] = permissions.settingsView;

  capabilities["contracts.manage"] = permissions.contractsManage;
  capabilities["finance.manage"] = permissions.invoicesManage;
  capabilities["resources.manage"] = permissions.employeesManage || permissions.workwearManage;
  capabilities["operations.manage"] =
    permissions.hoursManage || permissions.planningManage || permissions.vacationsManage;
  capabilities["admin.manage"] = permissions.settingsManage;
  capabilities["vacations.approve"] =
    Boolean(subject?.canApproveVacations) || normalizedRole === "admin";

  return capabilities;
}

export function normalizeCapabilities(subject: UserContextSubject | null | undefined): CapabilityMap {
  const normalized = deriveCapabilitiesFromLegacyAuthority(subject);
  for (const capabilityId of capabilityDefinitions) {
    if (capabilityId in (subject?.capabilities || {})) {
      normalized[capabilityId] = Boolean(subject?.capabilities?.[capabilityId]);
    }
  }
  return normalized;
}

export function defaultUserScope(): UserScope {
  return {
    contracts: {
      mode: "all",
    },
  };
}

export function normalizeScope(subject: UserContextSubject | null | undefined): UserScope {
  const scope = defaultUserScope();
  const mode = String(subject?.scope?.contracts?.mode || "").trim();
  if (mode) {
    scope.contracts.mode = mode;
  }
  return scope;
}

export function hasCapability(
  subject: UserContextSubject | null | undefined,
  capabilityId: CapabilityId
) {
  return normalizeCapabilities(subject)[capabilityId];
}

function createEmptyCapabilityMap(): CapabilityMap {
  return Object.fromEntries(
    capabilityDefinitions.map((capabilityId) => [capabilityId, false])
  ) as CapabilityMap;
}
