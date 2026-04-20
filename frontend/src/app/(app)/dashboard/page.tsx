import { DashboardView } from "@/features/dashboard";
import { fetchDashboardSnapshotServer } from "@/features/dashboard/server";

export default async function DashboardPage() {
  try {
    const snapshot = await fetchDashboardSnapshotServer();
    return <DashboardView initialSnapshot={snapshot} />;
  } catch (error) {
    return (
      <DashboardView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udalo sie pobrac snapshotu dashboardu."
        }
      />
    );
  }
}
