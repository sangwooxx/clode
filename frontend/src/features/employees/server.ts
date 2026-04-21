import { fetchBackendJsonServer } from "@/lib/api/server-fetch";
import type { EmployeesBootstrapData } from "@/features/employees/types";
import type { HoursEmployeeRecord } from "@/features/hours/types";

type EmployeesSummaryResponse = {
  employees?: HoursEmployeeRecord[];
  operational_employees?: HoursEmployeeRecord[];
  relation_summaries?: EmployeesBootstrapData["relationSummaries"];
};

export async function fetchEmployeesBootstrapServer(): Promise<EmployeesBootstrapData> {
  const { payload } = await fetchBackendJsonServer<EmployeesSummaryResponse>("/employees/summary", {
    nextPath: "/employees",
  });

  return {
    directoryEmployees: Array.isArray(payload?.employees) ? payload.employees : [],
    operationalEmployees: Array.isArray(payload?.operational_employees)
      ? payload.operational_employees
      : [],
    relationSummaries: Array.isArray(payload?.relation_summaries)
      ? payload.relation_summaries
      : [],
  };
}
