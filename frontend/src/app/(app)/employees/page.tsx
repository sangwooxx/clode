import { EmployeesView } from "@/features/employees";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import { requireServerSession } from "@/lib/auth/server-auth";

export default async function EmployeesPage() {
  await requireServerSession("/employees");

  let initialError: string | undefined;
  let initialBootstrap;

  try {
    initialBootstrap = await fetchEmployeesBootstrapServer();
  } catch (error) {
    initialError =
      error instanceof Error ? error.message : "Nie udalo sie przygotowac kartoteki pracownikow.";
  }

  return <EmployeesView initialBootstrap={initialBootstrap} initialError={initialError} />;
}
