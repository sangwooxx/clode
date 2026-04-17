import type { ContractStatus } from "@/features/contracts/types";

const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 0
});

export function formatMoney(value: number) {
  return moneyFormatter.format(Number(value || 0));
}

export function formatInteger(value: number) {
  return integerFormatter.format(Number(value || 0));
}

export function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("pl-PL") : value;
}

export function formatStatus(value: ContractStatus) {
  return value === "archived" ? "Zarchiwizowany" : "W realizacji";
}
