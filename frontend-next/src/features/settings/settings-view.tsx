"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  appendSettingsAuditLog,
  deleteSettingsManagedUser,
  fetchSettingsAdminBootstrap,
  saveSettingsManagedUser,
  saveSettingsWorkflow,
} from "@/features/settings/api";
import {
  buildSettingsUserFormValues,
  createDefaultWorkflowValues,
  createEmptySettingsUserForm,
  isAdminRole,
  normalizeSettingsPermissions,
  settingsPermissionDefinitions,
  type SettingsAdminBootstrap,
  type SettingsAuditLogEntry,
  type SettingsPermissionId,
  type SettingsUserFormValues,
  type SettingsUsersFilter,
  type SettingsWorkflowValues,
} from "@/features/settings/types";
import { useAuth } from "@/lib/auth/auth-context";
import type { ManagedUserRecord } from "@/lib/api/users";

type AdminState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: SettingsAdminBootstrap };

function formatRoleLabel(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin" || normalized === "administrator") return "Administrator";
  if (normalized === "kierownik") return "Kierownik";
  if (normalized === "księgowość" || normalized === "ksiegowosc") return "Księgowość";
  if (normalized === "read-only" || normalized === "readonly") return "Tylko odczyt";
  if (!normalized) return "Użytkownik";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatStatusLabel(status: string | null | undefined) {
  return String(status || "").trim() === "inactive" ? "Nieaktywne" : "Aktywne";
}

function formatTimestamp(value: string | null | undefined) {
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

function buildPermissionLabels(permissions: Record<string, boolean> | null | undefined) {
  return settingsPermissionDefinitions
    .filter((definition) => Boolean(permissions?.[definition.viewId]))
    .map((definition) => definition.label);
}

function buildUsersTableColumns(args: {
  currentUserId: string;
  onEdit: (user: ManagedUserRecord) => void;
}): Array<DataTableColumn<ManagedUserRecord>> {
  return [
    { key: "lp", header: "Lp.", className: "settings-col-lp", render: (_row, index) => index + 1 },
    {
      key: "user",
      header: "Konto",
      className: "settings-col-user",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.name}</span>
          <span className="data-table__secondary">
            {row.username}
            {row.email ? ` • ${row.email}` : ""}
          </span>
        </div>
      ),
    },
    {
      key: "access",
      header: "Dostęp",
      className: "settings-col-access",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatRoleLabel(row.role)}</span>
          <span className="data-table__secondary">
            <span
              className={
                row.status === "inactive"
                  ? "data-table__status-pill data-table__status-pill--muted"
                  : "data-table__status-pill"
              }
            >
              {formatStatusLabel(row.status)}
            </span>
            {row.canApproveVacations ? " • Akceptuje urlopy" : ""}
          </span>
        </div>
      ),
    },
    {
      key: "modules",
      header: "Uprawnienia",
      className: "settings-col-modules",
      render: (row) => {
        const labels = buildPermissionLabels(row.permissions);
        return (
          <div className="data-table__stack">
            <span className="data-table__primary">{labels.length} modułów</span>
            <span className="data-table__secondary">
              {labels.length ? labels.join(", ") : "Brak dostępu do modułów"}
            </span>
          </div>
        );
      },
    },
    {
      key: "activity",
      header: "Aktywność",
      className: "settings-col-activity",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">
            {row.last_login_at ? formatTimestamp(row.last_login_at) : "Brak logowania"}
          </span>
          <span className="data-table__secondary">Utworzono: {formatTimestamp(row.created_at)}</span>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Akcje",
      className: "settings-col-actions",
      render: (row) => (
        <div className="planning-row-actions">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              args.onEdit(row);
            }}
          >
            Edytuj
          </ActionButton>
          {row.id === args.currentUserId ? <span className="data-table__secondary">Bieżące konto</span> : null}
        </div>
      ),
    },
  ];
}

function buildAuditTableColumns(): Array<DataTableColumn<SettingsAuditLogEntry>> {
  return [
    {
      key: "timestamp",
      header: "Data i użytkownik",
      className: "settings-col-audit-date",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{formatTimestamp(row.timestamp)}</span>
          <span className="data-table__secondary">{row.user_name || "System"}</span>
        </div>
      ),
    },
    {
      key: "change",
      header: "Zmiana",
      className: "settings-col-audit-change",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.action || "-"}</span>
          <span className="data-table__secondary">{row.module || "-"}</span>
        </div>
      ),
    },
    {
      key: "subject",
      header: "Obiekt",
      className: "settings-col-audit-subject",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.subject || "-"}</span>
          <span className="data-table__secondary">{row.user_id || "-"}</span>
        </div>
      ),
    },
    {
      key: "details",
      header: "Szczegóły",
      className: "settings-col-audit-details",
      render: (row) => (
        <div className="data-table__stack">
          <span className="data-table__primary">{row.details || "Brak dodatkowych szczegółów"}</span>
        </div>
      ),
    },
  ];
}

export function SettingsView() {
  const router = useRouter();
  const { user, initialized, isLoading, refresh, remindPassword, logout } = useAuth();
  const [adminState, setAdminState] = useState<AdminState>({ status: "idle" });
  const [isRefreshingAdmin, setIsRefreshingAdmin] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [resetTargetUsername, setResetTargetUsername] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<{ tone: "success" | "error" | "warning"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [filter, setFilter] = useState<SettingsUsersFilter>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<SettingsUserFormValues>(() => createEmptySettingsUserForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [workflowValues, setWorkflowValues] = useState<SettingsWorkflowValues>(() => createDefaultWorkflowValues());
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);

  const currentUser = user;
  const hasAdminAccess = isAdminRole(currentUser?.role);
  const adminData = adminState.status === "success" ? adminState.data : null;

  async function reloadAdminData(options?: { preserveState?: boolean; message?: string }) {
    if (!hasAdminAccess) return;

    if (options?.preserveState && adminData) setIsRefreshingAdmin(true);
    else setAdminState({ status: "loading" });

    try {
      const bootstrap = await fetchSettingsAdminBootstrap();
      setAdminState({ status: "success", data: bootstrap });
      setWorkflowValues(bootstrap.workflow);
      if (options?.message) {
        setPageMessage({ tone: "success", text: options.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Nie udało się pobrać danych administracyjnych.";
      if (options?.preserveState && adminData) setPageMessage({ tone: "error", text: message });
      else setAdminState({ status: "error", message });
    } finally {
      setIsRefreshingAdmin(false);
    }
  }

  useEffect(() => {
    if (!initialized || !currentUser) return;
    if (!hasAdminAccess) {
      setAdminState({ status: "idle" });
      return;
    }
    void reloadAdminData();
  }, [currentUser?.id, currentUser?.role, hasAdminAccess, initialized]);

  const managedUsers = adminData?.users ?? [];
  const currentAuditLog = adminData?.auditLog ?? [];

  useEffect(() => {
    if (!adminData) {
      setEditingUserId(null);
      return;
    }
    if (editingUserId && adminData.users.some((entry) => entry.id === editingUserId)) {
      return;
    }
    const preferredUser =
      adminData.users.find((entry) => entry.id === currentUser?.id) ?? adminData.users[0] ?? null;
    setEditingUserId(preferredUser?.id ?? null);
  }, [adminData, currentUser?.id, editingUserId]);

  const editingUser = useMemo(
    () => managedUsers.find((entry) => entry.id === editingUserId) ?? null,
    [editingUserId, managedUsers]
  );

  useEffect(() => {
    setFormValues(buildSettingsUserFormValues(editingUser));
  }, [editingUser]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return managedUsers.filter((entry) => {
      if (filter === "active" && entry.status === "inactive") return false;
      if (filter === "inactive" && entry.status !== "inactive") return false;
      if (!query) return true;
      return [entry.name, entry.username, entry.email, formatRoleLabel(entry.role), formatStatusLabel(entry.status)].some((value) =>
        String(value || "").toLowerCase().includes(query)
      );
    });
  }, [filter, managedUsers, search]);

  const filteredAuditLog = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return currentAuditLog;
    return currentAuditLog.filter((entry) =>
      [entry.user_name, entry.module, entry.action, entry.subject, entry.details].some((value) =>
        String(value || "").toLowerCase().includes(query)
      )
    );
  }, [auditSearch, currentAuditLog]);

  const currentUserPermissions = buildPermissionLabels(currentUser?.permissions);
  const editingUserPermissions = buildPermissionLabels(editingUser?.permissions);
  const activeUsersCount = managedUsers.filter((entry) => entry.status !== "inactive").length;
  const summaryCards = hasAdminAccess
    ? [
        { id: "user", label: "Użytkownik", value: currentUser?.displayName || "Brak sesji" },
        { id: "role", label: "Rola", value: formatRoleLabel(currentUser?.role), accent: true },
        { id: "users", label: "Konta aktywne", value: `${activeUsersCount} / ${managedUsers.length}` },
        { id: "logs", label: "Wpisy logów", value: String(currentAuditLog.length) },
      ]
    : [
        { id: "user", label: "Użytkownik", value: currentUser?.displayName || "Brak sesji" },
        { id: "role", label: "Rola", value: formatRoleLabel(currentUser?.role), accent: true },
        { id: "modules", label: "Moduły", value: String(currentUserPermissions.length) },
        { id: "session", label: "Sesja", value: "Aktywna" },
      ];

  async function handleRefreshAll() {
    setIsRefreshingAccount(true);
    setPageMessage(null);
    try {
      await refresh();
      if (hasAdminAccess) {
        await reloadAdminData({ preserveState: true, message: "Odświeżono konto, użytkowników, workflow i logi." });
      } else {
        setPageMessage({ tone: "success", text: "Odświeżono dane bieżącej sesji użytkownika." });
      }
    } catch (error) {
      setPageMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się odświeżyć danych konta.",
      });
    } finally {
      setIsRefreshingAccount(false);
    }
  }

  async function handleCurrentPasswordReset() {
    if (!currentUser) return;
    setResetTargetUsername(currentUser.username);
    setPageMessage(null);
    try {
      await remindPassword(currentUser.username);
      if (hasAdminAccess && adminData) {
        await appendSettingsAuditLog({
          actor: currentUser,
          currentEntries: adminData.auditLog,
          action: "Wysłano reset hasła",
          subject: currentUser.displayName,
          details: `Login: ${currentUser.username}`,
        });
        await reloadAdminData({ preserveState: true, message: `Zarejestrowano reset hasła dla ${currentUser.username}.` });
      } else {
        setPageMessage({ tone: "success", text: `Zarejestrowano reset hasła dla ${currentUser.username}.` });
      }
    } catch (error) {
      setPageMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Nie udało się wysłać żądania resetu hasła.",
      });
    } finally {
      setResetTargetUsername(null);
    }
  }

  async function handleManagedUserPasswordReset() {
    if (!currentUser || !editingUser || !adminData) return;
    setResetTargetUsername(editingUser.username);
    setFormError(null);
    setFormStatus(null);
    try {
      await remindPassword(editingUser.username);
      await appendSettingsAuditLog({
        actor: currentUser,
        currentEntries: adminData.auditLog,
        action: "Wysłano reset hasła",
        subject: editingUser.name,
        details: `Login: ${editingUser.username}`,
      });
      await reloadAdminData({ preserveState: true, message: `Zarejestrowano reset hasła dla konta ${editingUser.username}.` });
      setEditingUserId(editingUser.id);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Nie udało się wysłać żądania resetu hasła dla wybranego konta."
      );
    } finally {
      setResetTargetUsername(null);
    }
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsLoggingOut(false);
    }
  }

  function handleCreateNewUser() {
    setEditingUserId(null);
    setFormValues(createEmptySettingsUserForm());
    setFormError(null);
    setFormStatus(null);
  }

  function handleRoleChange(nextRole: string) {
    setFormValues((current) => ({
      ...current,
      role: nextRole,
      canApproveVacations: isAdminRole(nextRole) ? true : current.canApproveVacations,
      permissions: normalizeSettingsPermissions(nextRole, current.permissions),
    }));
  }

  async function handleSaveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser || !hasAdminAccess || !adminData) return;

    setIsSubmittingUser(true);
    setFormError(null);
    setFormStatus(null);
    try {
      const savedUser = await saveSettingsManagedUser({
        actor: currentUser,
        existingUser: editingUser,
        values: formValues,
        currentAuditLog: adminData.auditLog,
      });
      await reloadAdminData({
        preserveState: true,
        message: editingUser ? "Zapisano zmiany konta użytkownika." : "Dodano nowe konto użytkownika.",
      });
      setEditingUserId(savedUser.id);
      setFormStatus(editingUser ? "Dane konta zostały zaktualizowane." : "Konto użytkownika zostało utworzone.");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się zapisać konta użytkownika.");
    } finally {
      setIsSubmittingUser(false);
    }
  }

  async function handleDeleteUser() {
    if (!currentUser || !editingUser || !adminData) return;
    if (editingUser.id === currentUser.id) {
      setFormError("Nie możesz usunąć własnego konta z poziomu aktywnej sesji.");
      return;
    }

    const confirmed = window.confirm(`Czy na pewno chcesz usunąć konto ${editingUser.name}?`);
    if (!confirmed) return;

    setIsDeletingUser(true);
    setFormError(null);
    setFormStatus(null);
    try {
      await deleteSettingsManagedUser({
        actor: currentUser,
        user: editingUser,
        currentAuditLog: adminData.auditLog,
      });
      setEditingUserId(null);
      setFormValues(createEmptySettingsUserForm());
      await reloadAdminData({ preserveState: true, message: `Usunięto konto ${editingUser.name}.` });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nie udało się usunąć konta użytkownika.");
    } finally {
      setIsDeletingUser(false);
    }
  }

  async function handleSaveWorkflow() {
    if (!currentUser || !hasAdminAccess || !adminData) return;
    setIsSavingWorkflow(true);
    setWorkflowStatus(null);
    try {
      const savedWorkflow = await saveSettingsWorkflow({
        actor: currentUser,
        values: workflowValues,
        currentAuditLog: adminData.auditLog,
      });
      setWorkflowValues(savedWorkflow);
      await reloadAdminData({
        preserveState: true,
        message: "Zapisano reguły obiegu urlopów i powiadomień.",
      });
      setWorkflowStatus("Workflow został zaktualizowany.");
    } catch (error) {
      setWorkflowStatus(error instanceof Error ? error.message : "Nie udało się zapisać ustawień workflow.");
    } finally {
      setIsSavingWorkflow(false);
    }
  }

  if (!initialized || isLoading) {
    return <div className="screen-state">Ładowanie ustawień konta...</div>;
  }

  if (!currentUser) {
    return <div className="screen-state">Brak aktywnej sesji użytkownika.</div>;
  }

  return (
    <div className="module-page">
      <SectionHeader
        eyebrow="Konto użytkownika"
        title="Konto i ustawienia"
        description="To jest obszar konta dostępny przez klik w użytkownika w sidebarze. Dla administratora łączy profil, zarządzanie kontami, workflow urlopów i rejestr zmian."
        actions={
          <>
            <ActionButton
              type="button"
              variant="secondary"
              disabled={isRefreshingAccount || isRefreshingAdmin}
              onClick={() => void handleRefreshAll()}
            >
              {isRefreshingAccount || isRefreshingAdmin ? "Odświeżanie..." : "Odśwież dane"}
            </ActionButton>
            {hasAdminAccess ? (
              <ActionButton type="button" variant="secondary" onClick={handleCreateNewUser}>
                Nowe konto
              </ActionButton>
            ) : null}
            <ActionButton
              type="button"
              variant="secondary"
              disabled={resetTargetUsername === currentUser.username}
              onClick={() => void handleCurrentPasswordReset()}
            >
              {resetTargetUsername === currentUser.username ? "Wysyłanie..." : "Reset hasła"}
            </ActionButton>
            <ActionButton type="button" variant="ghost" disabled={isLoggingOut} onClick={() => void handleLogout()}>
              {isLoggingOut ? "Wylogowywanie..." : "Wyloguj"}
            </ActionButton>
          </>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={"accent" in card ? Boolean(card.accent) : false} />
        ))}
      </div>

      {pageMessage ? <p className={`status-message status-message--${pageMessage.tone}`}>{pageMessage.text}</p> : null}

      <div className="settings-layout">
        <div className="settings-main-stack">
          <Panel
            title="Profil i sesja"
            description="Bieżące konto jest hydratowane z auth runtime, więc nie tworzy równoległej logiki obok logowania i sesji."
          >
            <dl>
              <div className="info-list__row"><dt>Nazwa wyświetlana</dt><dd>{currentUser.displayName}</dd></div>
              <div className="info-list__row"><dt>Login</dt><dd>{currentUser.username}</dd></div>
              <div className="info-list__row"><dt>Rola</dt><dd>{formatRoleLabel(currentUser.role)}</dd></div>
              <div className="info-list__row"><dt>Status</dt><dd>{formatStatusLabel(currentUser.status)}</dd></div>
              <div className="info-list__row"><dt>Adres e-mail</dt><dd>{currentUser.email || "Brak danych"}</dd></div>
              <div className="info-list__row"><dt>Ostatnie logowanie</dt><dd>{formatTimestamp(currentUser.lastLoginAt)}</dd></div>
              <div className="info-list__row"><dt>Wejście do ustawień</dt><dd>Wyłącznie przez kafelek konta w sidebarze</dd></div>
            </dl>
          </Panel>

          <Panel
            title={hasAdminAccess ? "Dostęp bieżącego konta" : "Dostęp w aplikacji"}
            description={
              hasAdminAccess
                ? "Ten panel pokazuje realne uprawnienia zalogowanego administratora oraz to, że ustawienia pozostają częścią konta, a nie osobnym modułem menu."
                : "Twoje konto korzysta z tych samych uprawnień, które shell i auth runtime stosują w całej aplikacji."
            }
          >
            <div className="settings-module-pills">
              {currentUserPermissions.length ? currentUserPermissions.map((label) => (
                <span key={label} className="employees-relation-pill">{label}</span>
              )) : <p className="status-message">Brak aktywnych modułów dla tego konta.</p>}
            </div>
          </Panel>

          {hasAdminAccess ? (
            <>
              <Panel className="panel--toolbar panel--toolbar--filters">
                <div className="settings-toolbar">
                  <div className="toolbar-tabs">
                    <ActionButton type="button" variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>Wszystkie</ActionButton>
                    <ActionButton type="button" variant={filter === "active" ? "primary" : "secondary"} onClick={() => setFilter("active")}>Aktywne</ActionButton>
                    <ActionButton type="button" variant={filter === "inactive" ? "primary" : "secondary"} onClick={() => setFilter("inactive")}>Nieaktywne</ActionButton>
                  </div>
                  <SearchField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Szukaj po nazwie, loginie, e-mailu lub roli" />
                </div>
              </Panel>

              {adminState.status === "loading" ? (
                <Panel><div className="status-stack"><p className="status-message">Ładowanie administracji użytkownikami...</p></div></Panel>
              ) : null}

              {adminState.status === "error" ? (
                <Panel>
                  <div className="status-stack">
                    <p className="status-message status-message--error">{adminState.message}</p>
                    <ActionButton type="button" onClick={() => void reloadAdminData()}>Spróbuj ponownie</ActionButton>
                  </div>
                </Panel>
              ) : null}

              {adminData ? (
                <>
                  <Panel
                    title="Konta użytkowników"
                    description="To jest produktowy następca starego settings.js: realne konta, role, status, uprawnienia modułowe i akceptacja urlopów."
                  >
                    <DataTable
                      columns={buildUsersTableColumns({
                        currentUserId: currentUser.id || "",
                        onEdit: (selectedUser) => {
                          setEditingUserId(selectedUser.id);
                          setFormError(null);
                          setFormStatus(null);
                        },
                      })}
                      rows={filteredUsers}
                      rowKey={(row) => row.id}
                      emptyMessage="Brak kont użytkowników dla bieżącego filtra."
                      onRowClick={(row) => {
                        setEditingUserId(row.id);
                        setFormError(null);
                        setFormStatus(null);
                      }}
                      getRowClassName={(row) => (row.id === editingUser?.id ? "data-table__row--active" : undefined)}
                      tableClassName="settings-table"
                    />
                  </Panel>

                  <Panel
                    title="Rejestr zmian"
                    description="Log operacyjny ustawień pokazuje realne zmiany kont, workflow i akcje resetu hasła wykonane z tego ekranu."
                  >
                    <div className="settings-audit-toolbar">
                      <SearchField value={auditSearch} onChange={(event) => setAuditSearch(event.target.value)} placeholder="Szukaj po użytkowniku, module, akcji lub obiekcie" />
                    </div>
                    <DataTable
                      columns={buildAuditTableColumns()}
                      rows={filteredAuditLog}
                      rowKey={(row) => row.id}
                      emptyMessage="Rejestr zmian jest pusty."
                      tableClassName="settings-table settings-table--audit"
                    />
                  </Panel>
                </>
              ) : null}
            </>
          ) : (
            <Panel
              title="Administracja systemu"
              description="Zarządzanie użytkownikami, workflow urlopów i logami jest dostępne tylko dla administratora. To konto zachowuje jedynie własny profil i operacje sesji."
            >
              <p className="status-message">
                Jeśli potrzebujesz dodać konto albo zmienić uprawnienia, zaloguj się jako administrator i użyj tego samego ekranu konta.
              </p>
            </Panel>
          )}
        </div>

        <div className="settings-side-stack">
          <Panel title="Konto bieżące" description="To konto korzysta ze wspólnej sesji auth dla całego shella.">
            <div className="settings-detail-grid">
              <div className="settings-detail-card"><span className="field-card__label">Login</span><strong>{currentUser.username}</strong><small>{currentUser.email || "Brak e-maila"}</small></div>
              <div className="settings-detail-card"><span className="field-card__label">Rola</span><strong>{formatRoleLabel(currentUser.role)}</strong><small>{formatStatusLabel(currentUser.status)}</small></div>
              <div className="settings-detail-card"><span className="field-card__label">Uprawnienia</span><strong>{currentUserPermissions.length}</strong><small>aktywnych modułów</small></div>
              <div className="settings-detail-card"><span className="field-card__label">Sesja</span><strong>Aktywna</strong><small>{formatTimestamp(currentUser.lastLoginAt)}</small></div>
            </div>
          </Panel>

          {hasAdminAccess && adminData ? (
            <>
              <Panel
                title={editingUser ? `Edycja konta: ${editingUser.name}` : "Nowe konto użytkownika"}
                description="Administrator może tutaj tworzyć konta, nadawać role, ustawiać status i precyzyjne uprawnienia modułowe."
              >
                {editingUser ? (
                  <div className="settings-user-spotlight">
                    <div className="data-table__stack">
                      <span className="data-table__primary">{editingUser.name}</span>
                      <span className="data-table__secondary">{editingUser.username} • {formatRoleLabel(editingUser.role)}</span>
                    </div>
                    <div className="settings-module-pills">
                      {editingUserPermissions.length ? editingUserPermissions.map((label) => (
                        <span key={label} className="employees-relation-pill employees-relation-pill--muted">{label}</span>
                      )) : <p className="status-message">To konto nie ma aktywnych modułów.</p>}
                    </div>
                  </div>
                ) : (
                  <p className="status-message">Dodaj nowe konto użytkownika albo wybierz konto z tabeli po lewej stronie.</p>
                )}

                <form className="settings-user-form" onSubmit={handleSaveUser}>
                  <FormGrid columns={2}>
                    <label className="form-field"><span>Imię i nazwisko</span><input value={formValues.name} onChange={(event) => setFormValues((current) => ({ ...current, name: event.target.value }))} placeholder="Jan Kowalski" /></label>
                    <label className="form-field"><span>Login</span><input value={formValues.username} onChange={(event) => setFormValues((current) => ({ ...current, username: event.target.value }))} placeholder="jan.kowalski" /></label>
                    <label className="form-field"><span>Adres e-mail</span><input value={formValues.email} onChange={(event) => setFormValues((current) => ({ ...current, email: event.target.value }))} placeholder="jan.kowalski@clode.pl" /></label>
                    <label className="form-field"><span>{editingUser ? "Nowe hasło (opcjonalnie)" : "Hasło startowe"}</span><input type="password" value={formValues.password} onChange={(event) => setFormValues((current) => ({ ...current, password: event.target.value }))} placeholder={editingUser ? "Pozostaw puste bez zmiany" : "Minimum startowe"} /></label>
                    <label className="form-field"><span>Rola</span><select value={formValues.role} onChange={(event) => handleRoleChange(event.target.value)}><option value="admin">Administrator</option><option value="kierownik">Kierownik</option><option value="księgowość">Księgowość</option><option value="read-only">Tylko odczyt</option></select></label>
                    <label className="form-field"><span>Status konta</span><select value={formValues.status} onChange={(event) => setFormValues((current) => ({ ...current, status: event.target.value === "inactive" ? "inactive" : "active" }))}><option value="active">Aktywne</option><option value="inactive">Nieaktywne</option></select></label>
                    <label className="settings-toggle-card">
                      <input type="checkbox" checked={formValues.canApproveVacations} disabled={isAdminRole(formValues.role)} onChange={(event) => setFormValues((current) => ({ ...current, canApproveVacations: event.target.checked }))} />
                      <div><strong>Akceptacja urlopów</strong><small>{isAdminRole(formValues.role) ? "Administrator akceptuje urlopy zawsze." : "Włącz, jeśli konto ma zatwierdzać wnioski urlopowe."}</small></div>
                    </label>
                  </FormGrid>

                  <div className="settings-permissions">
                    <div className="panel__heading">
                      <h3 className="panel__title">Uprawnienia modułowe</h3>
                      <p className="panel__description">Administrator może tu zarządzać dostępem do operacyjnych modułów aplikacji.</p>
                    </div>
                    <div className="settings-permissions-grid">
                      {settingsPermissionDefinitions.map((definition) => {
                        const locked = isAdminRole(formValues.role) || definition.viewId === "settingsView";
                        return (
                          <label key={definition.viewId} className={["settings-permission-card", locked ? "settings-permission-card--locked" : ""].join(" ")}>
                            <input
                              type="checkbox"
                              checked={Boolean(formValues.permissions[definition.viewId])}
                              disabled={locked}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  permissions: {
                                    ...current.permissions,
                                    [definition.viewId]: definition.viewId === "settingsView" ? false : event.target.checked,
                                  },
                                }))
                              }
                            />
                            <div><strong>{definition.label}</strong><small>{definition.viewId}</small></div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {formError ? <p className="status-message status-message--error">{formError}</p> : null}
                  {formStatus ? <p className="status-message status-message--success">{formStatus}</p> : null}

                  <div className="settings-form-actions">
                    {editingUser ? (
                      <>
                        <ActionButton type="button" variant="ghost" disabled={isDeletingUser || editingUser.id === currentUser.id} onClick={() => void handleDeleteUser()}>{isDeletingUser ? "Usuwanie..." : "Usuń konto"}</ActionButton>
                        <ActionButton type="button" variant="secondary" disabled={resetTargetUsername === editingUser.username} onClick={() => void handleManagedUserPasswordReset()}>{resetTargetUsername === editingUser.username ? "Wysyłanie..." : "Reset hasła użytkownika"}</ActionButton>
                      </>
                    ) : null}
                    <ActionButton type="submit" disabled={isSubmittingUser}>{isSubmittingUser ? "Zapisywanie..." : editingUser ? "Zapisz zmiany" : "Dodaj konto"}</ActionButton>
                  </div>
                </form>
              </Panel>

              <Panel
                title="Workflow urlopów"
                description="To jest odświeżona wersja reguł z legacy settings: kto akceptuje urlopy i czy system pokazuje powiadomienia."
              >
                <FormGrid columns={1}>
                  <label className="form-field"><span>Tryb akceptacji urlopów</span><select value={workflowValues.vacationApprovalMode} onChange={(event) => setWorkflowValues((current) => ({ ...current, vacationApprovalMode: event.target.value === "admin" ? "admin" : "permission" }))}><option value="permission">Według uprawnień użytkowników</option><option value="admin">Tylko administrator</option></select></label>
                  <label className="form-field"><span>Powiadomienia urlopowe</span><select value={workflowValues.vacationNotifications} onChange={(event) => setWorkflowValues((current) => ({ ...current, vacationNotifications: event.target.value === "off" ? "off" : "on" }))}><option value="on">Włączone</option><option value="off">Wyłączone</option></select></label>
                </FormGrid>
                {workflowStatus ? <p className={`status-message ${workflowStatus.includes("Nie udało") ? "status-message--error" : "status-message--success"}`}>{workflowStatus}</p> : null}
                <div className="settings-form-actions">
                  <ActionButton type="button" disabled={isSavingWorkflow} onClick={() => void handleSaveWorkflow()}>{isSavingWorkflow ? "Zapisywanie..." : "Zapisz workflow"}</ActionButton>
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
