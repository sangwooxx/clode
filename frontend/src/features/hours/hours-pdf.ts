import type { PdfConfigState, PdfSectionDefinition } from "@/lib/print/pdf-config";
import {
  buildPdfDialogSections,
  createPdfConfigState,
  getEnabledPdfColumnIds,
} from "@/lib/print/pdf-config";
import {
  compactPrintSections,
  pickPrintTableColumns,
  printDocument,
  type PrintTable,
} from "@/lib/print/print-document";
import { formatContractStatusLabel, formatHours, formatMoney, formatMonthLabel, formatNumber } from "@/features/hours/formatters";
import type { HoursContractOption, HoursMonthRecord, TimeEntryRecord } from "@/features/hours/types";
import { UNASSIGNED_TIME_CONTRACT_ID } from "@/features/hours/types";
import type { HoursContractSummaryRow, HoursEmployeeRow } from "@/features/hours/view-types";

export type HoursPdfContext = {
  selectedMonth: HoursMonthRecord;
  selectedEmployeeRow: HoursEmployeeRow | null;
  employeeEntries: TimeEntryRecord[];
  monthEntries: TimeEntryRecord[];
  hoursRows: HoursEmployeeRow[];
  contractSummaryRows: HoursContractSummaryRow[];
  contractOptions: HoursContractOption[];
  employeeHoursTotal: number;
};

export function buildHoursPdfDefinitions(args: HoursPdfContext): PdfSectionDefinition[] {
  const isEmployeeContext = Boolean(args.selectedEmployeeRow);
  const currentEntries = isEmployeeContext ? args.employeeEntries : args.monthEntries;

  return [
    {
      id: "scope",
      label: "Zakres raportu",
      description: "Miesiąc, kontekst i podstawowe sumy raportu.",
      preview: [
        args.selectedMonth.month_label || formatMonthLabel(args.selectedMonth.month_key),
        isEmployeeContext ? args.selectedEmployeeRow?.employeeLabel || "Pracownik" : "Cały miesiąc",
      ],
    },
    {
      id: "entries",
      label: "Wpisy ewidencji",
      description: "Tabela wpisów lub agregat bieżącego kontekstu widoku.",
      preview: [`${formatNumber(currentEntries.length)} wpisów`],
      columns: isEmployeeContext
        ? [
            { id: "contract", label: "Kontrakt" },
            { id: "status", label: "Status" },
            { id: "hours", label: "Godziny" },
            { id: "cost", label: "Koszt" },
          ]
        : [
            { id: "employee", label: "Pracownik" },
            { id: "contract", label: "Kontrakt" },
            { id: "status", label: "Status" },
            { id: "hours", label: "Godziny" },
            { id: "cost", label: "Koszt" },
          ],
    },
    ...(isEmployeeContext
      ? []
      : [
          {
            id: "employees",
            label: "Podsumowanie pracowników",
            description: "Agregacja godzin i kosztów per pracownik.",
            preview: [`${args.hoursRows.length} pracowników`],
            columns: [
              { id: "employee", label: "Pracownik" },
              { id: "contracts", label: "Kontrakty" },
              { id: "hours", label: "Godziny" },
              { id: "cost", label: "Koszt" },
              { id: "entries", label: "Wpisy" },
            ],
          } satisfies PdfSectionDefinition,
        ]),
    {
      id: "contracts",
      label: "Agregacja kontraktowa",
      description: "Podsumowanie kontraktów dla wybranego miesiąca.",
      preview: [`${args.contractSummaryRows.length} kontraktów`],
      columns: [
        { id: "contract", label: "Kontrakt" },
        { id: "code", label: "Kod" },
        { id: "status", label: "Status" },
        { id: "hours", label: "Godziny" },
        { id: "cost", label: "Koszt" },
        { id: "entries", label: "Wpisy" },
      ],
    },
  ];
}

export function buildHoursPdfConfig(args: HoursPdfContext) {
  return createPdfConfigState(buildHoursPdfDefinitions(args));
}

export function buildHoursPdfSections(args: HoursPdfContext, hoursPdfConfig: PdfConfigState) {
  return buildPdfDialogSections(buildHoursPdfDefinitions(args), hoursPdfConfig);
}

export function printHoursReport(args: HoursPdfContext, hoursPdfConfig: PdfConfigState) {
  const isEmployeeContext = Boolean(args.selectedEmployeeRow);
  const currentEntries = isEmployeeContext ? args.employeeEntries : args.monthEntries;
  const totalHours = isEmployeeContext
    ? args.employeeHoursTotal
    : args.monthEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const totalCost = currentEntries.reduce((sum, entry) => sum + Number(entry.cost_amount || 0), 0);
  const enabledSectionIds = new Set(
    buildHoursPdfSections(args, hoursPdfConfig)
      .filter((section) => section.enabled)
      .map((section) => section.id)
  );

  const entriesTable: PrintTable = {
    columns: isEmployeeContext
      ? [
          { id: "contract", label: "Kontrakt", width: "42%" },
          { id: "status", label: "Status", width: "18%" },
          { id: "hours", label: "Godziny", width: "16%", align: "right" },
          { id: "cost", label: "Koszt", width: "24%", align: "right" },
        ]
      : [
          { id: "employee", label: "Pracownik", width: "26%" },
          { id: "contract", label: "Kontrakt", width: "28%" },
          { id: "status", label: "Status", width: "14%" },
          { id: "hours", label: "Godziny", width: "14%", align: "right" },
          { id: "cost", label: "Koszt", width: "18%", align: "right" },
        ],
    rows: currentEntries.map((entry) => {
      const option =
        args.contractOptions.find(
          (candidate) =>
            candidate.id === (String(entry.contract_id || "").trim() || UNASSIGNED_TIME_CONTRACT_ID)
        ) ?? null;

      return {
        employee: entry.employee_name || "—",
        contract: entry.contract_name || "Nieprzypisane",
        status: option ? formatContractStatusLabel(option.status) : "Brak powiązania",
        hours: formatHours(entry.hours || 0),
        cost: formatMoney(entry.cost_amount || 0),
      };
    }),
    emptyText: "Brak wpisów ewidencji do wydruku.",
  };

  const employeesTable: PrintTable = {
    columns: [
      { id: "employee", label: "Pracownik", width: "28%" },
      { id: "contracts", label: "Kontrakty", width: "32%" },
      { id: "hours", label: "Godziny", width: "14%", align: "right" },
      { id: "cost", label: "Koszt", width: "16%", align: "right" },
      { id: "entries", label: "Wpisy", width: "10%", align: "right" },
    ],
    rows: args.hoursRows.map((row) => ({
      employee: row.employeeName,
      contracts: row.contracts.map((contract) => contract.label).join(" | ") || "—",
      hours: formatHours(row.totalHours),
      cost: formatMoney(row.totalCost),
      entries: formatNumber(row.entriesCount),
    })),
    emptyText: "Brak agregacji pracowników do wydruku.",
  };

  const contractsTable: PrintTable = {
    columns: [
      { id: "contract", label: "Kontrakt", width: "30%" },
      { id: "code", label: "Kod", width: "14%" },
      { id: "status", label: "Status", width: "14%" },
      { id: "hours", label: "Godziny", width: "14%", align: "right" },
      { id: "cost", label: "Koszt", width: "18%", align: "right" },
      { id: "entries", label: "Wpisy", width: "10%", align: "right" },
    ],
    rows: args.contractSummaryRows.map((row) => ({
      contract: row.option.label,
      code: row.option.code || "—",
      status: formatContractStatusLabel(row.option.status),
      hours: formatHours(row.aggregate.hours_total),
      cost: formatMoney(row.aggregate.cost_total),
      entries: formatNumber(row.aggregate.entries_count),
    })),
    emptyText: "Brak kontraktów w wybranym miesiącu.",
  };

  printDocument({
    title: "Ewidencja czasu pracy",
    subtitle: isEmployeeContext
      ? args.selectedEmployeeRow?.employeeLabel || args.selectedMonth.month_label
      : args.selectedMonth.month_label,
    context: args.selectedMonth.month_label || formatMonthLabel(args.selectedMonth.month_key),
    filename: `clode-ewidencja-czasu-${args.selectedMonth.month_key}${isEmployeeContext ? `-${args.selectedEmployeeRow?.employeeName || "pracownik"}` : ""}`,
    meta: [
      isEmployeeContext ? "Raport pracownika" : "Raport miesiąca",
      `Wpisy: ${formatNumber(currentEntries.length)}`,
      `Suma godzin: ${formatHours(totalHours)}`,
      `Suma kosztów: ${formatMoney(totalCost)}`,
    ],
    sections: compactPrintSections([
      enabledSectionIds.has("scope")
        ? {
            title: "Zakres raportu",
            details: [
              { label: "Miesiąc", value: args.selectedMonth.month_label || formatMonthLabel(args.selectedMonth.month_key) },
              { label: "Kontekst", value: isEmployeeContext ? "Wybrany pracownik" : "Cały miesiąc" },
              { label: "Pracownik", value: args.selectedEmployeeRow?.employeeLabel || "Wszyscy pracownicy" },
              { label: "Wpisy", value: formatNumber(currentEntries.length) },
              { label: "Suma godzin", value: formatHours(totalHours) },
              { label: "Suma kosztów", value: formatMoney(totalCost) },
            ],
          }
        : null,
      enabledSectionIds.has("entries")
        ? {
            title: "Wpisy ewidencji",
            table: pickPrintTableColumns(entriesTable, getEnabledPdfColumnIds(hoursPdfConfig, "entries")),
          }
        : null,
      enabledSectionIds.has("employees") && !isEmployeeContext
        ? {
            title: "Podsumowanie pracowników",
            table: pickPrintTableColumns(employeesTable, getEnabledPdfColumnIds(hoursPdfConfig, "employees")),
          }
        : null,
      enabledSectionIds.has("contracts")
        ? {
            title: "Podsumowanie kontraktów miesiąca",
            table: pickPrintTableColumns(contractsTable, getEnabledPdfColumnIds(hoursPdfConfig, "contracts")),
          }
        : null,
    ]),
  });
}
