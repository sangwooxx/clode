const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2
});

const numberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 0
});

export function formatMoney(value: number) {
  return moneyFormatter.format(Number(value || 0));
}

export function formatHours(value: number) {
  return `${numberFormatter.format(Number(value || 0))} h`;
}

export function formatInteger(value: number) {
  return integerFormatter.format(Number(value || 0));
}

export function formatMonthLabel(value: string) {
  if (!value) return "-";
  const [year, month] = String(value).split("-");
  if (!year || !month) return value;
  return `${month}.${year}`;
}

export function formatDate(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("pl-PL") : value;
}
