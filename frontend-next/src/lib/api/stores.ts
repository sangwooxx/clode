import { http } from "@/lib/api/http";

export type StoreResponse<T> = {
  ok?: boolean;
  store?: string;
  payload?: T;
};

export function getStore<T>(storeKey: string) {
  return http<StoreResponse<T>>(`/stores/${storeKey}`, { method: "GET" });
}

export function saveStore<T>(storeKey: string, value: T) {
  return http<StoreResponse<T>>(`/stores/${storeKey}`, {
    method: "PUT",
    body: JSON.stringify({ payload: value })
  });
}

export function removeStore(storeKey: string) {
  return http(`/stores/${storeKey}`, { method: "DELETE" });
}
