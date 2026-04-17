import { HoursView } from "@/features/hours";
import { fetchHoursBootstrapServer } from "@/features/hours/server";

export default async function HoursPage() {
  try {
    const bootstrap = await fetchHoursBootstrapServer();
    return <HoursView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <HoursView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się przygotować ewidencji czasu pracy."
        }
      />
    );
  }
}
