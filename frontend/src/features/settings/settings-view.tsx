"use client";

import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/ui/action-button";
import { AppDrawer } from "@/components/ui/app-drawer";
import { FormFeedback } from "@/components/ui/form-feedback";
import { Panel } from "@/components/ui/panel";
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
  SettingsCurrentAccountPanel,
  SettingsProfilePanels,
} from "@/features/settings/components/SettingsAccountPanels";
import { SettingsAuditPanel } from "@/features/settings/components/SettingsAuditPanel";
import {
  buildPermissionLabels,
  formatRoleLabel,
  formatStatusLabel,
} from "@/features/settings/components/settings-formatters";
import { SettingsUserFormPanel } from "@/features/settings/components/SettingsUserFormPanel";
import { SettingsUsersPanel } from "@/features/settings/components/SettingsUsersPanel";
import { SettingsWorkflowPanel } from "@/features/settings/components/SettingsWorkflowPanel";
import {
  buildSettingsUserFormValues,
  createDefaultWorkflowValues,
  createEmptySettingsUserForm,
  normalizeSettingsPermissions,
  type SettingsAdminBootstrap,
  type SettingsAuditLogEntry,
  type SettingsUserFormValues,
  type SettingsUsersFilter,
  type SettingsWorkflowValues,
} from "@/features/settings/types";
import { useAuth } from "@/lib/auth/auth-context";
import { canManageView, isAdminRole } from "@/lib/auth/permissions";
import { useTheme } from "@/lib/theme/theme-context";
import type { ManagedUserRecord } from "@/lib/api/users";

type AdminState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: SettingsAdminBootstrap };

const EMPTY_MANAGED_USERS: ManagedUserRecord[] = [];
const EMPTY_AUDIT_LOG: SettingsAuditLogEntry[] = [];

export function SettingsView() {
  const router = useRouter();
  const { user, initialized, isLoading, refresh, remindPassword, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [adminState, setAdminState] = useState<AdminState>({ status: "idle" });
  const [isRefreshingAdmin, setIsRefreshingAdmin] = useState(false);
  const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  const [resetTargetUsername, setResetTargetUsername] = useState<string | null>(null);
  const [pageMessage, setPageMessage] = useState<{
    tone: "success" | "error" | "warning";
    text: string;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [filter, setFilter] = useState<SettingsUsersFilter>("all");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isUserDrawerOpen, setIsUserDrawerOpen] = useState(false);
  const [formValues, setFormValues] = useState<SettingsUserFormValues>(() => createEmptySettingsUserForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [formStatus, setFormStatus] = useState<string | null>(null);
  const [workflowValues, setWorkflowValues] = useState<SettingsWorkflowValues>(() => createDefaultWorkflowValues());
  const [workflowStatus, setWorkflowStatus] = useState<string | null>(null);

  const currentUser = user;
  const hasAdminAccess = canManageView(currentUser, "settingsView");
  const adminData = adminState.status === "success" ? adminState.data : null;

  async function reloadAdminData(options?: { preserveState?: boolean; message?: string }) {
    if (!hasAdminAccess) return;

    if (options?.preserveState && adminData) {
      setIsRefreshingAdmin(true);
    } else {
      setAdminState({ status: "loading" });
    }

    try {
      const bootstrap = await fetchSettingsAdminBootstrap();
      setAdminState({ status: "success", data: bootstrap });
      setWorkflowValues(bootstrap.workflow);
      if (options?.message) {
        setPageMessage({ tone: "success", text: options.message });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nie udało się pobrać danych administracyjnych.";
      if (options?.preserveState && adminData) {
        setPageMessage({ tone: "error", text: message });
      } else {
        setAdminState({ status: "error", message });
      }
    } finally {
      setIsRefreshingAdmin(false);
    }
  }

  const loadAdminData = useEffectEvent(() => {
    void reloadAdminData();
  });

  useEffect(() => {
    if (!initialized || !currentUser) return;
    if (!hasAdminAccess) {
      setAdminState({ status: "idle" });
      return;
    }
    loadAdminData();
  }, [currentUser, hasAdminAccess, initialized]);

  const managedUsers = useMemo(() => adminData?.users ?? EMPTY_MANAGED_USERS, [adminData]);
  const currentAuditLog = useMemo(() => adminData?.auditLog ?? EMPTY_AUDIT_LOG, [adminData]);

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
    [editingUserId, managedUsers],
  );

  useEffect(() => {
    if (!isUserDrawerOpen) {
      return;
    }
    setFormValues(buildSettingsUserFormValues(editingUser));
  }, [editingUser, isUserDrawerOpen]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return managedUsers.filter((entry) => {
      if (filter === "active" && entry.status === "inactive") return false;
      if (filter === "inactive" && entry.status !== "inactive") return false;
      if (!query) return true;
      return [
        entry.name,
        entry.username,
        entry.email,
        formatRoleLabel(entry.role),
        formatStatusLabel(entry.status),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [filter, managedUsers, search]);

  const filteredAuditLog = useMemo(() => {
    const query = auditSearch.trim().toLowerCase();
    if (!query) return currentAuditLog;
    return currentAuditLog.filter((entry) =>
      [entry.user_name, entry.module, entry.action, entry.subject, entry.details].some((value) =>
        String(value || "").toLowerCase().includes(query),
      ),
    );
  }, [auditSearch, currentAuditLog]);

  const currentUserPermissions = buildPermissionLabels(currentUser?.permissions);
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
        await reloadAdminData({
          preserveState: true,
          message: "Odświeżono konto, użytkowników, workflow i logi.",
        });
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
        await reloadAdminData({
          preserveState: true,
          message: `Zarejestrowano reset hasła dla ${currentUser.username}.`,
        });
      } else {
        setPageMessage({
          tone: "success",
          text: `Zarejestrowano reset hasła dla ${currentUser.username}.`,
        });
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
      await reloadAdminData({
        preserveState: true,
        message: `Zarejestrowano reset hasła dla konta ${editingUser.username}.`,
      });
      setEditingUserId(editingUser.id);
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Nie udało się wysłać żądania resetu hasła dla wybranego konta.",
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
    setIsUserDrawerOpen(true);
  }

  function handleOpenUserDrawer(userRecord: ManagedUserRecord) {
    setEditingUserId(userRecord.id);
    setFormError(null);
    setFormStatus(null);
    setIsUserDrawerOpen(true);
  }

  function handleRoleChange(nextRole: string) {
    setFormValues((current) => ({
      ...current,
      role: nextRole,
      canApproveVacations: isAdminRole(nextRole) ? true : current.canApproveVacations,
      permissions: normalizeSettingsPermissions(nextRole, current.permissions),
    }));
  }

  function handleSelectManagedUser(selectedUser: ManagedUserRecord) {
    setEditingUserId(selectedUser.id);
    setFormError(null);
    setFormStatus(null);
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
      setIsUserDrawerOpen(false);
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
      setIsUserDrawerOpen(false);
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
        actions={
          <div className="module-actions">
            <div className="module-actions__primary">
              {hasAdminAccess ? (
                <ActionButton type="button" onClick={handleCreateNewUser}>
                  Nowe konto
                </ActionButton>
              ) : (
                <ActionButton
                  type="button"
                  onClick={() => void handleCurrentPasswordReset()}
                  disabled={resetTargetUsername === currentUser.username}
                >
                  {resetTargetUsername === currentUser.username ? "Wysyłanie..." : "Reset hasła"}
                </ActionButton>
              )}
            </div>
            <div className="module-actions__secondary">
              <ActionButton
                type="button"
                variant="secondary"
                disabled={isRefreshingAccount || isRefreshingAdmin}
                onClick={() => void handleRefreshAll()}
              >
                {isRefreshingAccount || isRefreshingAdmin ? "Odświeżanie..." : "Odśwież dane"}
              </ActionButton>
              {hasAdminAccess ? (
                <ActionButton
                  type="button"
                  variant="secondary"
                  disabled={resetTargetUsername === currentUser.username}
                  onClick={() => void handleCurrentPasswordReset()}
                >
                  {resetTargetUsername === currentUser.username ? "Wysyłanie..." : "Reset hasła"}
                </ActionButton>
              ) : null}
              <ActionButton type="button" variant="ghost" disabled={isLoggingOut} onClick={() => void handleLogout()}>
                {isLoggingOut ? "Wylogowywanie..." : "Wyloguj"}
              </ActionButton>
            </div>
          </div>
        }
      />

      <div className="module-page__stats module-page__stats--compact">
        {summaryCards.slice(0, 4).map((card) => (
          <StatCard key={card.id} label={card.label} value={card.value} accent={"accent" in card ? Boolean(card.accent) : false} />
        ))}
      </div>

      <FormFeedback items={[pageMessage ? { tone: pageMessage.tone, text: pageMessage.text } : null]} />

      <div className="settings-layout">
        <div className="settings-main-stack">
          <SettingsProfilePanels
            currentUser={currentUser}
            currentUserPermissions={currentUserPermissions}
            hasAdminAccess={hasAdminAccess}
          />

          {hasAdminAccess ? (
            <>
              <SettingsUsersPanel
                currentUserId={currentUser.id || ""}
                editingUserId={editingUser?.id ?? null}
                filter={filter}
                search={search}
                rows={filteredUsers}
                showTable={Boolean(adminData)}
                onEdit={handleOpenUserDrawer}
                onFilterChange={setFilter}
                onSearchChange={setSearch}
                onSelect={handleSelectManagedUser}
              />

              {adminState.status === "loading" ? (
                <Panel>
                  <div className="status-stack">
                    <p className="status-message">Ładowanie administracji użytkownikami...</p>
                  </div>
                </Panel>
              ) : null}

              {adminState.status === "error" ? (
                <Panel>
                  <div className="status-stack">
                    <p className="status-message status-message--error">{adminState.message}</p>
                    <ActionButton type="button" onClick={() => void reloadAdminData()}>
                      Spróbuj ponownie
                    </ActionButton>
                  </div>
                </Panel>
              ) : null}

              {adminData ? (
                <SettingsAuditPanel
                  rows={filteredAuditLog}
                  search={auditSearch}
                  onSearchChange={setAuditSearch}
                />
              ) : null}
            </>
          ) : (
            <Panel title="Administracja systemu">
              <p className="status-message">Wymaga roli administratora.</p>
            </Panel>
          )}
        </div>

        <div className="settings-side-stack">
          <SettingsCurrentAccountPanel currentUser={currentUser} currentUserPermissions={currentUserPermissions} />

          <Panel
            title="Motyw aplikacji"
            description="Wybierz tryb pracy dla całego systemu. Preferencja zostaje zapamiętana na tym urządzeniu."
          >
            <div className="theme-choice-group" data-testid="theme-choice-group">
              <ActionButton
                type="button"
                variant={theme === "light" ? "primary" : "secondary"}
                onClick={() => setTheme("light")}
              >
                Motyw jasny
              </ActionButton>
              <ActionButton
                type="button"
                variant={theme === "dark" ? "primary" : "secondary"}
                onClick={() => setTheme("dark")}
              >
                Motyw ciemny
              </ActionButton>
            </div>
          </Panel>

          {hasAdminAccess && editingUser ? (
            <Panel title="Wybrane konto">
              <div className="settings-user-spotlight">
                <div className="data-table__stack">
                  <span className="data-table__primary">{editingUser.name}</span>
                  <span className="data-table__secondary">
                    {editingUser.username} | {formatRoleLabel(editingUser.role)}
                  </span>
                </div>
                <div className="settings-detail-grid">
                  <div className="settings-detail-card">
                    <span className="field-card__label">Status</span>
                    <strong>{formatStatusLabel(editingUser.status)}</strong>
                    <small>{editingUser.email || "Brak adresu e-mail"}</small>
                  </div>
                  <div className="settings-detail-card">
                    <span className="field-card__label">Moduły</span>
                    <strong>{buildPermissionLabels(editingUser.permissions).length}</strong>
                    <small>Aktywne uprawnienia</small>
                  </div>
                </div>
                {hasAdminAccess ? (
                  <ActionButton type="button" variant="secondary" onClick={() => handleOpenUserDrawer(editingUser)}>
                    Edytuj konto
                  </ActionButton>
                ) : null}
              </div>
            </Panel>
          ) : null}

          {hasAdminAccess && adminData ? (
            <SettingsWorkflowPanel
              isSavingWorkflow={isSavingWorkflow}
              onSave={handleSaveWorkflow}
              setWorkflowValues={setWorkflowValues}
              workflowStatus={workflowStatus}
              workflowValues={workflowValues}
            />
          ) : null}
        </div>
      </div>

      {hasAdminAccess && isUserDrawerOpen ? (
        <AppDrawer
          eyebrow="Ustawienia"
          title={editingUser ? "Edytuj konto użytkownika" : "Dodaj konto użytkownika"}
          onClose={() => setIsUserDrawerOpen(false)}
          size="wide"
        >
          <SettingsUserFormPanel
            currentUserId={currentUser.id || ""}
            editingUser={editingUser}
            formError={formError}
            formStatus={formStatus}
            formValues={formValues}
            isDeletingUser={isDeletingUser}
            isSubmittingUser={isSubmittingUser}
            onCreateNewUser={handleCreateNewUser}
            onDeleteUser={handleDeleteUser}
            onPasswordReset={handleManagedUserPasswordReset}
            onRoleChange={handleRoleChange}
            onSubmit={handleSaveUser}
            resetTargetUsername={resetTargetUsername}
            setFormValues={setFormValues}
            embedded
          />
        </AppDrawer>
      ) : null}
    </div>
  );
}
