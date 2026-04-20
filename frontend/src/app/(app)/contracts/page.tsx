import { ContractsView } from "@/features/contracts";
import { fetchContractsServer } from "@/features/contracts/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function ContractsPage() {
  await requireServerSession("/contracts");

  let initialError: string | undefined;
  let initialContracts;

  try {
    initialContracts = await fetchContractsServer(true);
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie pobrac rejestru kontraktow.";
  }

  return <ContractsView initialContracts={initialContracts} initialError={initialError} />;
}
