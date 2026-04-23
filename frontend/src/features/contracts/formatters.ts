import type { ContractHealthLevel, ContractStatus } from "@/features/contracts/types";

const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 0,
});

const hoursFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined) {
  return moneyFormatter.format(Number(value || 0));
}

export function formatInteger(value: number | null | undefined) {
  return integerFormatter.format(Number(value || 0));
}

export function formatHoursValue(value: number | null | undefined) {
  return hoursFormatter.format(Number(value || 0));
}

export function formatHours(value: number | null | undefined) {
  return `${formatHoursValue(value)} h`;
}

export function formatPercent(value: number | null | undefined, fallback = "brak podstaw") {
  if (value == null || Number.isNaN(value)) {
    return fallback;
  }
  return `${percentFormatter.format(Number(value || 0))}%`;
}

export function formatVarianceMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "brak planu";
  }
  const numeric = Number(value || 0);
  if (Math.abs(numeric) < 0.005) {
    return "0,00 zł";
  }
  const formatted = formatMoney(Math.abs(numeric));
  return numeric > 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatVariancePercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "brak planu";
  }
  const numeric = Number(value || 0);
  if (Math.abs(numeric) < 0.005) {
    return "0%";
  }
  const formatted = `${percentFormatter.format(Math.abs(numeric))}%`;
  return numeric > 0 ? `+${formatted}` : `-${formatted}`;
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("pl-PL") : value;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleString("pl-PL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : value;
}

export function formatMonthLabel(value: string | null | undefined) {
  if (!value) return "-";
  const [year, month] = String(value).split("-");
  if (!year || !month) return String(value);
  return `${month}.${year}`;
}

export function formatStaleness(days: number | null | undefined) {
  if (days == null) return "brak danych";
  if (days <= 0) return "dzisiaj";
  if (days === 1) return "1 dzień temu";
  return `${formatInteger(days)} dni temu`;
}

export function formatStatus(value: ContractStatus) {
  return value === "archived" ? "Zarchiwizowany" : "W realizacji";
}

export function formatHealthLevel(value: ContractHealthLevel) {
  if (value === "critical") return "Krytyczny";
  if (value === "attention") return "Uwaga";
  return "Dobry";
}

export function formatPlanVarianceLabel(value: string) {
  if (value === "critical") return "Koszt poza planem";
  if (value === "warning") return "Koszt wymaga uwagi";
  if (value === "on_track") return "Koszt w planie";
  return "Brak planu kosztu";
}
