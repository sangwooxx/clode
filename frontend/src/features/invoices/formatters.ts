const moneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2
});

const integerFormatter = new Intl.NumberFormat("pl-PL");

const monthFormatter = new Intl.DateTimeFormat("pl-PL", {
  month: "long",
  year: "numeric"
});

export function formatMoney(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return moneyFormatter.format(0);
  }
  return moneyFormatter.format(numeric);
}

export function formatInteger(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  if (Number.isNaN(numeric)) {
    return integerFormatter.format(0);
  }
  return integerFormatter.format(numeric);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pl-PL").format(date);
}

export function formatMonthLabel(year: string, month: string) {
  if (!year || !month) {
    return "-";
  }

  const date = new Date(`${year}-${month}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return `${month}/${year}`;
  }

  return monthFormatter.format(date);
}

export function formatPaymentStatus(status: string) {
  if (status === "paid") return "Opłacona";
  if (status === "overdue") return "Przeterminowana";
  return "Nieopłacona";
}

export function formatInvoiceType(type: string) {
  return type === "sales" ? "Sprzedażowa" : "Kosztowa";
}
