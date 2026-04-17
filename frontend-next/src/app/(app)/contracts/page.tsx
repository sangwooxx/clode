import { ContractsView } from "@/features/contracts";
import { fetchContractsServer } from "@/features/contracts/server";

export default async function ContractsPage() {
  try {
    const contracts = await fetchContractsServer(true);
    return <ContractsView initialContracts={contracts} />;
  } catch (error) {
    return (
      <ContractsView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać rejestru kontraktów."
        }
      />
    );
  }
}
