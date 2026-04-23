"use client";

import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { AppDrawer } from "@/components/ui/app-drawer";
import { FormFeedback } from "@/components/ui/form-feedback";
import { PdfExportDialog } from "@/components/ui/pdf-export-dialog";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import { findEmployeeByKey } from "@/features/employees/mappers";
import type { EmployeeDirectoryRecord } from "@/features/employees/types";
import {
  deleteWorkwearCatalogItem,
  deleteWorkwearIssueRecord,
  fetchWorkwearModuleData,
  saveWorkwearCatalogItem,
  saveWorkwearIssueRecord,
} from "@/features/workwear/api";
import {
  buildWorkwearAttentionRows,
  buildWorkwearCatalogFormValues,
  buildWorkwearCatalogRows,
  buildWorkwearDirectory,
  buildWorkwearEmployeeOptions,
  buildWorkwearEmployeeRows,
  buildWorkwearIssueEntries,
  buildWorkwearIssueFormValues,
  buildWorkwearIssueRowsForEmployee,
  buildWorkwearSummaryCards,
  resolveInitialWorkwearEmployeeKey,
} from "@/features/workwear/mappers";
import { filterWorkwearCatalogRows, filterWorkwearEmployeeRows } from "@/features/workwear/workwear-filters";
import { buildWorkwearPdfDefinitions, printWorkwearPdf } from "@/features/workwear/workwear-pdf";
import { WorkwearToolbar } from "@/features/workwear/workwear-toolbar";
import {
  WorkwearAttentionPanel,
  WorkwearCatalogPanel,
  WorkwearDirectoryPanels,
} from "@/features/workwear/components/WorkwearDirectoryPanels";
import {
  WorkwearCatalogFormPanel,
  WorkwearIssueFormPanel,
} from "@/features/workwear/components/WorkwearFormsPanels";
import type {
  WorkwearBootstrapData,
  WorkwearCatalogFormValues,
  WorkwearCatalogRow,
  WorkwearIssueEntry,
  WorkwearIssueFormValues,
} from "@/features/workwear/types";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView } from "@/lib/auth/permissions";
import {
  buildPdfDialogSections,
  createPdfConfigState,
  togglePdfColumn,
  togglePdfSection,
  type PdfConfigState,
  type PdfSectionDefinition,
} from "@/lib/print/pdf-config";

type WorkwearScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: WorkwearBootstrapData };

type FlashMessage = {
  tone: "success" | "error" | "warning";
  text: string;
} | null;

type DrawerState = "none" | "issue" | "catalog";

function normalizeIssueSelection(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function createInitialSelection(bootstrap: WorkwearBootstrapData) {
  const employees = buildWorkwearDirectory(bootstrap);
  const issueEntries = buildWorkwearIssueEntries({
    issues: bootstrap.issues,
    catalog: bootstrap.catalog,
    employees,
  });

  return resolveInitialWorkwearEmployeeKey({
    employees,
    issueEntries,
  });
}

export function WorkwearView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: WorkwearBootstrapData;
  initialError?: string;
}) {
  const { user } = useAuth();
  const canWrite = canManageView(user, "workwearView");

  const [screen, setScreen] = useState<WorkwearScreenState>(() => {
    if (initialBootstrap) {
      return { status: "success", data: initialBootstrap };
    }
    if (initialError) {
      return { status: "error", message: initialError };
    }
    return { status: "loading" };
  });
  const [selectedEmployeeKey, setSelectedEmployeeKey] = useState<string | null>(() =>
    initialBootstrap ? createInitialSelection(initialBootstrap) : null,
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [drawerState, setDrawerState] = useState<DrawerState>("none");
  const [issueForm, setIssueForm] = useState<WorkwearIssueFormValues>(() => {
    if (!initialBootstrap) {
      return {
        employee_key: "",
        issue_date: new Date().toISOString().slice(0, 10),
        item_id: "",
        size: "UNI",
        quantity: "1",
        notes: "",
      };
    }

    const employees = buildWorkwearDirectory(initialBootstrap);
    const selectedEmployee = findEmployeeByKey(employees, createInitialSelection(initialBootstrap));
    return buildWorkwearIssueFormValues({
      selectedEmployee,
      catalog: initialBootstrap.catalog,
    });
  });
  const [catalogForm, setCatalogForm] = useState<WorkwearCatalogFormValues>(() =>
    buildWorkwearCatalogFormValues(),
  );
  const [message, setMessage] = useState<FlashMessage>(null);
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);
  const [workwearPdfConfig, setWorkwearPdfConfig] = useState<PdfConfigState>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const derived = useMemo(() => {
    if (screen.status !== "success") {
      return null;
    }

    const employees = buildWorkwearDirectory(screen.data);
    const issueEntries = buildWorkwearIssueEntries({
      issues: screen.data.issues,
      catalog: screen.data.catalog,
      employees,
    });
    const activeRows = buildWorkwearEmployeeRows({
      employees,
      issueEntries,
    });
    const historicalRows = buildWorkwearEmployeeRows({
      employees,
      issueEntries,
      historical: true,
    });
    const selectedKey = resolveInitialWorkwearEmployeeKey({
      preferredKey: selectedEmployeeKey,
      employees,
      issueEntries,
    });
    const selectedEmployee = findEmployeeByKey(employees, selectedKey);
    const selectedIssueRows = buildWorkwearIssueRowsForEmployee({
      employee: selectedEmployee,
      issueEntries,
      employees,
    });

    return {
      employees,
      issueEntries,
      activeRows,
      historicalRows,
      selectedKey,
      selectedEmployee,
      selectedIssueRows,
      summaryCards: buildWorkwearSummaryCards({
        employees,
        catalog: screen.data.catalog,
        issueEntries,
      }),
      catalogRows: buildWorkwearCatalogRows({
        catalog: screen.data.catalog,
        issueEntries,
      }),
      attentionRows: buildWorkwearAttentionRows(issueEntries),
    };
  }, [screen, selectedEmployeeKey]);

  const workwearPdfDefinitions = useMemo<PdfSectionDefinition[]>(() => {
    if (!derived?.selectedEmployee) return [];

    return buildWorkwearPdfDefinitions({
      selectedEmployee: derived.selectedEmployee,
      selectedIssueRows: derived.selectedIssueRows,
    });
  }, [derived]);

  const workwearPdfSections = useMemo(
    () => buildPdfDialogSections(workwearPdfDefinitions, workwearPdfConfig),
    [workwearPdfConfig, workwearPdfDefinitions],
  );

  const loadInitialWorkwear = useEffectEvent(() => {
    void handleRefresh();
  });

  useEffect(() => {
    if (!initialBootstrap) {
      loadInitialWorkwear();
    }
  }, [initialBootstrap]);

  useEffect(() => {
    if (derived && derived.selectedKey !== selectedEmployeeKey) {
      setSelectedEmployeeKey(derived.selectedKey);
    }
  }, [derived, selectedEmployeeKey]);

  async function handleRefresh() {
    try {
      setBusyAction("refresh");
      const bootstrap = await fetchWorkwearModuleData();
      const nextSelectedKey = createInitialSelection(bootstrap);
      const employees = buildWorkwearDirectory(bootstrap);
      const selectedEmployee = findEmployeeByKey(employees, nextSelectedKey);

      setScreen({ status: "success", data: bootstrap });
      setSelectedEmployeeKey(nextSelectedKey);
      setEditingIssueId(null);
      setEditingCatalogId(null);
      setDrawerState("none");
      setIssueForm(
        buildWorkwearIssueFormValues({
          selectedEmployee,
          catalog: bootstrap.catalog,
        }),
      );
      setCatalogForm(buildWorkwearCatalogFormValues());
      setMessage({
        tone: "success",
        text: "Dane odzieży roboczej zostały odświeżone.",
      });
    } catch (error) {
      setScreen({
        status: "error",
        message: error instanceof Error ? error.message : "Nie udało się odświeżyć modułu odzieży roboczej.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleSelectEmployee(employee: EmployeeDirectoryRecord) {
    setSelectedEmployeeKey(employee.key);
    if (!editingIssueId) {
      setIssueForm((current) => ({
        ...current,
        employee_key: employee.status === "inactive" ? "" : employee.key,
      }));
    }
  }

  function handleNewIssue() {
    const selectedEmployee = derived?.selectedEmployee ?? null;
    const catalog = screen.status === "success" ? screen.data.catalog : [];
    setEditingIssueId(null);
    setIssueForm(
      buildWorkwearIssueFormValues({
        selectedEmployee,
        catalog,
      }),
    );
    setMessage(null);
    setDrawerState("issue");
  }

  function handleNewCatalogItem() {
    setEditingCatalogId(null);
    setCatalogForm(buildWorkwearCatalogFormValues());
    setMessage(null);
    setDrawerState("catalog");
  }

  async function handleIssueSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (screen.status !== "success") {
      return;
    }

    try {
      setBusyAction("save-issue");
      const bootstrap = await saveWorkwearIssueRecord({
        issueId: editingIssueId,
        values: issueForm,
        bootstrap: screen.data,
      });
      const employees = buildWorkwearDirectory(bootstrap);
      const nextSelectedKey = normalizeIssueSelection(issueForm.employee_key) || createInitialSelection(bootstrap);
      const selectedEmployee = findEmployeeByKey(employees, nextSelectedKey);

      setScreen({ status: "success", data: bootstrap });
      setSelectedEmployeeKey(nextSelectedKey);
      setEditingIssueId(null);
      setDrawerState("none");
      setIssueForm(
        buildWorkwearIssueFormValues({
          selectedEmployee,
          catalog: bootstrap.catalog,
        }),
      );
      setMessage({
        tone: "success",
        text: "Wydanie odzieży zostało zapisane.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się zapisać wydania.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCatalogSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (screen.status !== "success") {
      return;
    }

    try {
      setBusyAction("save-catalog");
      const bootstrap = await saveWorkwearCatalogItem({
        itemId: editingCatalogId,
        values: catalogForm,
        bootstrap: screen.data,
      });
      const employees = buildWorkwearDirectory(bootstrap);
      const selectedEmployee = findEmployeeByKey(employees, derived?.selectedKey || null);

      setScreen({ status: "success", data: bootstrap });
      setEditingCatalogId(null);
      setDrawerState("none");
      setCatalogForm(buildWorkwearCatalogFormValues());
      setIssueForm((current) =>
        current.item_id
          ? current
          : buildWorkwearIssueFormValues({
              selectedEmployee,
              catalog: bootstrap.catalog,
            }),
      );
      setMessage({
        tone: "success",
        text: "Katalog odzieży został zapisany.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się zapisać elementu katalogu.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteIssue(entry: WorkwearIssueEntry) {
    if (screen.status !== "success") {
      return;
    }

    try {
      setBusyAction(`delete-issue-${entry.issue.id}`);
      const bootstrap = await deleteWorkwearIssueRecord({
        issueId: entry.issue.id,
        bootstrap: screen.data,
      });
      const employees = buildWorkwearDirectory(bootstrap);
      const selectedEmployee = findEmployeeByKey(employees, selectedEmployeeKey);

      setScreen({ status: "success", data: bootstrap });
      setEditingIssueId(null);
      setIssueForm(
        buildWorkwearIssueFormValues({
          selectedEmployee,
          catalog: bootstrap.catalog,
        }),
      );
      setMessage({
        tone: "success",
        text: "Wydanie odzieży zostało usunięte.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się usunąć wydania.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeleteCatalogItem(row: WorkwearCatalogRow) {
    if (screen.status !== "success") {
      return;
    }

    try {
      setBusyAction(`delete-item-${row.item.id}`);
      const bootstrap = await deleteWorkwearCatalogItem({
        itemId: row.item.id,
        bootstrap: screen.data,
      });

      setScreen({ status: "success", data: bootstrap });
      if (editingCatalogId === row.item.id) {
        setEditingCatalogId(null);
        setCatalogForm(buildWorkwearCatalogFormValues());
        setDrawerState("none");
      }
      setMessage({
        tone: "success",
        text: "Element katalogu został usunięty.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się usunąć elementu katalogu.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function handleEditIssue(entry: WorkwearIssueEntry) {
    setEditingIssueId(entry.issue.id);
    setIssueForm(
      buildWorkwearIssueFormValues({
        issueEntry: entry,
        catalog: screen.status === "success" ? screen.data.catalog : [],
      }),
    );
    if (entry.employee) {
      setSelectedEmployeeKey(entry.employee.key);
    }
    if (entry.resolution === "ambiguous" || entry.resolution === "missing_employee") {
      setMessage({
        tone: "warning",
        text: "Wpis legacy nie ma jednoznacznego pracownika. Wskaż go ręcznie przed zapisem.",
      });
    } else {
      setMessage(null);
    }
    setDrawerState("issue");
  }

  function handleEditCatalogItem(row: WorkwearCatalogRow) {
    setEditingCatalogId(row.item.id);
    setCatalogForm(buildWorkwearCatalogFormValues(row.item));
    setMessage(null);
    setDrawerState("catalog");
  }

  function handleOpenWorkwearPdf() {
    if (!derived?.selectedEmployee) return;
    setWorkwearPdfConfig(createPdfConfigState(workwearPdfDefinitions));
    setIsPdfDialogOpen(true);
  }

  function handleConfirmWorkwearPdf() {
    if (!derived?.selectedEmployee) return;

    const enabledSectionIds = new Set(
      workwearPdfSections.filter((section) => section.enabled).map((section) => section.id),
    );

    printWorkwearPdf({
      selectedEmployee: derived.selectedEmployee,
      selectedIssueRows: derived.selectedIssueRows,
      enabledSectionIds,
      pdfConfig: workwearPdfConfig,
    });

    setIsPdfDialogOpen(false);
  }

  if (screen.status === "loading") {
    return (
      <div className="module-page status-stack">
        <SectionHeader eyebrow="Kartoteka BHP" title="Odzież robocza" />
        <p className="status-message">Trwa ładowanie modułu odzieży roboczej...</p>
      </div>
    );
  }

  if (screen.status === "error" || !derived) {
    return (
      <div className="module-page status-stack">
        <SectionHeader
          eyebrow="Kartoteka BHP"
          title="Odzież robocza"
          actions={
            <ActionButton type="button" variant="secondary" onClick={() => void handleRefresh()}>
              Spróbuj ponownie
            </ActionButton>
          }
        />
        <p className="status-message status-message--error">
          {screen.status === "error" ? screen.message : "Nie udało się załadować modułu odzieży roboczej."}
        </p>
      </div>
    );
  }

  const activeRows = filterWorkwearEmployeeRows(derived.activeRows, employeeSearch);
  const historicalRows = filterWorkwearEmployeeRows(derived.historicalRows, employeeSearch);
  const catalogRows = filterWorkwearCatalogRows(derived.catalogRows, catalogSearch);
  const employeeOptions = buildWorkwearEmployeeOptions({
    employees: derived.employees,
    includeEmployeeKey: editingIssueId ? issueForm.employee_key : null,
  });
  const selectedEmployeeInactive = derived.selectedEmployee?.status === "inactive";
  const editingHistoricalEmployee = issueForm.employee_key
    ? employeeOptions.find((option) => option.key === issueForm.employee_key)?.historical
    : undefined;

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kartoteka BHP"
        title="Odzież robocza"
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              {canWrite ? (
                <>
                  <ActionButton type="button" onClick={handleNewIssue}>
                    Dodaj wydanie
                  </ActionButton>
                  <ActionButton type="button" variant="secondary" onClick={handleNewCatalogItem}>
                    Dodaj element katalogu
                  </ActionButton>
                </>
              ) : null}
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                onClick={handleOpenWorkwearPdf}
                disabled={!derived.selectedEmployee}
              >
                PDF wydania
              </ActionButton>
              <ActionButton
                type="button"
                variant="secondary"
                onClick={() => void handleRefresh()}
                disabled={busyAction === "refresh"}
              >
                {busyAction === "refresh" ? "Odświeżanie..." : "Odśwież"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats">
        {derived.summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <WorkwearToolbar
        employeeSearch={employeeSearch}
        catalogSearch={catalogSearch}
        onEmployeeSearchChange={setEmployeeSearch}
        onCatalogSearchChange={setCatalogSearch}
      />

      <FormFeedback items={[message ? { tone: message.tone, text: message.text } : null]} />

      <div className="workwear-layout">
        <div className="workwear-main-stack">
          <WorkwearDirectoryPanels
            activeRows={activeRows}
            historicalRows={historicalRows}
            selectedEmployeeKey={derived.selectedKey}
            selectedEmployee={derived.selectedEmployee}
            selectedIssueRows={derived.selectedIssueRows}
            canWrite={canWrite}
            onSelectEmployee={handleSelectEmployee}
            onEditIssue={handleEditIssue}
            onDeleteIssue={(entry) => void handleDeleteIssue(entry)}
          />
          <WorkwearAttentionPanel attentionRows={derived.attentionRows} />
          <WorkwearCatalogPanel
            rows={catalogRows}
            canWrite={canWrite}
            onEditCatalogItem={handleEditCatalogItem}
            onDeleteCatalogItem={(row) => void handleDeleteCatalogItem(row)}
          />
        </div>
      </div>

      {drawerState === "issue" ? (
        <AppDrawer
          eyebrow="Odzież robocza"
          title={editingIssueId ? "Edytuj wydanie" : "Dodaj wydanie"}
          onClose={() => setDrawerState("none")}
          size="wide"
        >
          <WorkwearIssueFormPanel
            canWrite={canWrite}
            busyAction={busyAction}
            catalog={screen.data.catalog}
            employeeOptions={employeeOptions}
            issueForm={issueForm}
            editingIssueId={editingIssueId}
            selectedEmployeeInactive={selectedEmployeeInactive}
            editingHistoricalEmployee={editingHistoricalEmployee}
            onChangeField={(field, value) =>
              setIssueForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onReset={handleNewIssue}
            onSubmit={handleIssueSubmit}
            embedded
          />
        </AppDrawer>
      ) : null}

      {drawerState === "catalog" ? (
        <AppDrawer
          eyebrow="Odzież robocza"
          title={editingCatalogId ? "Edytuj element katalogu" : "Dodaj element katalogu"}
          onClose={() => setDrawerState("none")}
          size="wide"
        >
          <WorkwearCatalogFormPanel
            canWrite={canWrite}
            busyAction={busyAction}
            catalogForm={catalogForm}
            editingCatalogId={editingCatalogId}
            onChangeField={(field, value) =>
              setCatalogForm((current) => ({
                ...current,
                [field]: value,
              }))
            }
            onReset={handleNewCatalogItem}
            onSubmit={handleCatalogSubmit}
            embedded
          />
        </AppDrawer>
      ) : null}

      <PdfExportDialog
        open={isPdfDialogOpen}
        title="PDF wydania odzieży"
        description="Skonfiguruj sekcje dokumentu i kolumny tabeli przed wydrukiem."
        context={
          derived?.selectedEmployee
            ? [
                derived.selectedEmployee.name || "Bez nazwy",
                derived.selectedEmployee.worker_code ? `Kod ${derived.selectedEmployee.worker_code}` : "Bez kodu",
                `${derived.selectedIssueRows.length} pozycji`,
              ]
            : []
        }
        sections={workwearPdfSections}
        onClose={() => setIsPdfDialogOpen(false)}
        onToggleSection={(sectionId) => setWorkwearPdfConfig((current) => togglePdfSection(current, sectionId))}
        onToggleColumn={(sectionId, columnId) =>
          setWorkwearPdfConfig((current) => togglePdfColumn(current, sectionId, columnId))
        }
        onReset={() => setWorkwearPdfConfig(createPdfConfigState(workwearPdfDefinitions))}
        onConfirm={handleConfirmWorkwearPdf}
      />
    </div>
  );
}
