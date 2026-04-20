import { normalizeEmployeeText } from "@/features/employees/formatters";
import { formatVacationType } from "@/features/vacations/formatters";

export function normalizePlanningText(value: unknown) {
  return normalizeEmployeeText(value);
}

export function formatPlanningDate(value: string) {
  const normalized = normalizePlanningText(value);
  if (!normalized) return "-";

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function formatPlanningMonthLabel(monthKey: string) {
  const normalized = normalizePlanningText(monthKey);
  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    return normalized || "-";
  }

  const parsed = new Date(`${normalized}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
}

export function formatPlanningContractLabel(contractNumber: string, contractName: string) {
  const normalizedNumber = normalizePlanningText(contractNumber);
  const normalizedName = normalizePlanningText(contractName);
  return normalizedNumber ? `${normalizedNumber} • ${normalizedName}` : normalizedName;
}

export function formatPlanningAbsenceLabel(type: unknown) {
  return formatVacationType(type);
}

export function formatPlanningStaffingStatus(count: number) {
  return count > 0 ? "Obsadzony" : "Brak obsady";
}
