"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
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
  formatWorkwearDate,
  formatWorkwearQuantity,
} from "@/features/workwear/formatters";
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
import type {
  WorkwearAttentionRow,
  WorkwearBootstrapData,
  WorkwearCatalogFormValues,
  WorkwearCatalogRow,
  WorkwearEmployeeRow,
  WorkwearIssueEntry,
  WorkwearIssueFormValues,
  WorkwearIssueRow,
} from "@/features/workwear/types";
import { WORKWEAR_SIZE_OPTIONS } from "@/features/workwear/types";
import { useAuth } from "@/lib/auth/auth-context";

type WorkwearScreenState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: WorkwearBootstrapData };

type FlashMessage = {
  tone: "success" | "error" | "warning";
  text: string;
} | null;

function hasWriteAccess(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" || normalized === "administrator" || normalized === "kierownik";
}

function normalizeIssueSelection(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function employeeColumns(): Array<DataTableColumn<WorkwearEmployeeRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      render: (row) => row.index,
    },
    {
      key: "employee",
      header: "Pracownik",
      className: "workwear-col-employee",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.employee.name}</span>
          <span className="data-table__secondary">
            {row.employee.worker_code ? `Kod ${row.employee.worker_code}` : "Bez kodu"} •{" "}
            {row.employee.position || "Bez stanowiska"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      className: "workwear-col-status",
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.employee.status === "inactive"
                ? "data-table__status-pill data-table__status-pill--muted"
                : "data-table__status-pill"
            }
          >
            {row.employee.status === "inactive" ? "Historia" : "Aktywny"}
          </span>
          <span className="data-table__secondary">
            {row.issuesCount > 0 ? `${row.issuesCount} wydan` : "Brak wydan"}
          </span>
        </div>
      ),
    },
    {
      key: "issues",
      header: "Wydania",
      className: "workwear-col-issues",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatWorkwearQuantity(row.totalQuantity)} szt.</span>
          <span className="data-table__secondary">
            {row.lastItemName ? `Ostatnio: ${row.lastItemName}` : "Bez historii"}
          </span>
        </div>
      ),
    },
    {
      key: "last_issue",
      header: "Ostatnie wydanie",
      className: "workwear-col-date",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.lastIssueDate ? formatWorkwearDate(row.lastIssueDate) : "Brak"}
          </span>
          <span className="data-table__secondary">
            {row.lastIssueDate ? row.lastIssueDate : "Nie ma wpisow"}
          </span>
        </div>
      ),
    },
  ];
}

function issueColumns(): Array<DataTableColumn<WorkwearIssueRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      render: (row) => row.index,
    },
    {
      key: "issue",
      header: "Data i element",
      className: "workwear-col-issue",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.item_name || "Element spoza katalogu"}
          </span>
          <span className="data-table__secondary">
            {formatWorkwearDate(row.entry.issue.issue_date)}
          </span>
        </div>
      ),
    },
    {
      key: "spec",
      header: "Rozmiar / ilosc",
      className: "workwear-col-spec",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.size || "UNI"} • {formatWorkwearQuantity(row.entry.issue.quantity)} szt.
          </span>
          <span className="data-table__secondary">
            {row.entry.item?.category || "Bez kategorii"}
          </span>
        </div>
      ),
    },
    {
      key: "state",
      header: "Semantyka wpisu",
      className: "workwear-col-state",
      render: (row) => (
        <div className="data-table__stack">
          <span
            className={
              row.entry.resolution === "ambiguous" || row.entry.resolution === "missing_employee"
                ? "data-table__status-pill data-table__status-pill--warning"
                : row.entry.isHistorical
                  ? "data-table__status-pill data-table__status-pill--muted"
                  : "data-table__status-pill"
            }
          >
            {row.entry.resolutionLabel}
          </span>
          <span className="data-table__secondary">{row.entry.issue.notes || "Bez uwag"}</span>
        </div>
      ),
    },
  ];
}

function catalogColumns(): Array<DataTableColumn<WorkwearCatalogRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      render: (row) => row.index,
    },
    {
      key: "item",
      header: "Element",
      className: "workwear-col-item",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.name}</span>
          <span className="data-table__secondary">{row.item.category || "Bez kategorii"}</span>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Wydania",
      className: "workwear-col-issues",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.issuesCount}</span>
          <span className="data-table__secondary">
            {row.activeAssignments} aktywnych pracownikow
          </span>
        </div>
      ),
    },
    {
      key: "notes",
      header: "Standard",
      className: "workwear-col-notes",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.item.notes || "Bez opisu"}</span>
          <span className="data-table__secondary">
            {row.lastIssueDate ? `Ostatnie: ${formatWorkwearDate(row.lastIssueDate)}` : "Brak wydan"}
          </span>
        </div>
      ),
    },
  ];
}

function attentionColumns(): Array<DataTableColumn<WorkwearAttentionRow>> {
  return [
    {
      key: "lp",
      header: "Lp.",
      className: "workwear-col-lp",
      render: (row) => row.index,
    },
    {
      key: "entry",
      header: "Wpis legacy",
      className: "workwear-col-issue",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.entry.issue.employee_name || "Brak pracownika"} • {row.entry.issue.item_name}
          </span>
          <span className="data-table__secondary">
            {formatWorkwearDate(row.entry.issue.issue_date)}
          </span>
        </div>
      ),
    },
    {
      key: "reason",
      header: "Powod",
      className: "workwear-col-notes",
      render: (row) => row.reason,
    },
  ];
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

function printWorkwearCard(employee: EmployeeDirectoryRecord, issueRows: WorkwearIssueRow[]) {
  const popup = window.open("", "_blank", "width=1100,height=900");
  if (!popup) {
    return;
  }

  const rowsHtml = issueRows.length
    ? issueRows
        .map(
          (row) => `
            <tr>
              <td>${formatWorkwearDate(row.entry.issue.issue_date)}</td>
              <td>${row.entry.issue.item_name || "-"}</td>
              <td>${row.entry.issue.size || "-"}</td>
              <td>${formatWorkwearQuantity(row.entry.issue.quantity)}</td>
              <td>${row.entry.issue.notes || "-"}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">Brak wydan dla tego pracownika.</td></tr>`;

  popup.document.write(`<!DOCTYPE html>
<html lang="pl">
<head><meta charset="utf-8"><title>Karta odziezy roboczej</title></head>
<body>${rowsHtml}</body>
</html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 200);
}

export function WorkwearView({
  initialBootstrap,
  initialError,
}: {
  initialBootstrap?: WorkwearBootstrapData;
  initialError?: string;
}) {
  const { user } = useAuth();
  const canWrite = hasWriteAccess(user?.role);

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
    initialBootstrap ? createInitialSelection(initialBootstrap) : null
  );
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
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
    buildWorkwearCatalogFormValues()
  );
  const [message, setMessage] = useState<FlashMessage>(null);
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

  useEffect(() => {
    if (!initialBootstrap) {
      void handleRefresh();
    }
  }, []);

  useEffect(() => {
    if (derived && derived.selectedKey !== selectedEmployeeKey) {
      setSelectedEmployeeKey(derived.selectedKey);
    }
  }, [derived?.selectedKey]);

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
      setIssueForm(
        buildWorkwearIssueFormValues({
          selectedEmployee,
          catalog: bootstrap.catalog,
        })
      );
      setCatalogForm(buildWorkwearCatalogFormValues());
      setMessage({
        tone: "success",
        text: "Dane odziezy roboczej zostaly odswiezone.",
      });
    } catch (error) {
      setScreen({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nie udalo sie odswiezyc modulu odziezy roboczej.",
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
      })
    );
    setMessage(null);
  }

  function handleNewCatalogItem() {
    setEditingCatalogId(null);
    setCatalogForm(buildWorkwearCatalogFormValues());
    setMessage(null);
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
      const nextSelectedKey =
        normalizeIssueSelection(issueForm.employee_key) || createInitialSelection(bootstrap);
      const selectedEmployee = findEmployeeByKey(employees, nextSelectedKey);

      setScreen({ status: "success", data: bootstrap });
      setSelectedEmployeeKey(nextSelectedKey);
      setEditingIssueId(null);
      setIssueForm(
        buildWorkwearIssueFormValues({
          selectedEmployee,
          catalog: bootstrap.catalog,
        })
      );
      setMessage({
        tone: "success",
        text: "Wydanie odziezy zostalo zapisane.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udalo sie zapisac wydania.",
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
      setCatalogForm(buildWorkwearCatalogFormValues());
      setIssueForm((current) =>
        current.item_id
          ? current
          : buildWorkwearIssueFormValues({
              selectedEmployee,
              catalog: bootstrap.catalog,
            })
      );
      setMessage({
        tone: "success",
        text: "Katalog odziezy zostal zapisany.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udalo sie zapisac elementu katalogu.",
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
        })
      );
      setMessage({
        tone: "success",
        text: "Wydanie odziezy zostalo usuniete.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udalo sie usunac wydania.",
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
      }
      setMessage({
        tone: "success",
        text: "Element katalogu zostal usuniety.",
      });
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udalo sie usunac elementu katalogu.",
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
      })
    );
    if (entry.employee) {
      setSelectedEmployeeKey(entry.employee.key);
    }
    if (entry.resolution === "ambiguous" || entry.resolution === "missing_employee") {
      setMessage({
        tone: "warning",
        text: "Wpis legacy nie ma jednoznacznego pracownika. Wskaz go recznie przed zapisem.",
      });
    } else {
      setMessage(null);
    }
  }

  function handleEditCatalogItem(row: WorkwearCatalogRow) {
    setEditingCatalogId(row.item.id);
    setCatalogForm(buildWorkwearCatalogFormValues(row.item));
    setMessage(null);
  }

  if (screen.status === "loading") {
    return (
      <div className="module-page status-stack">
        <SectionHeader
          eyebrow="Kartoteka BHP"
          title="Odziez robocza"
          description="Ladowanie katalogu i historii wydan."
        />
        <p className="status-message">Trwa ladowanie modulu odziezy roboczej...</p>
      </div>
    );
  }

  if (screen.status === "error" || !derived) {
    return (
      <div className="module-page status-stack">
        <SectionHeader
          eyebrow="Kartoteka BHP"
          title="Odziez robocza"
          description="Obszar wydan, katalogu i historii pracownikow."
          actions={
            <ActionButton type="button" variant="secondary" onClick={() => void handleRefresh()}>
              Sprobuj ponownie
            </ActionButton>
          }
        />
        <p className="status-message status-message--error">
          {screen.status === "error"
            ? screen.message
            : "Nie udalo sie zaladowac modulu odziezy roboczej."}
        </p>
      </div>
    );
  }

  const activeRows = derived.activeRows.filter((row) => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [row.employee.name, row.employee.position, row.employee.worker_code, row.lastItemName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const historicalRows = derived.historicalRows.filter((row) => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [row.employee.name, row.employee.position, row.employee.worker_code, row.lastItemName]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const catalogRows = derived.catalogRows.filter((row) => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return [row.item.name, row.item.category, row.item.notes]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const employeeOptions = buildWorkwearEmployeeOptions({
    employees: derived.employees,
    includeEmployeeKey: editingIssueId ? issueForm.employee_key : null,
  });
  const editingHistoricalEmployee =
    issueForm.employee_key &&
    employeeOptions.find((option) => option.key === issueForm.employee_key)?.historical;

  const issueTableColumns = [
    ...issueColumns(),
    {
      key: "actions",
      header: "Akcje",
      className: "workwear-col-actions",
      render: (row: WorkwearIssueRow) => (
        <div className="workwear-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={!canWrite}
            onClick={(event) => {
              event.stopPropagation();
              handleEditIssue(row.entry);
            }}
          >
            Edytuj
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!canWrite}
            onClick={(event) => {
              event.stopPropagation();
              void handleDeleteIssue(row.entry);
            }}
          >
            Usun
          </ActionButton>
        </div>
      ),
    } satisfies DataTableColumn<WorkwearIssueRow>,
  ];

  const catalogTableColumns = [
    ...catalogColumns(),
    {
      key: "actions",
      header: "Akcje",
      className: "workwear-col-actions",
      render: (row: WorkwearCatalogRow) => (
        <div className="workwear-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            disabled={!canWrite}
            onClick={(event) => {
              event.stopPropagation();
              handleEditCatalogItem(row);
            }}
          >
            Edytuj
          </ActionButton>
          <ActionButton
            type="button"
            variant="ghost"
            disabled={!canWrite}
            onClick={(event) => {
              event.stopPropagation();
              void handleDeleteCatalogItem(row);
            }}
          >
            Usun
          </ActionButton>
        </div>
      ),
    } satisfies DataTableColumn<WorkwearCatalogRow>,
  ];

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Kartoteka BHP"
        title="Odziez robocza"
        description="Katalog elementow, wydania pracownicze i historia kart odziezowych."
        actions={
          <div className="planning-header-actions">
            <ActionButton type="button" variant="secondary" onClick={handleNewIssue}>
              Nowe wydanie
            </ActionButton>
            <ActionButton type="button" variant="secondary" onClick={handleNewCatalogItem}>
              Nowy element
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              onClick={() => void handleRefresh()}
              disabled={busyAction === "refresh"}
            >
              {busyAction === "refresh" ? "Odswiezanie..." : "Odswiez"}
            </ActionButton>
          </div>
        }
      />

      <div className="module-page__stats">
        {derived.summaryCards.map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={card.accent} />
        ))}
      </div>

      <div className="workwear-toolbar">
        <SearchField
          value={employeeSearch}
          onChange={(event) => setEmployeeSearch(event.target.value)}
          placeholder="Szukaj pracownika, kodu lub ostatniego wydania"
        />
        <SearchField
          value={catalogSearch}
          onChange={(event) => setCatalogSearch(event.target.value)}
          placeholder="Szukaj elementu lub kategorii"
        />
      </div>

      {message ? (
        <p className={`status-message status-message--${message.tone}`}>{message.text}</p>
      ) : null}

      <div className="workwear-layout">
        <div className="workwear-main-stack">
          <Panel
            title="Aktywni pracownicy"
            description="Glowna pula do nowych wydan. Wiersz pracownika otwiera jego karte."
          >
            <DataTable
              columns={employeeColumns()}
              rows={activeRows}
              rowKey={(row) => row.employee.key}
              onRowClick={(row) => handleSelectEmployee(row.employee)}
              getRowClassName={(row) =>
                row.employee.key === derived.selectedKey ? "data-table__row--active" : undefined
              }
              tableClassName="workwear-table"
              emptyMessage="Brak aktywnych pracownikow dla tego filtra."
            />
          </Panel>

          {historicalRows.length > 0 ? (
            <Panel
              title="Historia pracownikow nieaktywnych"
              description="Nowych wydan juz nie dostana, ale ich karta i historia pozostaja dostepne."
            >
              <div className="workwear-history-list">
                {historicalRows.map((row) => (
                  <button
                    key={row.employee.key}
                    type="button"
                    className={`workwear-history-list__item${
                      row.employee.key === derived.selectedKey ? " is-active" : ""
                    }`}
                    onClick={() => handleSelectEmployee(row.employee)}
                  >
                    <strong>{row.employee.name}</strong>
                    <span>
                      {row.issuesCount} wydan • ostatnio{" "}
                      {row.lastIssueDate ? formatWorkwearDate(row.lastIssueDate) : "brak"}
                    </span>
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}

          <Panel
            title={
              derived.selectedEmployee
                ? `Karta wydan: ${derived.selectedEmployee.name}`
                : "Karta wydan pracownika"
            }
            description={
              derived.selectedEmployee?.status === "inactive"
                ? "Tryb historyczny tylko do odczytu nowych przypisan."
                : "Historia wydan i korekty wpisow dla wybranego pracownika."
            }
          >
            {derived.selectedEmployee ? (
              <div className="workwear-spotlight">
                <div className="workwear-detail-grid">
                  <div className="workwear-detail-card">
                    <small>Status</small>
                    <strong>
                      {derived.selectedEmployee.status === "inactive" ? "Nieaktywny" : "Aktywny"}
                    </strong>
                  </div>
                  <div className="workwear-detail-card">
                    <small>Stanowisko</small>
                    <strong>{derived.selectedEmployee.position || "Bez stanowiska"}</strong>
                  </div>
                  <div className="workwear-detail-card">
                    <small>Liczba wydan</small>
                    <strong>{derived.selectedIssueRows.length}</strong>
                  </div>
                  <div className="workwear-detail-card">
                    <small>Laczna ilosc</small>
                    <strong>
                      {formatWorkwearQuantity(
                        derived.selectedIssueRows.reduce(
                          (sum, row) => sum + Number(row.entry.issue.quantity || 0),
                          0
                        )
                      )}{" "}
                      szt.
                    </strong>
                  </div>
                </div>

                <div className="workwear-card-actions">
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      derived.selectedEmployee &&
                      printWorkwearCard(derived.selectedEmployee, derived.selectedIssueRows)
                    }
                  >
                    Drukuj karte
                  </ActionButton>
                </div>

                <DataTable
                  columns={issueTableColumns}
                  rows={derived.selectedIssueRows}
                  rowKey={(row) => row.entry.issue.id}
                  tableClassName="workwear-table"
                  emptyMessage="Brak wydan dla tego pracownika."
                />
              </div>
            ) : (
              <p className="status-message">Wybierz pracownika z listy, aby zobaczyc jego karte.</p>
            )}
          </Panel>

          {derived.attentionRows.length > 0 ? (
            <Panel
              title="Wpisy wymagajace uwagi"
              description="Historyczne rekordy legacy, ktore nie wskazuja jednoznacznie pracownika."
            >
              <DataTable
                columns={attentionColumns()}
                rows={derived.attentionRows}
                rowKey={(row) => row.entry.issue.id}
                tableClassName="workwear-table"
              />
            </Panel>
          ) : null}

          <Panel
            title="Katalog elementow"
            description="Realny katalog odziezy i wyposazenia, bez sztucznego modelu magazynowego."
          >
            <DataTable
              columns={catalogTableColumns}
              rows={catalogRows}
              rowKey={(row) => row.item.id}
              tableClassName="workwear-table"
              emptyMessage="Katalog odziezy jest pusty."
            />
          </Panel>
        </div>
        <div className="workwear-side-stack">
          <Panel
            title={editingIssueId ? "Edycja wydania" : "Nowe wydanie"}
            description="Nowe wydania sa dostepne tylko dla aktywnych pracownikow."
          >
            <form className="workwear-form" onSubmit={handleIssueSubmit}>
              <FormGrid columns={2}>
                <label className="form-field">
                  <span>Pracownik</span>
                  <select
                    value={issueForm.employee_key}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        employee_key: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  >
                    <option value="">Wybierz pracownika</option>
                    {employeeOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Data wydania</span>
                  <input
                    type="date"
                    value={issueForm.issue_date}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        issue_date: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  />
                </label>
                <label className="form-field">
                  <span>Element</span>
                  <select
                    value={issueForm.item_id}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        item_id: event.target.value,
                      }))
                    }
                    disabled={!canWrite || screen.data.catalog.length === 0}
                  >
                    <option value="">Wybierz element</option>
                    {screen.data.catalog.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} • {item.category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Rozmiar</span>
                  <select
                    value={issueForm.size}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        size: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  >
                    {WORKWEAR_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Ilosc</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={issueForm.quantity}
                    onChange={(event) =>
                      setIssueForm((current) => ({
                        ...current,
                        quantity: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  />
                </label>
              </FormGrid>

              <label className="form-field">
                <span>Uwagi</span>
                <textarea
                  value={issueForm.notes}
                  onChange={(event) =>
                    setIssueForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </label>

              {!canWrite ? (
                <p className="status-message status-message--warning">
                  Twoja rola ma dostep tylko do odczytu tego modulu.
                </p>
              ) : null}
              {derived.selectedEmployee?.status === "inactive" && !editingIssueId ? (
                <p className="status-message status-message--warning">
                  Wybrany pracownik jest nieaktywny. Historia pozostaje widoczna, ale nie dodasz nowego wydania.
                </p>
              ) : null}
              {editingHistoricalEmployee ? (
                <p className="status-message status-message--warning">
                  Edytujesz historyczny wpis pracownika nieaktywnego. Zapis dotyczy korekty historii, nie nowego wydania.
                </p>
              ) : null}
              {screen.data.catalog.length === 0 ? (
                <p className="status-message status-message--warning">
                  Najpierw dodaj element do katalogu odziezy.
                </p>
              ) : null}

              <div className="workwear-form__actions">
                <ActionButton type="button" variant="ghost" onClick={handleNewIssue}>
                  Wyczysc
                </ActionButton>
                <ActionButton
                  type="submit"
                  disabled={!canWrite || busyAction === "save-issue" || screen.data.catalog.length === 0}
                >
                  {busyAction === "save-issue"
                    ? "Zapisywanie..."
                    : editingIssueId
                      ? "Zapisz zmiany"
                      : "Zapisz wydanie"}
                </ActionButton>
              </div>
            </form>
          </Panel>

          <Panel
            title={editingCatalogId ? "Edycja elementu katalogu" : "Nowy element katalogu"}
            description="Katalog jest wspolna baza dla wszystkich wydan i historii pracownikow."
          >
            <form className="workwear-form" onSubmit={handleCatalogSubmit}>
              <FormGrid columns={2}>
                <label className="form-field">
                  <span>Nazwa elementu</span>
                  <input
                    value={catalogForm.name}
                    onChange={(event) =>
                      setCatalogForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  />
                </label>
                <label className="form-field">
                  <span>Kategoria</span>
                  <input
                    value={catalogForm.category}
                    onChange={(event) =>
                      setCatalogForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    disabled={!canWrite}
                  />
                </label>
              </FormGrid>

              <label className="form-field">
                <span>Opis standardu</span>
                <textarea
                  value={catalogForm.notes}
                  onChange={(event) =>
                    setCatalogForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  disabled={!canWrite}
                />
              </label>

              <div className="workwear-form__actions">
                <ActionButton type="button" variant="ghost" onClick={handleNewCatalogItem}>
                  Wyczysc
                </ActionButton>
                <ActionButton
                  type="submit"
                  disabled={!canWrite || busyAction === "save-catalog"}
                >
                  {busyAction === "save-catalog"
                    ? "Zapisywanie..."
                    : editingCatalogId
                      ? "Zapisz zmiany"
                      : "Dodaj do katalogu"}
                </ActionButton>
              </div>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}
