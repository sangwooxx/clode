import { http } from "@/lib/api/http";
import {
  toAuthenticatedUser,
  type ApiUserRecord,
  type AuthenticatedUser,
} from "@/lib/api/user-record";

type AuthMeResponse = {
  user?: ApiUserRecord;
};

type LoginResponse = {
  user?: ApiUserRecord;
};

export { toAuthenticatedUser as normalizeUser };
export type { AuthenticatedUser };

export async function bootstrapSession() {
  const response = await http<AuthMeResponse>("/auth/me", {
    method: "GET",
    onUnauthorized: "ignore",
  });

  return toAuthenticatedUser(response.user);
}

export async function login(username: string, password: string) {
  const response = await http<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    onUnauthorized: "ignore",
  });

  const hydratedUser = await bootstrapSession();
  return hydratedUser ?? toAuthenticatedUser(response.user);
}

export async function logout() {
  await http("/auth/logout", {
    method: "POST",
    onUnauthorized: "ignore",
  });
}

export async function requestPasswordReset(username: string) {
  return http("/auth/password-reset-request", {
    method: "POST",
    body: JSON.stringify({ username }),
    onUnauthorized: "ignore",
  });
}
