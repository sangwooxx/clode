import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import type { DashboardSnapshot } from "@/features/dashboard/types";

export async function fetchDashboardSnapshotServer() {
  const { payload } = await fetchBackendJsonServer<DashboardSnapshot>("/dashboard/contracts", {
    nextPath: "/dashboard",
  });

  if (!payload) {
    throw new Error("Dashboard backend nie zwrocil poprawnego payloadu.");
  }

  return payload;
}
