import { http, writeStoredSessionToken } from "@/lib/api/http";

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

type AuthMeResponse = {
  user?: {
    id?: string;
    username?: string;
    email?: string;
    display_name?: string;
    displayName?: string;
    name?: string;
    role?: string;
    status?: string;
    is_active?: boolean;
    isActive?: boolean;
    permissions?: Record<string, boolean>;
    canApproveVacations?: boolean;
    created_at?: string;
    updated_at?: string;
    last_login_at?: string;
  };
};

type LoginResponse = {
  token?: string;
  session_token?: string;
  user?: AuthMeResponse["user"];
};

function normalizeUser(payload: AuthMeResponse["user"] | undefined): AuthenticatedUser | null {
  if (!payload?.username) {
    return null;
  }

  return {
    id: payload.id ?? "",
    username: payload.username,
    displayName: payload.display_name ?? payload.displayName ?? payload.name ?? payload.username,
    name: payload.name ?? payload.display_name ?? payload.displayName ?? payload.username,
    email: payload.email ?? "",
    role: payload.role ?? "user",
    status: payload.status === "inactive" ? "inactive" : "active",
    isActive: payload.is_active ?? payload.isActive ?? payload.status !== "inactive",
    permissions: payload.permissions ?? {},
    canApproveVacations: Boolean(payload.canApproveVacations),
    createdAt: payload.created_at ?? "",
    updatedAt: payload.updated_at ?? "",
    lastLoginAt: payload.last_login_at ?? "",
  };
}

export async function bootstrapSession() {
  const response = await http<AuthMeResponse>("/auth/me", {
    method: "GET"
  });

  return normalizeUser(response.user);
}

export async function login(username: string, password: string) {
  const response = await http<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });

  const token = response.token ?? response.session_token ?? "";
  writeStoredSessionToken(token);

  const hydratedUser = await bootstrapSession();
  return hydratedUser ?? normalizeUser(response.user);
}

export async function logout() {
  try {
    await http("/auth/logout", {
      method: "POST"
    });
  } finally {
    writeStoredSessionToken("");
  }
}

export async function requestPasswordReset(username: string) {
  return http("/auth/password-reset-request", {
    method: "POST",
    body: JSON.stringify({ username })
  });
}
