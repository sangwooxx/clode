import { VacationsView } from "@/features/vacations";
import { fetchVacationsBootstrapServer } from "@/features/vacations/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function VacationsPage() {
  await requireServerViewAccess("/vacations", "vacationsView");

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
