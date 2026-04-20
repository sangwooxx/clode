import { VacationsView } from "@/features/vacations";
import { fetchVacationsBootstrapServer } from "@/features/vacations/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function VacationsPage() {
  await requireServerSession("/vacations");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchVacationsBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie zaladowac modulu urlopow i nieobecnosci.";
  }

  return <VacationsView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
