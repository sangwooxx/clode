import { buildPermissionLabels } from "@/lib/auth/permissions";

export function formatRoleLabel(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrator") return "Administrator";
  if (normalized === "kierownik") return "Kierownik";
  if (normalized === "księgowość" || normalized === "ksiegowosc") return "Ksiegowosc";
  if (normalized === "read-only" || normalized === "readonly") return "Tylko odczyt";
  if (!normalized) return "Uzytkownik";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function formatStatusLabel(status: string | null | undefined) {
  return String(status || "").trim() === "inactive" ? "Nieaktywne" : "Aktywne";
}

export function formatTimestamp(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Brak danych";
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return normalized;
  return date.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export { buildPermissionLabels };
