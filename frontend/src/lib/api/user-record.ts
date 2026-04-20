export type ApiUserRecord = {
  id: string;
  name: string;
  displayName: string;
  username: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  is_active: boolean;
  permissions: Record<string, boolean>;
  canApproveVacations: boolean;
  created_at?: string;
  updated_at?: string;
  last_login_at?: string;
};

export type AuthenticatedUser = {
  id?: string;
  username: string;
  displayName: string;
  name?: string;
  email?: string;
  role: string;
  status?: "active" | "inactive";
  isActive?: boolean;
  permissions?: Record<string, boolean>;
  canApproveVacations?: boolean;
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
};

export function toAuthenticatedUser(payload: ApiUserRecord | undefined): AuthenticatedUser | null {
  if (!payload?.username) {
    return null;
  }

  return {
    id: payload.id ?? "",
    username: payload.username,
    displayName: payload.displayName || payload.name || payload.username,
    name: payload.name || payload.displayName || payload.username,
    email: payload.email ?? "",
    role: payload.role ?? "read-only",
    status: payload.status === "inactive" ? "inactive" : "active",
    isActive: Boolean(payload.is_active),
    permissions: payload.permissions ?? {},
    canApproveVacations: Boolean(payload.canApproveVacations),
    createdAt: payload.created_at ?? "",
    updatedAt: payload.updated_at ?? "",
    lastLoginAt: payload.last_login_at ?? "",
  };
}
