import type { HoursEmployeeRecord, HoursListResponse } from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";
import {
  fetchHoursBootstrapSummary,
  fetchHoursContracts,
  fetchHoursData,
  fetchHoursEmployeeDirectory,
  fetchHoursEmployees,
  removeHoursEntry,
  saveHoursEntry,
} from "@/features/hours/api";
import { ApiError, http } from "@/lib/api/http";
import {
  buildWorkCardEmployeeOptions,
  buildWorkCardSyncPayloads,
} from "@/features/work-cards/mappers";
import {
  type WorkCardBootstrapData,
  type WorkCardRecord,
  type WorkCardStore,
} from "@/features/work-cards/types";

function normalizeEmployeeMatch(
  entry: { employee_id?: string; employee_name?: string },
  employee: HoursEmployeeRecord,
  options?: { allowNameFallback?: boolean }
) {
  const employeeId = String(employee.id || "").trim();
  const entryEmployeeId = String(entry.employee_id || "").trim();

  if (employeeId && entryEmployeeId) {
    return employeeId === entryEmployeeId;
  }

  if (employeeId && !options?.allowNameFallback) {
    return false;
  }

  return String(entry.employee_name || "").trim().toLowerCase() ===
    String(employee.name || "").trim().toLowerCase();
}

function getContractKey(entry: { contract_id?: string }) {
  return String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID;
}

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

export async function fetchWorkCardBootstrapClient(): Promise<WorkCardBootstrapData> {
  const [contracts, employees, historicalEmployees, bootstrapSummary, store] = await Promise.all([
    fetchHoursContracts(),
    fetchHoursEmployees(),
    fetchHoursEmployeeDirectory(),
    fetchHoursBootstrapSummary(),
    fetchWorkCardStore(),
  ]);

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
    historicalEmployees,
    months,
    selectedMonthKey,
    selectedEmployeeKey:
      employeeOptions.find((option) => option.status !== "inactive")?.key ||
      employeeOptions[0]?.key ||
      "",
    store,
  };
}

export async function saveWorkCardAndSync(args: {
  store: WorkCardStore;
  card: WorkCardRecord;
  employee: HoursEmployeeRecord;
  employees: HoursEmployeeRecord[];
  syncableContractIds: string[];
}) {
  if (args.employee.status === "inactive") {
    throw new Error("Nie mozna zapisac karty pracy dla nieaktywnego pracownika.");
  }

  const savedStoreResponse = await http<{ store?: WorkCardStore }>("/work-cards/state", {
    method: "PUT",
    body: JSON.stringify({ store: args.store }),
  });
  const savedStore =
    savedStoreResponse.store && Array.isArray(savedStoreResponse.store.cards)
      ? savedStoreResponse.store
      : args.store;

  const syncPayloads = buildWorkCardSyncPayloads({
    card: args.card,
    employee: args.employee,
  }).filter((payload) => {
    const contractKey = payload.contract_id || UNASSIGNED_TIME_CONTRACT_ID;
    return (
      contractKey === UNASSIGNED_TIME_CONTRACT_ID ||
      args.syncableContractIds.includes(contractKey)
    );
  });

  try {
    const employeeNameKey = String(args.employee.name || "").trim().toLowerCase();
    const matchingNameCount = args.employees.filter(
      (employee) => String(employee.name || "").trim().toLowerCase() === employeeNameKey
    ).length;
    const allowNameFallback = !String(args.employee.id || "").trim() || matchingNameCount <= 1;

    const existingPayload = (await fetchHoursData({
      month: args.card.month_key,
      ...(String(args.employee.id || "").trim()
        ? { employee_id: String(args.employee.id || "").trim() }
        : { employee_name: args.employee.name }),
    })) as HoursListResponse;

    const existingEntries = existingPayload.entries.filter((entry) =>
      normalizeEmployeeMatch(entry, args.employee, {
        allowNameFallback,
      })
    );

    const existingByContract = new Map<string, HoursListResponse["entries"][number]>();
    const duplicateEntryIds = new Set<string>();

    existingEntries.forEach((entry) => {
      const contractKey = getContractKey(entry);
      const current = existingByContract.get(contractKey);
      const entryHasEmployeeId = String(entry.employee_id || "").trim().length > 0;
      const currentHasEmployeeId = String(current?.employee_id || "").trim().length > 0;

      if (!current) {
        existingByContract.set(contractKey, entry);
        return;
      }

      if (entryHasEmployeeId && !currentHasEmployeeId) {
        duplicateEntryIds.add(current.id);
        existingByContract.set(contractKey, entry);
        return;
      }

      duplicateEntryIds.add(entry.id);
    });

    for (const payload of syncPayloads) {
      const contractKey = payload.contract_id || UNASSIGNED_TIME_CONTRACT_ID;
      const existingEntry = existingByContract.get(contractKey) ?? null;

      const normalizedPayload = {
        ...payload,
        contract_id:
          payload.contract_id && payload.contract_id !== UNASSIGNED_TIME_CONTRACT_ID
            ? payload.contract_id
            : "",
      };

      try {
        await saveHoursEntry(existingEntry?.id ?? null, normalizedPayload);
      } catch (error) {
        if (!normalizedPayload.employee_id || !allowNameFallback) {
          throw error;
        }

        await saveHoursEntry(existingEntry?.id ?? null, {
          ...normalizedPayload,
          employee_id: "",
        });
      }
    }

    const activeContractKeys = new Set(
      syncPayloads.map((payload) => payload.contract_id || UNASSIGNED_TIME_CONTRACT_ID)
    );

    await Promise.all(
      existingEntries
        .filter((entry) => {
          const entryContractKey = getContractKey(entry);
          if (duplicateEntryIds.has(entry.id)) {
            return true;
          }
          if (
            entryContractKey !== UNASSIGNED_TIME_CONTRACT_ID &&
            !args.syncableContractIds.includes(entryContractKey)
          ) {
            return false;
          }
          return !activeContractKeys.has(entryContractKey);
        })
        .map((entry) => removeHoursEntry(entry.id))
    );

    return {
      store: savedStore,
    };
  } catch (error) {
    return {
      store: savedStore,
      syncError:
        error instanceof Error
          ? `Karta pracy zostala zapisana, ale synchronizacja z ewidencja czasu pracy nie powiodla sie: ${error.message}`
          : "Karta pracy zostala zapisana, ale synchronizacja z ewidencja czasu pracy nie powiodla sie.",
    };
  }
}
