import { listContracts } from "@/lib/api/contracts";
import { listEmployees } from "@/lib/api/employees";
import {
  createTimeEntry,
  createTimeMonth,
  deleteTimeEntry,
  deleteTimeMonth,
  listTimeEntriesBootstrap,
  listTimeEntries,
  type TimeEntriesQuery,
  type TimeEntryPayload,
  type TimeMonthPayload,
  updateTimeEntry,
  updateTimeMonth,
} from "@/lib/api/time-entries";
import type { ContractRecord } from "@/features/contracts/types";
import type {
  HoursEmployeeRecord,
  HoursListResponse,
  HoursMonthResponse,
  HoursTimeEntryResponse,
  TimeEntryRecord,
} from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";

function filterActiveEmployees(employees: HoursEmployeeRecord[]) {
  return employees.filter((employee) => employee.status !== "inactive");
}

export async function fetchHoursData(filters: TimeEntriesQuery = {}) {
  return (await listTimeEntries(filters)) as HoursListResponse;
}

export async function fetchHoursBootstrapSummary() {
  const response = await listTimeEntriesBootstrap();
  return {
    months: Array.isArray(response.months) ? response.months : [],
    selectedMonthKey: String(response.selected_month_key || "").trim(),
  };
}

export async function fetchHoursContracts() {
  const response = (await listContracts(true)) as { contracts?: ContractRecord[] };
  return Array.isArray(response.contracts) ? response.contracts : [];
}

export async function fetchHoursEmployeeDirectory() {
  const directoryResponse = (await listEmployees()) as {
    employees?: HoursEmployeeRecord[];
  };
  return Array.isArray(directoryResponse.employees) ? directoryResponse.employees || [] : [];
}

export async function fetchHoursEmployees() {
  return filterActiveEmployees(await fetchHoursEmployeeDirectory());
}

export async function saveHoursEntry(entryId: string | null, payload: TimeEntryPayload) {
  const normalizedPayload: TimeEntryPayload = {
    ...payload,
    contract_id:
      payload.contract_id && payload.contract_id !== UNASSIGNED_TIME_CONTRACT_ID
        ? payload.contract_id
        : "",
    contract_name:
      payload.contract_id && payload.contract_id !== UNASSIGNED_TIME_CONTRACT_ID
        ? payload.contract_name || ""
        : "Nieprzypisane",
  };

  const response = (entryId
    ? await updateTimeEntry(entryId, normalizedPayload)
    : await createTimeEntry(normalizedPayload)) as HoursTimeEntryResponse;
  return response.time_entry;
}

export async function removeHoursEntry(entryId: string) {
  return deleteTimeEntry(entryId);
}

export async function saveHoursMonth(monthKey: string | null, payload: TimeMonthPayload) {
  if (!monthKey) {
    const response = (await createTimeMonth(payload)) as HoursMonthResponse;
    return response.month;
  }

  const updatePayload = {
    month_label: payload.month_label,
    selected: payload.selected,
    visible_investments: payload.visible_investments,
    finance: payload.finance,
  };
  const response = (await updateTimeMonth(monthKey, updatePayload)) as HoursMonthResponse;
  return response.month;
}

export async function removeHoursMonth(monthKey: string) {
  return deleteTimeMonth(monthKey);
}

export function findHoursEntryById(entries: TimeEntryRecord[], entryId: string | null) {
  if (!entryId) return null;
  return entries.find((entry) => entry.id === entryId) ?? null;
}
