import { VacationsView } from "@/features/vacations";
import { fetchVacationsBootstrapServer } from "@/features/vacations/server";

export default async function VacationsPage() {
  try {
    const bootstrap = await fetchVacationsBootstrapServer();
    return <VacationsView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <VacationsView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się załadować modułu urlopów i nieobecności."
        }
      />
    );
  }
}
