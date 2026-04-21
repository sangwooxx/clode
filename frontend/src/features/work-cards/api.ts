import type { HoursEmployeeRecord } from "@/features/hours/types";
import {
  fetchHoursBootstrapSummary,
  fetchHoursContracts,
  fetchHoursEmployeeDirectory,
} from "@/features/hours/api";
import { ApiError, http } from "@/lib/api/http";
import {
  buildWorkCardEmployeeOptions,
  mergeWorkCardEmployeeDirectory,
} from "@/features/work-cards/mappers";
import {
  type WorkCardBootstrapData,
  type WorkCardHistorySummary,
  type WorkCardRecord,
  type WorkCardStore,
} from "@/features/work-cards/types";

export async function fetchWorkCardStore() {
  try {
    const response = await http<{ store?: WorkCardStore }>("/work-cards/state", {
      method: "GET",
    });

    if (response.store && Array.isArray(response.store.cards)) {
      return response.store;
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        version: 1,
        cards: [],
      } satisfies WorkCardStore;
    }
    throw error;
  }

  return {
    version: 1,
    cards: [],
  } satisfies WorkCardStore;
}

export async function fetchWorkCardHistorySummaries() {
  const response = await http<{ cards?: WorkCardHistorySummary[] }>("/work-cards/history", {
    method: "GET",
  });
  return Array.isArray(response.cards) ? response.cards : [];
}

export async function fetchWorkCardCard(args: {
  monthKey: string;
  employee: Pick<HoursEmployeeRecord, "id" | "name">;
}) {
  const params = new URLSearchParams();
  params.set("month", args.monthKey);
  if (String(args.employee.id || "").trim()) {
    params.set("employee_id", String(args.employee.id || "").trim());
  }
  if (String(args.employee.name || "").trim()) {
    params.set("employee_name", String(args.employee.name || "").trim());
  }

  const response = await http<{ card?: WorkCardRecord | null }>(
    `/work-cards/card?${params.toString()}`,
    {
      method: "GET",
    }
  );
  return response.card ?? null;
}

export async function fetchWorkCardBootstrapClient(): Promise<WorkCardBootstrapData> {
  const [contracts, employeeDirectory, bootstrapSummary, historicalCards] = await Promise.all([
    fetchHoursContracts(),
    fetchHoursEmployeeDirectory(),
    fetchHoursBootstrapSummary(),
    fetchWorkCardHistorySummaries(),
  ]);

  const mergedEmployeeDirectory = mergeWorkCardEmployeeDirectory({
    employeeDirectory,
    historicalCards,
  });
  const employees = mergedEmployeeDirectory.filter((employee) => employee.status !== "inactive");
  const employeeOptions = buildWorkCardEmployeeOptions(employees);
  const months = bootstrapSummary.months;
  const selectedMonthKey =
    bootstrapSummary.selectedMonthKey ||
    months.find((month) => month.selected)?.month_key ||
    months[0]?.month_key ||
    "";

  return {
    contracts,
    employees,
    historicalEmployees: mergedEmployeeDirectory,
    months,
    selectedMonthKey,
    selectedEmployeeKey:
      employeeOptions.find((option) => option.status !== "inactive")?.key ||
      employeeOptions[0]?.key ||
      "",
    historicalCards,
  };
}

export async function saveWorkCardAndSync(args: {
  card: WorkCardRecord;
  employee: HoursEmployeeRecord;
}) {
  if (args.employee.status === "inactive") {
    throw new Error("Nie mozna zapisac karty pracy dla nieaktywnego pracownika.");
  }

  const savedCardResponse = await http<{ card?: WorkCardRecord | null; sync_error?: string }>(
    "/work-cards/card",
    {
      method: "PUT",
      body: JSON.stringify({ card: args.card }),
    }
  );
  return {
    card: savedCardResponse.card ?? args.card,
    syncError:
      typeof savedCardResponse.sync_error === "string" && savedCardResponse.sync_error.trim()
        ? savedCardResponse.sync_error
        : null,
  };
}
