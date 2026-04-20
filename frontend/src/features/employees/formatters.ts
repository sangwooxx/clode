import {
  formatHours,
  formatMoney,
  formatNumber,
} from "@/features/hours/formatters";
import type { EmployeeMedicalState } from "@/features/employees/types";

type EmployeeDisplaySource = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  worker_code?: string | null;
};

const mojibakeMarkers = ["Ãƒ", "Ã…", "Ã„", "Ã¢"];

export { formatHours, formatMoney, formatNumber };

export function repairEmployeeText(value: unknown) {
  const text = String(value ?? "");
  if (!mojibakeMarkers.some((marker) => text.includes(marker))) {
    return text;
  }

  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

export function normalizeEmployeeText(value: unknown) {
  return repairEmployeeText(value).trim().replace(/\s+/g, " ");
}

export function composeEmployeeName(firstName: string, lastName: string) {
  return [normalizeEmployeeText(lastName), normalizeEmployeeText(firstName)]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function formatEmployeeDisplayName(
  employee: EmployeeDisplaySource | null | undefined,
  fallback = ""
) {
  const firstName = normalizeEmployeeText(employee?.first_name);
  const lastName = normalizeEmployeeText(employee?.last_name);

  if (firstName || lastName) {
    return [firstName, lastName].filter(Boolean).join(" ").trim();
  }

  return normalizeEmployeeText(employee?.name) || fallback;
}

export function formatEmployeeCodeLabel(value: unknown, fallback = "Bez kodu") {
  return normalizeEmployeeText(value) || fallback;
}

export function splitEmployeeName(value: string) {
  const normalized = normalizeEmployeeText(value);
  if (!normalized) {
    return {
      first_name: "",
      last_name: "",
    };
  }

  const [lastName, ...firstNameParts] = normalized.split(" ");

  return {
    first_name: firstNameParts.join(" "),
    last_name: lastName,
  };
}

export function formatEmployeeStatus(status: string | null | undefined) {
  return status === "inactive" ? "Nieaktywny" : "Aktywny";
}

export function formatEmployeeDate(value: string | null | undefined) {
  const normalized = normalizeEmployeeText(value);
  if (!normalized) {
    return "-";
  }

  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("pl-PL").format(parsed);
}

export function formatEmployeeMedicalState(
  validUntil: string | null | undefined
): EmployeeMedicalState {
  const normalized = normalizeEmployeeText(validUntil);
  if (!normalized) {
    return {
      label: "Brak terminu",
      tone: "neutral",
      dateText: "-",
      daysText: "-",
    };
  }

  const target = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return {
      label: "Brak terminu",
      tone: "neutral",
      dateText: normalized,
      daysText: "-",
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysRemaining = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (daysRemaining < 0) {
    return {
      label: "Po terminie",
      tone: "danger",
      dateText: formatEmployeeDate(normalized),
      daysText: `${Math.abs(daysRemaining)} dni po terminie`,
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: "Termin blisko",
      tone: "warning",
      dateText: formatEmployeeDate(normalized),
      daysText: daysRemaining === 0 ? "Dzisiaj" : `${daysRemaining} dni`,
    };
  }

  return {
    label: "Aktualne",
    tone: "ok",
    dateText: formatEmployeeDate(normalized),
    daysText: `${daysRemaining} dni`,
  };
}
