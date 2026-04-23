import { WorkCardView } from "@/features/work-cards";
import { fetchWorkCardBootstrapServer } from "@/features/work-cards/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function WorkCardsPage() {
  await requireServerViewAccess("/work-cards", "hoursView");

  let initialError: string | undefined;
  let initialBootstrap;
  let initialCard;

  try {
    const bootstrap = await fetchWorkCardBootstrapServer();
    initialBootstrap = bootstrap.bootstrap;
    initialCard = bootstrap.initialCard;
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie przygotowac kart pracy.";
  }

  return (
    <WorkCardView
      initialBootstrap={initialBootstrap}
      initialCard={initialCard}
      initialError={initialError}
    />
  );
}
