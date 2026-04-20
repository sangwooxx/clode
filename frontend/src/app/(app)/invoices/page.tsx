import { InvoicesView } from "@/features/invoices";
import { fetchInvoicesBootstrapServer } from "@/features/invoices/server";

export default async function InvoicesPage() {
  try {
    const bootstrap = await fetchInvoicesBootstrapServer();
    return <InvoicesView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <InvoicesView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się uruchomić rejestru faktur."
        }
      />
    );
  }
}
