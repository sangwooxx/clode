import { DashboardView } from "@/features/dashboard";
import { fetchDashboardSnapshotServer } from "@/features/dashboard/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function DashboardPage() {
  await requireServerSession("/dashboard");

  let initialError: string | undefined;
  let initialSnapshot;

  try {
    initialSnapshot = await fetchDashboardSnapshotServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie pobrac snapshotu dashboardu.";
  }

  return <DashboardView initialSnapshot={initialSnapshot} initialError={initialError} />;
}
