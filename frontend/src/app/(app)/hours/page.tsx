import { HoursView } from "@/features/hours";
import { fetchHoursBootstrapServer } from "@/features/hours/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function HoursPage() {
  await requireServerSession("/hours");

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
