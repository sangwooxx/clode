export function normalizeWorkwearText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeWorkwearDate(value: unknown) {
  const normalized = normalizeWorkwearText(value);
  if (!normalized) {
    return "";
  }

  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toISOString().slice(0, 10);
}

export function formatWorkwearDate(value: string | null | undefined) {
  const normalized = normalizeWorkwearDate(value);
  if (!normalized) {
    return "Brak daty";
  }

  return new Date(`${normalized}T00:00:00`).toLocaleDateString("pl-PL");
}

export function formatWorkwearQuantity(value: number | string | null | undefined) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return "0";
  }

  return new Intl.NumberFormat("pl-PL", {
    maximumFractionDigits: Number.isInteger(parsed) ? 0 : 2,
  }).format(parsed);
}

export function formatWorkwearCategory(value: string | null | undefined) {
  const normalized = normalizeWorkwearText(value);
  return normalized || "Bez kategorii";
}
