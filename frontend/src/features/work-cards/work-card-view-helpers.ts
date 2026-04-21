import {
  formatEmployeeDisplayName,
} from "@/features/employees/formatters";
import { formatMonthLabel, parseDecimalInput } from "@/features/work-cards/formatters";
import { buildWorkCardEmployeeOptions } from "@/features/work-cards/mappers";
import type {
  WorkCardDayViewModel,
  WorkCardHistorySummary,
} from "@/features/work-cards/types";
import type { HoursEmployeeRecord } from "@/features/hours/types";

export type WorkCardHistoryPreview = {
  cardId: string;
  summary: WorkCardHistorySummary;
  employee: HoursEmployeeRecord | null;
  employeeLabel: string;
  employeeMeta: string;
  monthKey: string;
  monthLabel: string;
  totalHours: number;
  filledDays: number;
};

export function recalculateWorkCardRow(row: WorkCardDayViewModel) {
  const totalHours = Object.values(row.hoursByContract).reduce(
    (sum, value) => sum + parseDecimalInput(value),
    0
  );

  return {
    ...row,
    totalHours,
  };
}

export function normalizeEmployeeLookupKey(value: string | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function buildWorkCardMonthKey(year: string, month: string) {
  const normalizedYear = String(year || "").trim();
  const normalizedMonth = String(month || "").trim();

  if (!/^\d{4}$/.test(normalizedYear)) return "";
  if (!/^(0[1-9]|1[0-2])$/.test(normalizedMonth)) return "";

  return `${normalizedYear}-${normalizedMonth}`;
}

export function buildHistoricalWorkCardPreviews(args: {
  historicalCards: WorkCardHistorySummary[];
  historicalEmployees: HoursEmployeeRecord[];
}) {
  const { historicalCards, historicalEmployees } = args;

  return historicalCards
    .map((summary) => {
      const normalizedEmployeeId = String(summary.employee_id || "").trim();
      const employee =
        historicalEmployees.find((candidate) => {
          const candidateId = String(candidate.id || "").trim();
          if (normalizedEmployeeId && candidateId) {
            return candidateId === normalizedEmployeeId;
          }

          return (
            normalizeEmployeeLookupKey(candidate.name) ===
            normalizeEmployeeLookupKey(summary.employee_name)
          );
        }) ?? null;

      if ((employee?.status ?? "active") !== "inactive") {
        return null;
      }
      const employeeOption = employee
        ? buildWorkCardEmployeeOptions([employee])[0] ?? null
        : null;

      return {
        cardId: summary.card_id,
        summary,
        employee,
        employeeLabel:
          formatEmployeeDisplayName(
            employee,
            String(summary.employee_name || "Nieznany pracownik").trim()
          ) || "Nieznany pracownik",
        employeeMeta: employeeOption?.description || "Pracownik nieaktywny",
        monthKey: summary.month_key,
        monthLabel: summary.month_label || formatMonthLabel(summary.month_key),
        totalHours: Number(summary.total_hours || 0),
        filledDays: Number(summary.filled_days || 0),
      } satisfies WorkCardHistoryPreview;
    })
    .filter((item): item is WorkCardHistoryPreview => Boolean(item))
    .sort((left, right) => {
      if (left.monthKey !== right.monthKey) {
        return right.monthKey.localeCompare(left.monthKey);
      }

      return left.employeeLabel.localeCompare(right.employeeLabel, "pl", {
        sensitivity: "base",
        numeric: true,
      });
    });
}
