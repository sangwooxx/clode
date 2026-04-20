import { http } from "@/lib/api/http";
import type { ApiUserRecord } from "@/lib/api/user-record";

export type ManagedUserRecord = ApiUserRecord;

export type SaveManagedUserPayload = {
  id?: string;
  name: string;
  username: string;
  email?: string;
  password?: string;
  role: string;
  status: "active" | "inactive";
  permissions: Record<string, boolean>;
  canApproveVacations: boolean;
};

type UsersListResponse = {
  ok?: boolean;
  users?: ManagedUserRecord[];
};

type UserRecordResponse = {
  ok?: boolean;
  user?: ManagedUserRecord;
};

export function listUsers() {
  return http<UsersListResponse>("/users", { method: "GET" });
}

export function createUser(payload: SaveManagedUserPayload) {
  return http<UserRecordResponse>("/users", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUser(userId: string, payload: SaveManagedUserPayload) {
  return http<UserRecordResponse>(`/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteUser(userId: string) {
  return http(`/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}
