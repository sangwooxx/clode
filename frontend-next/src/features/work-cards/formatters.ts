import { formatHours, formatMonthLabel, formatNumber, parseDecimalInput } from "@/features/hours/formatters";

const weekdayFormatter = new Intl.DateTimeFormat("pl-PL", {
  weekday: "short",
});

const dateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export { formatHours, formatMonthLabel, formatNumber, parseDecimalInput };

export function formatWorkCardWeekdayLabel(date: string) {
  const parsed = new Date(date);
  return weekdayFormatter.format(parsed);
}

export function formatWorkCardDayNumber(date: string) {
  const parsed = new Date(date);
  return dateFormatter.format(parsed).slice(0, 2);
}

export function formatWorkCardUpdatedAt(value: string) {
  if (!value) return "Brak zapisu";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return dateTimeFormatter.format(parsed);
}

