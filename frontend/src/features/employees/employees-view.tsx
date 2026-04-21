"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormActions } from "@/components/ui/form-actions";
import { FormFeedback } from "@/components/ui/form-feedback";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { PdfExportDialog } from "@/components/ui/pdf-export-dialog";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  buildPdfDialogSections,
  createPdfConfigState,
  togglePdfSection,
  type PdfConfigState,
  type PdfSectionDefinition,
} from "@/lib/print/pdf-config";
import { compactPrintSections, printDocument } from "@/lib/print/print-document";
import {
  deleteEmployeeRecord,
  fetchEmployeesModuleData,
  saveEmployeeRecord,
} from "@/features/employees/api";
import {
  formatEmployeeCodeLabel,
  formatEmployeeDate,
  formatEmployeeDisplayName,
  formatEmployeeMedicalState,
  formatEmployeeStatus,
  formatHours,
  formatMoney,
} from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  buildEmployeeFormValues,
  buildEmployeeRelations,
  buildEmployeeSummaryCards,
  buildEmployeeTableRows,
  findEmployeeByKey,
} from "@/features/employees/mappers";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeeTableRow,
  EmployeesBootstrapData,
} from "@/features/employees/types";

type EmployeesFilter = "all" | "active" | "inactive";

type EmployeesScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: EmployeesBootstrapData };

const employeesTableColumns = (): Array<DataTableColumn<EmployeeTableRow>> => [
  {
    key: "lp",
    header: "Lp.",
    className: "employees-col-lp",
    sortValue: (row) => row.index,
    render: (row) => row.index,
  },
  {
    key: "employee",
    header: "Pracownik",
    className: "employees-col-employee",
    sortValue: (row) =>
      `${formatEmployeeDisplayName(row.employee, row.employee.name)} ${row.employee.worker_code}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">
          {formatEmployeeDisplayName(row.employee, row.employee.name)}
        </span>
        <span className="data-table__secondary">
          {(row.employee.position || "Bez stanowiska")} | Kod{" "}
          {formatEmployeeCodeLabel(row.employee.worker_code)}
        </span>
      </div>
    ),
  },
  {
    key: "hr",
    header: "Kadry",
    className: "employees-col-hr",
    sortValue: (row) => `${row.employee.status} ${row.employee.position}`,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.employee.position || "Bez stanowiska"}</span>
        <span className="data-table__secondary">
          <span
            className={
              row.employee.status === "inactive"
                ? "data-table__status-pill data-table__status-pill--muted"
                : "data-table__status-pill"
            }
          >
            {formatEmployeeStatus(row.employee.status)}
          </span>
        </span>
      </div>
    ),
  },
  {
    key: "employment",
    header: "Zatrudnienie i kontakt",
    className: "employees-col-employment",
    sortValue: (row) => row.employee.employment_date || row.employee.city || row.employee.phone,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">
          {formatEmployeeDate(row.employee.employment_date)}
        </span>
        <span className="data-table__secondary">
          {row.employee.city || row.employee.phone
            ? [row.employee.city, row.employee.phone].filter(Boolean).join(" • ")
            : "Brak danych kontaktowych"}
        </span>
      </div>
    ),
  },
  {
    key: "medical",
    header: "Badania",
    className: "employees-col-medical",
    sortValue: (row) => row.employee.medical_exam_valid_until,
    render: (row) => (
      <div className="data-table__stack">
        <span className="data-table__primary">{row.medical.dateText}</span>
        <span className="data-table__secondary">
          {row.medical.label} • {row.medical.daysText}
        </span>
      </div>
    ),
  },
  {
    key: "relations",
    header: "Powiązania",
    className: "employees-col-relations",
    sortValue: (row) => row.relations.hoursEntries,
    render: (row) => (
      <div className="employees-relation-list">
        <span className="employees-relation-pill">Czas: {row.relations.hoursEntries}</span>
        <span className="employees-relation-pill employees-relation-pill--muted">
          Karty: {row.relations.workCards}
        </span>
        <span className="employees-relation-pill employees-relation-pill--muted">
          Mies.: {row.relations.monthsCount}
        </span>
      </div>
    ),
  },
];

const emptyFormValues = buildEmployeeFormValues();

export function EmployeesView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: EmployeesBootstrapData | null;
  initialError?: string | null;
}) {
  const [state, setState] = useState<EmployeesScreenState>(() => {
    if (initialBootstrap) {
      return { status: "success", data: initialBootstrap };
    }

    if (initialError) {
      return { status: "error", message: initialError };
    }

    return { status: "loading" };
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EmployeesFilter>("all");
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(null);
  const [editingEmployeeKey, setEditingEmployeeKey] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<EmployeeFormValues>(() => emptyFormValues);
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [employeePdfConfig, setEmployeePdfConfig] = useState<PdfConfigState>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function reloadEmployees(options?: { preserveState?: boolean }) {
    if (options?.preserveState) {
      setIsRefreshing(true);
    } else {
      setState({ status: "loading" });
    }

    try {
      const bootstrap = await fetchEmployeesModuleData();
      setState({ status: "success", data: bootstrap });
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się pobrać kartoteki pracowników.",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    if (initialBootstrap || initialError) {
      return;
    }

    void reloadEmployees();
  }, [initialBootstrap, initialError]);

  const employeeDirectory = useMemo(() => {
    if (state.status !== "success") return [];
    return buildEmployeeDirectory({
      directoryEmployees: state.data.directoryEmployees,
      operationalEmployees: state.data.operationalEmployees,
    });
  }, [state]);

  const summaryCards = useMemo(() => {
    if (state.status !== "success") return [];
    return buildEmployeeSummaryCards({
      employees: employeeDirectory,
      relationSummaries: state.data.relationSummaries,
    });
  }, [employeeDirectory, state]);

  const tableRows = useMemo(() => {
    if (state.status !== "success") return [];
    return buildEmployeeTableRows({
      employees: employeeDirectory,
      relationSummaries: state.data.relationSummaries,
      search,
      filter,
    });
  }, [employeeDirectory, filter, search, state]);

  const selectedEmployee = useMemo(() => {
    if (employeeDirectory.length === 0) return null;
    const byKey = findEmployeeByKey(employeeDirectory, selectedEmployeeKey);
    if (byKey) return byKey;
    return tableRows[0]?.employee ?? employeeDirectory[0] ?? null;
  }, [employeeDirectory, selectedEmployeeKey, tableRows]);

  const editingEmployee = useMemo(
    () => findEmployeeByKey(employeeDirectory, editingEmployeeKey),
    [editingEmployeeKey, employeeDirectory]
  );
  const detailEmployee = editingEmployee ?? null;

  const detailRelations = useMemo(() => {
    if (state.status !== "success" || !detailEmployee) return null;
    return buildEmployeeRelations({
      employee: detailEmployee,
      employees: employeeDirectory,
      relationSummaries: state.data.relationSummaries,
    });
  }, [detailEmployee, employeeDirectory, state]);

  const selectedMedical = useMemo(
    () => formatEmployeeMedicalState(detailEmployee?.medical_exam_valid_until),
    [detailEmployee?.medical_exam_valid_until]
  );

  function _handlePrintEmployee() {
    if (!detailEmployee) return;

    const relations = detailRelations;
    const contactValue = [detailEmployee.phone, detailEmployee.city, detailEmployee.street]
      .filter(Boolean)
      .join(" • ") || "Brak danych";

    printDocument({
      title: "Kartoteka pracownika",
      subtitle: detailEmployee.name,
      filename: `clode-pracownik-${detailEmployee.worker_code || detailEmployee.id || "rekord"}`,
      meta: [
        `Status: ${formatEmployeeStatus(detailEmployee.status)}`,
        `Stanowisko: ${detailEmployee.position || "Brak danych"}`,
      ],
      sections: [
        {
          title: "Dane podstawowe",
          details: [
            { label: "Imię i nazwisko", value: detailEmployee.name || "Brak danych" },
            { label: "Kod pracownika", value: detailEmployee.worker_code || "Brak danych" },
            { label: "Status", value: formatEmployeeStatus(detailEmployee.status) },
            { label: "Stanowisko", value: detailEmployee.position || "Brak danych" },
            { label: "Data zatrudnienia", value: formatEmployeeDate(detailEmployee.employment_date) },
            {
              label: "Data zakończenia",
              value: formatEmployeeDate(detailEmployee.employment_end_date),
            },
          ],
        },
        {
          title: "Kontakt i adres",
          details: [
            { label: "Telefon", value: detailEmployee.phone || "Brak danych" },
            { label: "Miasto", value: detailEmployee.city || "Brak danych" },
            { label: "Ulica", value: detailEmployee.street || "Brak danych" },
            { label: "Kontakt zbiorczy", value: contactValue },
          ],
        },
        {
          title: "Powiązania operacyjne",
          details: [
            {
              label: "Wpisy czasu",
              value: relations ? String(relations.hoursEntries) : "0",
            },
            {
              label: "Godziny łącznie",
              value: relations ? formatHours(relations.totalHours) : "0 h",
            },
            {
              label: "Karty pracy",
              value: relations ? String(relations.workCards) : "0",
            },
            {
              label: "Miesiące aktywności",
              value: relations ? String(relations.monthsCount) : "0",
            },
            {
              label: "Koszt godzin",
              value: relations ? formatMoney(relations.totalCost) : formatMoney(0),
            },
            {
              label: "Badania",
              value: `${selectedMedical.dateText} • ${selectedMedical.label}`,
            },
          ],
        },
      ],
    });
  }

  const employeePdfDefinitions = useMemo<PdfSectionDefinition[]>(() => {
    if (!detailEmployee) return [];

    return [
      {
        id: "basic",
        label: "Dane podstawowe",
        description: "Tożsamość pracownika i identyfikatory rekordu.",
        preview: [
          detailEmployee.name || "Bez nazwy",
          detailEmployee.worker_code ? `Kod ${detailEmployee.worker_code}` : "Bez kodu",
        ],
      },
      {
        id: "contact",
        label: "Kontakt i adres",
        description: "Telefon, miejscowość i adres pracownika.",
        preview: [detailEmployee.phone || "Brak telefonu", detailEmployee.city || "Brak miasta"],
      },
      {
        id: "hr",
        label: "Status i dane kadrowe",
        description: "Status aktywności, zatrudnienie i badania.",
        preview: [
          formatEmployeeStatus(detailEmployee.status),
          detailEmployee.position || "Bez stanowiska",
          selectedMedical.label,
        ],
      },
      {
        id: "relations",
        label: "Powiązania operacyjne",
        description: "Godziny, karty pracy i koszt pracy powiązany z pracownikiem.",
        preview: [
          detailRelations ? `${detailRelations.hoursEntries} wpisów` : "0 wpisów",
          detailRelations ? formatHours(detailRelations.totalHours) : "0 h",
          detailRelations ? formatMoney(detailRelations.totalCost) : formatMoney(0),
        ],
      },
    ];
  }, [detailEmployee, detailRelations, selectedMedical.label]);

  const employeePdfSections = useMemo(
    () => buildPdfDialogSections(employeePdfDefinitions, employeePdfConfig),
    [employeePdfConfig, employeePdfDefinitions]
  );

  function handleOpenEmployeePdf() {
    if (!detailEmployee) return;
    setEmployeePdfConfig(createPdfConfigState(employeePdfDefinitions));
    setIsPdfDialogOpen(true);
  }

  function handleConfirmEmployeePdf() {
    if (!detailEmployee) return;

    const enabledSectionIds = new Set(
      employeePdfSections.filter((section) => section.enabled).map((section) => section.id)
    );
    const contactValue =
      [detailEmployee.phone, detailEmployee.city, detailEmployee.street].filter(Boolean).join(" • ") ||
      "Brak danych";

    printDocument({
      title: "Kartoteka pracownika",
      subtitle: detailEmployee.name,
      context: detailEmployee.worker_code ? `Kod ${detailEmployee.worker_code}` : "Kartoteka bez kodu",
      filename: `clode-pracownik-${detailEmployee.worker_code || detailEmployee.id || "rekord"}`,
      meta: [
        `Status: ${formatEmployeeStatus(detailEmployee.status)}`,
        `Stanowisko: ${detailEmployee.position || "Brak danych"}`,
      ],
      sections: compactPrintSections([
        enabledSectionIds.has("basic")
          ? {
              title: "Dane podstawowe",
              details: [
                { label: "Imię i nazwisko", value: detailEmployee.name || "Brak danych" },
                { label: "Kod pracownika", value: detailEmployee.worker_code || "Brak danych" },
                { label: "Identyfikator", value: detailEmployee.id || "Brak danych" },
              ],
            }
          : null,
        enabledSectionIds.has("contact")
          ? {
              title: "Kontakt i adres",
              details: [
                { label: "Telefon", value: detailEmployee.phone || "Brak danych" },
                { label: "Miasto", value: detailEmployee.city || "Brak danych" },
                { label: "Ulica", value: detailEmployee.street || "Brak danych" },
                { label: "Kontakt zbiorczy", value: contactValue },
              ],
            }
          : null,
        enabledSectionIds.has("hr")
          ? {
              title: "Status i dane kadrowe",
              details: [
                { label: "Status", value: formatEmployeeStatus(detailEmployee.status) },
                { label: "Stanowisko", value: detailEmployee.position || "Brak danych" },
                { label: "Data zatrudnienia", value: formatEmployeeDate(detailEmployee.employment_date) },
                { label: "Data zakończenia", value: formatEmployeeDate(detailEmployee.employment_end_date) },
                { label: "Badania ważne do", value: selectedMedical.dateText },
                { label: "Stan badań", value: selectedMedical.label },
              ],
            }
          : null,
        enabledSectionIds.has("relations")
          ? {
              title: "Powiązania operacyjne",
              details: [
                { label: "Wpisy czasu", value: detailRelations ? String(detailRelations.hoursEntries) : "0" },
                {
                  label: "Godziny łącznie",
                  value: detailRelations ? formatHours(detailRelations.totalHours) : "0 h",
                },
                { label: "Karty pracy", value: detailRelations ? String(detailRelations.workCards) : "0" },
                {
                  label: "Miesiące aktywności",
                  value: detailRelations ? String(detailRelations.monthsCount) : "0",
                },
                {
                  label: "Koszt godzin",
                  value: detailRelations ? formatMoney(detailRelations.totalCost) : formatMoney(0),
                },
              ],
            }
          : null,
      ]),
    });

    setIsPdfDialogOpen(false);
  }

  useEffect(() => {
    if (editingEmployee) {
      setFormValues(buildEmployeeFormValues(editingEmployee));
      return;
    }

    setFormValues(emptyFormValues);
  }, [editingEmployee]);

  useEffect(() => {
    if (selectedEmployee && !selectedEmployeeKey) {
      setSelectedEmployeeKey(selectedEmployee.key);
    }
  }, [selectedEmployee, selectedEmployeeKey]);

  function handleSelectEmployee(employee: EmployeeDirectoryRecord) {
    setSelectedEmployeeKey(employee.key);
    setEditingEmployeeKey(employee.key);
    setFormError(null);
    setFormStatus(null);
  }

  function handleCreateNew() {
    setEditingEmployeeKey(null);
    setFormValues(emptyFormValues);
    setFormError(null);
    setFormStatus(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success") return;

    setIsSubmitting(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const result = await saveEmployeeRecord({
        employee: editingEmployee,
        values: formValues,
        bootstrap: state.data,
      });
      setState({ status: "success", data: result.bootstrap });
      setSelectedEmployeeKey(result.selectedEmployeeKey);
      setEditingEmployeeKey(result.selectedEmployeeKey);
      setFormStatus(
        editingEmployee ? "Dane pracownika zostały zaktualizowane." : "Pracownik został dodany."
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Nie udało się zapisać danych pracownika."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEmployee() {
    if (state.status !== "success" || !editingEmployee) return;

    const confirmed = window.confirm(
      `Czy na pewno chcesz usunąć pracownika ${editingEmployee.name}?`
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    setFormError(null);
    setFormStatus(null);

    try {
      const bootstrap = await deleteEmployeeRecord({
        employee: editingEmployee,
        bootstrap: state.data,
      });
      setState({ status: "success", data: bootstrap });
      setSelectedEmployeeKey(null);
      setEditingEmployeeKey(null);
      setFormValues(emptyFormValues);
      setFormStatus("Pracownik został usunięty z kartoteki.");
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Nie udało się usunąć pracownika."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Pracownicy" title="Kartoteka pracowników" />
        <Panel>
          <div className="status-stack">
            <p className="status-message">Ładowanie kartoteki pracowników...</p>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Pracownicy" title="Kartoteka pracowników" />
        <Panel>
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <ActionButton type="button" onClick={() => void reloadEmployees()}>
              Spróbuj ponownie
            </ActionButton>
          </div>
        </Panel>
      </div>
    );
  }

  const deleteBlocked =
    (detailRelations?.hoursEntries || 0) > 0 || (detailRelations?.workCards || 0) > 0;

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Pracownicy"
        title="Kartoteka pracowników"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              <ActionButton type="button" onClick={handleCreateNew}>
                Dodaj pracownika
              </ActionButton>
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleOpenEmployeePdf}
                disabled={!detailEmployee}
              >
                PDF pracownika
              </ActionButton>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void reloadEmployees({ preserveState: true })}
                disabled={isRefreshing}
              >
                {isRefreshing ? "Odświeżanie..." : "Odśwież dane"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
          {summaryCards.slice(0, 4).map((card) => (
            <StatCard
              key={card.id}
              label={card.label}
            value={card.value}
            accent={card.accent}
          />
        ))}
      </div>

      <Panel className="panel--toolbar panel--toolbar--filters">
        <div className="employees-toolbar">
          <div className="toolbar-tabs">
            <ActionButton
              type="button"
              variant={filter === "all" ? "primary" : "secondary"}
              onClick={() => setFilter("all")}
            >
              Wszyscy
            </ActionButton>
            <ActionButton
              type="button"
              variant={filter === "active" ? "primary" : "secondary"}
              onClick={() => setFilter("active")}
            >
              Aktywni
            </ActionButton>
            <ActionButton
              type="button"
              variant={filter === "inactive" ? "primary" : "secondary"}
              onClick={() => setFilter("inactive")}
            >
              Nieaktywni
            </ActionButton>
          </div>
          <SearchField
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po nazwisku, kodzie, stanowisku lub kontakcie"
          />
        </div>
      </Panel>

      <div className="employees-layout">
        <Panel title="Lista pracowników">
          <DataTable
            columns={employeesTableColumns()}
            rows={tableRows}
            emptyMessage="Brak pracowników dla bieżących filtrów."
            rowKey={(row) => row.employee.key}
            onRowClick={(row) => handleSelectEmployee(row.employee)}
            getRowClassName={(row) =>
              row.employee.key === selectedEmployee?.key ? "data-table__row--active" : undefined
            }
            tableClassName="employees-table"
          />
        </Panel>

        <div className="employees-side-stack">
          <Panel title={editingEmployee ? "Edycja pracownika" : "Nowy pracownik"}>
            {detailEmployee ? (
              <div className="employees-spotlight">
                <div className="data-table__stack">
                  <span className="data-table__primary">{detailEmployee.name}</span>
                  <span className="data-table__secondary">
                    {detailEmployee.position || "Bez stanowiska"} •{" "}
                    {formatEmployeeStatus(detailEmployee.status)}
                  </span>
                </div>

                {detailRelations ? (
                  <div className="employees-detail-grid">
                    <div className="employees-detail-card">
                      <span className="field-card__label">Wpisy czasu</span>
                      <strong>{detailRelations.hoursEntries}</strong>
                      <small>{formatHours(detailRelations.totalHours)}</small>
                    </div>
                    <div className="employees-detail-card">
                      <span className="field-card__label">Karty pracy</span>
                      <strong>{detailRelations.workCards}</strong>
                      <small>{detailRelations.monthsCount} mies.</small>
                    </div>
                    <div className="employees-detail-card">
                      <span className="field-card__label">Koszt godzin</span>
                      <strong>{formatMoney(detailRelations.totalCost)}</strong>
                      <small>{detailEmployee.worker_code || "Bez kodu"}</small>
                    </div>
                    <div className="employees-detail-card">
                      <span className="field-card__label">Badania</span>
                      <strong>{selectedMedical.dateText}</strong>
                      <small>{selectedMedical.label}</small>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="status-message">Wybierz pracownika z tabeli lub dodaj nowy rekord.</p>
            )}

            <form className="employees-form" onSubmit={handleSubmit}>
              <FormGrid columns={2}>
                <label className="form-field">
                  <span>Imię</span>
                  <input
                    value={formValues.first_name}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        first_name: event.target.value,
                      }))
                    }
                    placeholder="Paweł"
                  />
                </label>

                <label className="form-field">
                  <span>Nazwisko</span>
                  <input
                    value={formValues.last_name}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        last_name: event.target.value,
                      }))
                    }
                    placeholder="Dąbrowski"
                  />
                </label>

                <label className="form-field">
                  <span>Kod pracownika</span>
                  <input
                    value={formValues.worker_code}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        worker_code: event.target.value,
                      }))
                    }
                    placeholder="PD-01"
                  />
                </label>

                <label className="form-field">
                  <span>Stanowisko</span>
                  <input
                    value={formValues.position}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        position: event.target.value,
                      }))
                    }
                    placeholder="Monter"
                  />
                </label>

                <label className="form-field">
                  <span>Status</span>
                  <select
                    value={formValues.status}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        status: event.target.value === "inactive" ? "inactive" : "active",
                      }))
                    }
                  >
                    <option value="active">Aktywny</option>
                    <option value="inactive">Nieaktywny</option>
                  </select>
                </label>

                <label className="form-field">
                  <span>Data zatrudnienia</span>
                  <input
                    type="date"
                    value={formValues.employment_date}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        employment_date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-field">
                  <span>Data zakończenia</span>
                  <input
                    type="date"
                    value={formValues.employment_end_date}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        employment_end_date: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className="form-field">
                  <span>Telefon</span>
                  <input
                    value={formValues.phone}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="+48 500 000 000"
                  />
                </label>

                <label className="form-field form-grid__span-2">
                  <span>Ulica</span>
                  <input
                    value={formValues.street}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        street: event.target.value,
                      }))
                    }
                    placeholder="ul. Przykładowa 1"
                  />
                </label>

                <label className="form-field">
                  <span>Kod i miejscowość</span>
                  <input
                    value={formValues.city}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        city: event.target.value,
                      }))
                    }
                    placeholder="00-000 Warszawa"
                  />
                </label>

                <label className="form-field">
                  <span>Badania ważne do</span>
                  <input
                    type="date"
                    value={formValues.medical_exam_valid_until}
                    onChange={(event) =>
                      setFormValues((current) => ({
                        ...current,
                        medical_exam_valid_until: event.target.value,
                      }))
                    }
                  />
                </label>
              </FormGrid>

              <FormFeedback
                items={[
                  formError ? { tone: "error", text: formError } : null,
                  formStatus ? { tone: "success", text: formStatus } : null,
                  editingEmployee && deleteBlocked
                    ? {
                        tone: "warning",
                        text:
                          "Rekord ma powiązane wpisy czasu lub karty pracy. Zmień status na nieaktywny zamiast usuwać pracownika.",
                      }
                    : null,
                ]}
              />

              <FormActions
                leading={
                  <>
                    <ActionButton
                      type="button"
                      variant="secondary"
                      onClick={handleCreateNew}
                      disabled={isSubmitting}
                    >
                      {editingEmployee ? "Nowy rekord" : "Wyczyść formularz"}
                    </ActionButton>
                    {editingEmployee ? (
                      <ActionButton
                        type="button"
                        variant="ghost"
                        onClick={handleDeleteEmployee}
                        disabled={isSubmitting || deleteBlocked}
                      >
                        Usuń
                      </ActionButton>
                    ) : null}
                  </>
                }
                trailing={
                  <ActionButton type="submit" disabled={isSubmitting}>
                    {isSubmitting
                      ? "Zapisywanie..."
                      : editingEmployee
                        ? "Zapisz zmiany"
                        : "Dodaj pracownika"}
                  </ActionButton>
                }
              />
            </form>
          </Panel>
        </div>
      </div>

      <PdfExportDialog
        open={isPdfDialogOpen}
        title="PDF pracownika"
        description="Wybierz sekcje kartoteki, które mają wejść do dokumentu."
        context={
          detailEmployee
            ? [
                detailEmployee.name || "Bez nazwy",
                detailEmployee.worker_code ? `Kod ${detailEmployee.worker_code}` : "Bez kodu",
                formatEmployeeStatus(detailEmployee.status),
              ]
            : []
        }
        sections={employeePdfSections}
        onClose={() => setIsPdfDialogOpen(false)}
        onToggleSection={(sectionId) =>
          setEmployeePdfConfig((current) => togglePdfSection(current, sectionId))
        }
        onToggleColumn={() => undefined}
        onReset={() => setEmployeePdfConfig(createPdfConfigState(employeePdfDefinitions))}
        onConfirm={handleConfirmEmployeePdf}
      />
    </div>
  );
}
