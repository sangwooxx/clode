import { HoursView } from "@/features/hours";
import { fetchHoursBootstrapServer } from "@/features/hours/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function HoursPage() {
  await requireServerViewAccess("/hours", "hoursView");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchHoursBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie przygotowac ewidencji czasu pracy.";
  }

  return <HoursView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
