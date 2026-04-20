import { getDashboardSnapshot } from "@/lib/api/contracts";
import type { DashboardSnapshot } from "@/features/dashboard/types";

export async function fetchDashboardSnapshot() {
  const response = await getDashboardSnapshot();
  const payload = response as { ok?: boolean } & DashboardSnapshot;
  return payload;
}
