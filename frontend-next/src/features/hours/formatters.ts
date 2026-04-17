import type { HoursMonthFinance } from "@/features/hours/types";

const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});

export const HOURS_FINANCE_FIELDS: Array<{
  key: keyof HoursMonthFinance;
  label: string;
}> = [
  { key: "payouts", label: "Wypłaty" },
  { key: "zus_company_1", label: "ZUS spółki 1" },
  { key: "zus_company_2", label: "ZUS spółki 2" },
  { key: "zus_company_3", label: "ZUS spółki 3" },
  { key: "pit4_company_1", label: "PIT-4 spółki 1" },
  { key: "pit4_company_2", label: "PIT-4 spółki 2" },
  { key: "pit4_company_3", label: "PIT-4 spółki 3" },
];

export function formatMoney(value: number) {
  return moneyFormatter.format(Number(value || 0));
}

export function formatHours(value: number) {
  return `${numberFormatter.format(Number(value || 0))} h`;
}

export function formatNumber(value: number) {
  return numberFormatter.format(Number(value || 0));
}

export function formatMonthLabel(monthKey: string) {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!year || !month) {
    return monthKey;
  }

  return new Date(year, month - 1, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
}

export function formatMonthShort(monthKey: string) {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);

  if (!year || !month) {
    return monthKey;
  }

  return new Date(year, month - 1, 1).toLocaleDateString("pl-PL", {
    month: "short",
    year: "numeric",
  });
}

export function formatContractStatusLabel(status: "active" | "archived" | "unassigned" | "missing") {
  if (status === "archived") return "Archiwalny";
  if (status === "unassigned") return "Nieprzypisany";
  if (status === "missing") return "Brak w rejestrze";
  return "Aktywny";
}

export function parseDecimalInput(value: string) {
  const normalized = String(value || "").trim().replace(/\s+/g, "").replace(",", ".");
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}
