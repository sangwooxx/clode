import { http } from "@/lib/api/http";

export type TimeEntriesQuery = {
  month?: string;
  contract_id?: string;
  employee_id?: string;
  employee_name?: string;
  user?: string;
};

export type TimeEntryPayload = {
  month_key: string;
  employee_id?: string;
  employee_name: string;
  contract_id?: string;
  contract_name?: string;
  hours: number;
};

export type TimeMonthFinancePayload = {
  zus_company_1: number;
  zus_company_2: number;
  zus_company_3: number;
  pit4_company_1: number;
  pit4_company_2: number;
  pit4_company_3: number;
  payouts: number;
};

export type TimeMonthPayload = {
  month_key: string;
  month_label: string;
  selected?: boolean;
  visible_investments: string[];
  finance: TimeMonthFinancePayload;
};

function buildQueryString(filters: TimeEntriesQuery = {}) {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const normalized = String(value ?? "").trim();
    if (!normalized) return;
    params.set(key, normalized);
  });

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function listTimeEntries(filters: TimeEntriesQuery = {}) {
  return http(`/time-entries${buildQueryString(filters)}`, {
    method: "GET",
  });
}

export function createTimeEntry(payload: TimeEntryPayload) {
  return http("/time-entries", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTimeEntry(entryId: string, payload: TimeEntryPayload) {
  return http(`/time-entries/${encodeURIComponent(entryId)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTimeEntry(entryId: string) {
  return http(`/time-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE",
  });
}

export function createTimeMonth(payload: TimeMonthPayload) {
  return http("/time-months", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateTimeMonth(monthKey: string, payload: Omit<TimeMonthPayload, "month_key">) {
  return http(`/time-months/${encodeURIComponent(monthKey)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteTimeMonth(monthKey: string) {
  return http(`/time-months/${encodeURIComponent(monthKey)}`, {
    method: "DELETE",
  });
}
