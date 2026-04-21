"use client";

import {
  formatEmployeeDate,
  formatEmployeeStatus,
  formatHours,
  formatMoney,
} from "@/features/employees/formatters";
import type {
  EmployeeDirectoryRecord,
  EmployeeMedicalState,
  EmployeeRelationSnapshot,
} from "@/features/employees/types";
import {
  compactPrintSections,
  type PrintDocumentOptions,
} from "@/lib/print/print-document";
import type { PdfSectionDefinition } from "@/lib/print/pdf-config";

type EmployeePdfArgs = {
  employee: EmployeeDirectoryRecord;
  relations: EmployeeRelationSnapshot | null;
  medical: EmployeeMedicalState;
};

export function buildEmployeePdfDefinitions({
  employee,
  relations,
  medical,
}: EmployeePdfArgs): PdfSectionDefinition[] {
  return [
    {
      id: "basic",
      label: "Dane podstawowe",
      description: "Tozsamosc pracownika i identyfikatory rekordu.",
      preview: [
        employee.name || "Bez nazwy",
        employee.worker_code ? `Kod ${employee.worker_code}` : "Bez kodu",
      ],
    },
    {
      id: "contact",
      label: "Kontakt i adres",
      description: "Telefon, miejscowosc i adres pracownika.",
      preview: [employee.phone || "Brak telefonu", employee.city || "Brak miasta"],
    },
    {
      id: "hr",
      label: "Status i dane kadrowe",
      description: "Status aktywnosci, zatrudnienie i badania.",
      preview: [
        formatEmployeeStatus(employee.status),
        employee.position || "Bez stanowiska",
        medical.label,
      ],
    },
    {
      id: "relations",
      label: "Powiazania operacyjne",
      description: "Godziny, karty pracy i koszt pracy powiazany z pracownikiem.",
      preview: [
        relations ? `${relations.hoursEntries} wpisow` : "0 wpisow",
        relations ? formatHours(relations.totalHours) : "0 h",
        relations ? formatMoney(relations.totalCost) : formatMoney(0),
      ],
    },
  ];
}

export function buildEmployeePrintDocument({
  employee,
  relations,
  medical,
  enabledSectionIds,
}: EmployeePdfArgs & {
  enabledSectionIds: Set<string>;
}): PrintDocumentOptions {
  const contactValue =
    [employee.phone, employee.city, employee.street].filter(Boolean).join(" | ") || "Brak danych";

  return {
    title: "Kartoteka pracownika",
    subtitle: employee.name,
    context: employee.worker_code ? `Kod ${employee.worker_code}` : "Kartoteka bez kodu",
    filename: `clode-pracownik-${employee.worker_code || employee.id || "rekord"}`,
    meta: [
      `Status: ${formatEmployeeStatus(employee.status)}`,
      `Stanowisko: ${employee.position || "Brak danych"}`,
    ],
    sections: compactPrintSections([
      enabledSectionIds.has("basic")
        ? {
            title: "Dane podstawowe",
            details: [
              { label: "Imie i nazwisko", value: employee.name || "Brak danych" },
              { label: "Kod pracownika", value: employee.worker_code || "Brak danych" },
              { label: "Identyfikator", value: employee.id || "Brak danych" },
            ],
          }
        : null,
      enabledSectionIds.has("contact")
        ? {
            title: "Kontakt i adres",
            details: [
              { label: "Telefon", value: employee.phone || "Brak danych" },
              { label: "Miasto", value: employee.city || "Brak danych" },
              { label: "Ulica", value: employee.street || "Brak danych" },
              { label: "Kontakt zbiorczy", value: contactValue },
            ],
          }
        : null,
      enabledSectionIds.has("hr")
        ? {
            title: "Status i dane kadrowe",
            details: [
              { label: "Status", value: formatEmployeeStatus(employee.status) },
              { label: "Stanowisko", value: employee.position || "Brak danych" },
              {
                label: "Data zatrudnienia",
                value: formatEmployeeDate(employee.employment_date),
              },
              {
                label: "Data zakonczenia",
                value: formatEmployeeDate(employee.employment_end_date),
              },
              { label: "Badania wazne do", value: medical.dateText },
              { label: "Stan badan", value: medical.label },
            ],
          }
        : null,
      enabledSectionIds.has("relations")
        ? {
            title: "Powiazania operacyjne",
            details: [
              { label: "Wpisy czasu", value: relations ? String(relations.hoursEntries) : "0" },
              {
                label: "Godziny lacznie",
                value: relations ? formatHours(relations.totalHours) : "0 h",
              },
              { label: "Karty pracy", value: relations ? String(relations.workCards) : "0" },
              {
                label: "Miesiace aktywnosci",
                value: relations ? String(relations.monthsCount) : "0",
              },
              {
                label: "Koszt godzin",
                value: relations ? formatMoney(relations.totalCost) : formatMoney(0),
              },
            ],
          }
        : null,
    ]),
  };
}
