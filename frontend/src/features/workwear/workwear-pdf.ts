import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import { formatWorkwearDate, formatWorkwearQuantity } from "@/features/workwear/formatters";
import type { WorkwearIssueRow } from "@/features/workwear/types";
import { compactPrintSections, pickPrintTableColumns, printDocument, type PrintTable } from "@/lib/print/print-document";
import { getEnabledPdfColumnIds, type PdfConfigState, type PdfSectionDefinition } from "@/lib/print/pdf-config";

export function buildWorkwearPdfDefinitions(args: {
  selectedEmployee: EmployeeDirectoryRecord;
  selectedIssueRows: WorkwearIssueRow[];
}): PdfSectionDefinition[] {
  const totalQuantity = args.selectedIssueRows.reduce((sum, row) => sum + Number(row.entry.issue.quantity || 0), 0);

  return [
    {
      id: "employee",
      label: "Dane pracownika",
      description: "Identyfikacja pracownika i kontekst wydania.",
      preview: [args.selectedEmployee.name || "Bez nazwy", args.selectedEmployee.position || "Bez stanowiska"],
    },
    {
      id: "summary",
      label: "Podsumowanie wydania",
      description: "Liczba wydań i suma wydanych sztuk.",
      preview: [`${args.selectedIssueRows.length} pozycji`, `${formatWorkwearQuantity(totalQuantity)} szt.`],
    },
    {
      id: "items",
      label: "Pozycje wydania",
      description: "Tabela pozycji możliwych do przekazania lub archiwizacji.",
      preview: [`${args.selectedIssueRows.length} wierszy`],
      columns: [
        { id: "date", label: "Data" },
        { id: "item", label: "Element" },
        { id: "size", label: "Rozmiar" },
        { id: "quantity", label: "Ilość" },
        { id: "notes", label: "Uwagi" },
      ],
    },
  ];
}

export function printWorkwearPdf(args: {
  selectedEmployee: EmployeeDirectoryRecord;
  selectedIssueRows: WorkwearIssueRow[];
  enabledSectionIds: Set<string>;
  pdfConfig: PdfConfigState;
}) {
  const totalQuantity = args.selectedIssueRows.reduce((sum, row) => sum + Number(row.entry.issue.quantity || 0), 0);

  const itemsTable: PrintTable = {
    columns: [
      { id: "date", label: "Data", width: "16%" },
      { id: "item", label: "Element", width: "34%" },
      { id: "size", label: "Rozmiar", width: "14%", align: "center" },
      { id: "quantity", label: "Ilość", width: "12%", align: "right" },
      { id: "notes", label: "Uwagi", width: "24%" },
    ],
    rows: args.selectedIssueRows.map((row) => ({
      date: formatWorkwearDate(row.entry.issue.issue_date),
      item: row.entry.issue.item_name || "—",
      size: row.entry.issue.size || "—",
      quantity: `${formatWorkwearQuantity(row.entry.issue.quantity)} szt.`,
      notes: row.entry.issue.notes || "—",
    })),
    emptyText: "Brak pozycji wydania do wydruku.",
  };

  printDocument({
    title: "Wydanie odzieży roboczej",
    subtitle: args.selectedEmployee.name,
    context: args.selectedEmployee.worker_code
      ? `Kod ${args.selectedEmployee.worker_code}`
      : "Kartoteka bez kodu",
    filename: `clode-wydanie-odziezy-${args.selectedEmployee.worker_code || args.selectedEmployee.id || "rekord"}`,
    meta: [
      `Status: ${args.selectedEmployee.status === "inactive" ? "Nieaktywny" : "Aktywny"}`,
      `Stanowisko: ${args.selectedEmployee.position || "Brak danych"}`,
    ],
    sections: compactPrintSections([
      args.enabledSectionIds.has("employee")
        ? {
            title: "Dane pracownika",
            details: [
              { label: "Imię i nazwisko", value: args.selectedEmployee.name || "Brak danych" },
              { label: "Kod pracownika", value: args.selectedEmployee.worker_code || "Brak danych" },
              { label: "Stanowisko", value: args.selectedEmployee.position || "Brak danych" },
              {
                label: "Status",
                value: args.selectedEmployee.status === "inactive" ? "Nieaktywny" : "Aktywny",
              },
            ],
          }
        : null,
      args.enabledSectionIds.has("summary")
        ? {
            title: "Podsumowanie wydania",
            details: [
              { label: "Liczba wydań", value: String(args.selectedIssueRows.length) },
              {
                label: "Łączna ilość",
                value: `${formatWorkwearQuantity(totalQuantity)} szt.`,
              },
            ],
          }
        : null,
      args.enabledSectionIds.has("items")
        ? {
            title: "Pozycje wydania",
            table: pickPrintTableColumns(itemsTable, getEnabledPdfColumnIds(args.pdfConfig, "items")),
          }
        : null,
    ]),
  });
}
