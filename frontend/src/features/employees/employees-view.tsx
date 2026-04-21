"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { Panel } from "@/components/ui/panel";
import { PdfExportDialog } from "@/components/ui/pdf-export-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  EmployeesDirectoryTable,
} from "@/features/employees/components/EmployeesDirectoryTable";
import { EmployeesEditorPanel } from "@/features/employees/components/EmployeesEditorPanel";
import {
  EmployeesToolbar,
  type EmployeesFilter,
} from "@/features/employees/components/EmployeesToolbar";
import {
  deleteEmployeeRecord,
  fetchEmployeesModuleData,
  saveEmployeeRecord,
} from "@/features/employees/api";
import {
  formatEmployeeMedicalState,
  formatEmployeeStatus,
} from "@/features/employees/formatters";
import {
  buildEmployeeDirectory,
  buildEmployeeFormValues,
  buildEmployeeRelations,
  buildEmployeeSummaryCards,
  buildEmployeeTableRows,
  findEmployeeByKey,
} from "@/features/employees/mappers";
import {
  buildEmployeePdfDefinitions,
  buildEmployeePrintDocument,
} from "@/features/employees/pdf";
import type {
  EmployeeDirectoryRecord,
  EmployeeFormValues,
  EmployeesBootstrapData,
} from "@/features/employees/types";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  buildPdfDialogSections,
  createPdfConfigState,
  togglePdfSection,
  type PdfConfigState,
} from "@/lib/print/pdf-config";
import { printDocument } from "@/lib/print/print-document";

type EmployeesScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: EmployeesBootstrapData };

const emptyFormValues = buildEmployeeFormValues();

export function EmployeesView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: EmployeesBootstrapData | null;
  initialError?: string | null;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "employeesView");
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
            : "Nie udalo sie pobrac kartoteki pracownikow.",
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

  const employeePdfDefinitions = useMemo(
    () =>
      detailEmployee
        ? buildEmployeePdfDefinitions({
            employee: detailEmployee,
            relations: detailRelations,
            medical: selectedMedical,
          })
        : [],
    [detailEmployee, detailRelations, selectedMedical]
  );

  const employeePdfSections = useMemo(
    () => buildPdfDialogSections(employeePdfDefinitions, employeePdfConfig),
    [employeePdfConfig, employeePdfDefinitions]
  );

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
    if (!canWrite) {
      return;
    }

    setEditingEmployeeKey(null);
    setFormValues(emptyFormValues);
    setFormError(null);
    setFormStatus(null);
  }

  function handleFormFieldChange(field: keyof EmployeeFormValues, value: string) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

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

    printDocument(
      buildEmployeePrintDocument({
        employee: detailEmployee,
        relations: detailRelations,
        medical: selectedMedical,
        enabledSectionIds,
      })
    );

    setIsPdfDialogOpen(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "success") return;

    if (!canWrite) {
      setFormError("Masz dostep tylko do podgladu kartoteki pracownikow.");
      return;
    }

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
        editingEmployee ? "Dane pracownika zostaly zaktualizowane." : "Pracownik zostal dodany."
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udalo sie zapisac danych pracownika.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteEmployee() {
    if (state.status !== "success" || !editingEmployee || !canWrite) return;

    const confirmed = window.confirm(
      `Czy na pewno chcesz usunac pracownika ${editingEmployee.name}?`
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
      setFormStatus("Pracownik zostal usuniety z kartoteki.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udalo sie usunac pracownika.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Pracownicy" title="Kartoteka pracownikow" />
        <Panel>
          <div className="status-stack">
            <p className="status-message">Ladowanie kartoteki pracownikow...</p>
          </div>
        </Panel>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="module-page">
        <SectionHeader eyebrow="Pracownicy" title="Kartoteka pracownikow" />
        <Panel>
          <div className="status-stack">
            <p className="status-message status-message--error">{state.message}</p>
            <ActionButton type="button" onClick={() => void reloadEmployees()}>
              Sprobuj ponownie
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
        title="Kartoteka pracownikow"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              {canWrite ? (
                <ActionButton type="button" onClick={handleCreateNew}>
                  Dodaj pracownika
                </ActionButton>
              ) : null}
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
                {isRefreshing ? "Odswiezanie..." : "Odswiez dane"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <EmployeesToolbar
        filter={filter}
        search={search}
        onFilterChange={setFilter}
        onSearchChange={setSearch}
      />

      <div className="employees-layout">
        <EmployeesDirectoryTable
          rows={tableRows}
          selectedEmployeeKey={selectedEmployee?.key}
          onSelectEmployee={handleSelectEmployee}
        />

        <div className="employees-side-stack">
          <EmployeesEditorPanel
            canWrite={canWrite}
            isSubmitting={isSubmitting}
            editingEmployee={editingEmployee}
            detailEmployee={detailEmployee}
            detailRelations={detailRelations}
            selectedMedical={selectedMedical}
            formValues={formValues}
            formError={formError}
            formStatus={formStatus}
            deleteBlocked={deleteBlocked}
            onCreateNew={handleCreateNew}
            onDeleteEmployee={handleDeleteEmployee}
            onSubmit={handleSubmit}
            onFieldChange={handleFormFieldChange}
          />
        </div>
      </div>

      <PdfExportDialog
        open={isPdfDialogOpen}
        title="PDF pracownika"
        description="Wybierz sekcje kartoteki, ktore maja wejsc do dokumentu."
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
