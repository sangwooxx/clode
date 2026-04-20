import { PlanningView } from "@/features/planning";
import { fetchPlanningBootstrapServer } from "@/features/planning/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function PlanningPage() {
  await requireServerSession("/planning");

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
