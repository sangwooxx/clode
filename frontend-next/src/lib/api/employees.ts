import type { HoursEmployeeRecord } from "@/features/hours/types";
import { http } from "@/lib/api/http";

export type EmployeesDirectoryResponse = {
  ok?: boolean;
  employees?: HoursEmployeeRecord[];
};

export type EmployeeRecordResponse = {
  ok?: boolean;
  employee?: HoursEmployeeRecord;
};

export function listEmployees() {
  return http<EmployeesDirectoryResponse>("/employees", { method: "GET" });
}

export function createEmployee(payload: HoursEmployeeRecord) {
  return http<EmployeeRecordResponse>("/employees", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateEmployee(employeeId: string, payload: HoursEmployeeRecord) {
  return http<EmployeeRecordResponse>(`/employees/${encodeURIComponent(employeeId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteEmployee(employeeId: string) {
  return http(`/employees/${encodeURIComponent(employeeId)}`, {
    method: "DELETE",
  });
}
