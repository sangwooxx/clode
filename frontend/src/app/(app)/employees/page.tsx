import { EmployeesView } from "@/features/employees";
import { fetchEmployeesBootstrapServer } from "@/features/employees/server";

export default async function EmployeesPage() {
  try {
    const bootstrap = await fetchEmployeesBootstrapServer();
    return <EmployeesView initialBootstrap={bootstrap} />;
  } catch (error) {
    return (
      <EmployeesView
        initialError={
          error instanceof Error
            ? error.message
            : "Nie udało się przygotować kartoteki pracowników."
        }
      />
    );
  }
}
