import { PlanningView } from "@/features/planning";
import { fetchPlanningBootstrapServer } from "@/features/planning/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function PlanningPage() {
  await requireServerViewAccess("/planning", "planningView");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchPlanningBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie zaladowac modulu planowania zasobow.";
  }

  return <PlanningView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
