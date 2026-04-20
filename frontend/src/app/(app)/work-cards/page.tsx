import { WorkCardView } from "@/features/work-cards";
import { fetchWorkCardsBootstrapServer } from "@/features/work-cards/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function WorkCardsPage() {
  await requireServerSession("/work-cards");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchWorkCardsBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie przygotowac kart pracy.";
  }

  return <WorkCardView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
