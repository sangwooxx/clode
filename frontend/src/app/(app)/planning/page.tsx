import { PlanningView } from "@/features/planning";
import { fetchPlanningBootstrapServer } from "@/features/planning/server";

export default async function PlanningPage() {
  try {
    const bootstrap = await fetchPlanningBootstrapServer();
    return <PlanningView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <PlanningView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się załadować modułu planowania zasobów."
        }
      />
    );
  }
}
