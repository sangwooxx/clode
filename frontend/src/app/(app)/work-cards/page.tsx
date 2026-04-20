import { WorkCardView } from "@/features/work-cards";
import { fetchWorkCardsBootstrapServer } from "@/features/work-cards/server";

export default async function WorkCardsPage() {
  try {
    const bootstrap = await fetchWorkCardsBootstrapServer();
    return <WorkCardView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <WorkCardView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się przygotować kart pracy."
        }
      />
    );
  }
}
