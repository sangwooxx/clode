import type { VacationStatus, VacationType } from "@/features/vacations/types";

export function normalizeVacationText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeVacationType(value: unknown): VacationType {
  const normalized = normalizeVacationText(value).toLowerCase();

  if (normalized === "vacation") return "vacation";
  if (normalized === "on_demand") return "on_demand";
  if (normalized === "sick_leave" || normalized === "l4") return "sick_leave";
  return "other";
}

export function normalizeVacationStatus(value: unknown): VacationStatus {
  const normalized = normalizeVacationText(value).toLowerCase();
  if (normalized === "approved") return "approved";
  if (normalized === "rejected") return "rejected";
  return "pending";
}

export function formatVacationType(value: unknown) {
  const type = normalizeVacationType(value);
  return {
    vacation: "Urlop wypoczynkowy",
    on_demand: "Urlop na żądanie",
    sick_leave: "L4",
    other: "Inna nieobecność",
  }[type];
}

export function formatVacationStatus(value: unknown) {
  const status = normalizeVacationStatus(value);
  return {
    pending: "Oczekuje",
    approved: "Zatwierdzony",
    rejected: "Odrzucony",
  }[status];
}

export function formatVacationDays(value: number) {
  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(Number(value || 0));
}

export function formatVacationDate(value: string | undefined) {
  const normalized = normalizeVacationText(value);
  if (!normalized) return "-";

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return parsed.toLocaleDateString("pl-PL");
}

export function formatVacationDateRange(startDate: string, endDate: string) {
  const formattedStart = formatVacationDate(startDate);
  const formattedEnd = formatVacationDate(endDate || startDate);
  if (formattedStart === formattedEnd) {
    return formattedStart;
  }
  return `${formattedStart} - ${formattedEnd}`;
}
