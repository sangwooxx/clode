import { EmployeesView } from "@/features/employees";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";
import { requireServerViewAccess } from "@/lib/auth/server-auth";

export default async function EmployeesPage() {
  await requireServerViewAccess("/employees", "employeesView");

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
