import { InvoicesView } from "@/features/invoices";
import { fetchInvoicesBootstrapServer } from "@/features/invoices/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function InvoicesPage() {
  await requireServerSession("/invoices");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchInvoicesBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie uruchomic rejestru faktur.";
  }

  return <InvoicesView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
