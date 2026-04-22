import { ContractsView } from "@/features/contracts";
import { resolveNextSelectedContractId } from "@/features/contracts/mappers";
import { fetchContractsServer, fetchContractSnapshotServer } from "@/features/contracts/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function ContractsPage() {
  await requireServerSession("/contracts");

  let initialError: string | undefined;
  let initialContracts;
  let initialSnapshot = null;

  try {
    initialContracts = await fetchContractsServer(true);
    const initialSelectedContractId = resolveNextSelectedContractId(initialContracts, null);
    if (initialSelectedContractId) {
      try {
        initialSnapshot = await fetchContractSnapshotServer(initialSelectedContractId);
      } catch {
        initialSnapshot = null;
      }
    }
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie pobrac rejestru kontraktow.";
  }

  return (
    <ContractsView
      initialContracts={initialContracts}
      initialSnapshot={initialSnapshot}
      initialError={initialError}
    />
  );
}
