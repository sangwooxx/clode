const settingsViewState = window.__clodeSettingsViewState || {
  initialized: false,
  editingUserId: "",
  userSearch: "",
  auditSearch: "",
  userSort: null,
};

window.__clodeSettingsViewState = settingsViewState;

const SETTINGS_USERS_TABLE_SORT_KEY = "clodeSettingsUsersTableSortV1";

function settingsReadStore(storageKey, fallbackValue) {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return fallbackValue;
    return JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function settingsWriteStore(storageKey, value) {
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function settingsDefaultUserSort() {
  return { key: "name", direction: "asc" };
}

function settingsLoadUserSort() {
  const parsed = settingsReadStore(SETTINGS_USERS_TABLE_SORT_KEY, null);
  if (!parsed) return settingsDefaultUserSort();
  const key = String(parsed.key || "");
  const direction = String(parsed.direction || "");
  if (!key) return settingsDefaultUserSort();
  if (direction !== "asc" && direction !== "desc") return settingsDefaultUserSort();
  return { key, direction };
}

function settingsSaveUserSort() {
  settingsWriteStore(SETTINGS_USERS_TABLE_SORT_KEY, settingsViewState.userSort || settingsDefaultUserSort());
}

function settingsUsersColumnMap() {
  return {
    name: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.name || "") },
    username: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.username || "") },
    email: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.email || "") },
    role: { type: "string", defaultDirection: "asc", getValue: (row) => String(settingsRoleLabel(row.role) || "") },
    status: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.status || "") },
    canApproveVacations: { type: "string", defaultDirection: "asc", getValue: (row) => (row.canApproveVacations ? "tak" : "nie") },
    moduleCount: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.moduleCount || 0) },
  };
}

function settingsRenderHeader(label, key, sortState) {
  if (!window.ClodeTableUtils?.renderHeader) return settingsEscape(label);
  return window.ClodeTableUtils.renderHeader(label, "settingsUsers", key, sortState);
}

function settingsEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function settingsText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function settingsNormalizeUsername(value, fallback = "") {
  return settingsText(value || fallback).toLowerCase().replace(/\s+/g, ".");
}

function settingsRoleLabel(role) {
  return {
    admin: "Administrator",
    kierownik: "Kierownik",
    "księgowość": "Księgowość",
    "read-only": "Tylko odczyt",
  }[role] || "Tylko odczyt";
}

function getSettingsPermissionDefinitions() {
  return Array.isArray(window.permissionDefinitions) ? window.permissionDefinitions : [];
}

function loadSettingsUsers() {
  return typeof window.getAllSettingsUsers === "function" ? window.getAllSettingsUsers() : [];
}

function loadSettingsStoreSafe() {
  return typeof window.loadSettingsStore === "function" ? window.loadSettingsStore() : null;
}

function saveSettingsStoreSafe(store) {
  if (typeof window.saveSettingsStore === "function") {
    return window.saveSettingsStore(store);
  }
  return store;
}

function getSettingsCurrentUser() {
  return typeof window.getCurrentUser === "function" ? window.getCurrentUser() : null;
}

function defaultUserPermissions() {
  return getSettingsPermissionDefinitions().reduce((accumulator, definition) => {
    accumulator[definition.viewId] = definition.viewId !== "settingsView";
    return accumulator;
  }, {});
}

function resetSettingsUserForm() {
  settingsViewState.editingUserId = "";
  document.getElementById("settingsUserFormHeading").textContent = "Nowe konto użytkownika";
  document.getElementById("saveUserButton").textContent = "Zapisz konto";
  document.getElementById("settingsUserNameInput").value = "";
  document.getElementById("settingsUserUsernameInput").value = "";
  document.getElementById("settingsUserEmailInput").value = "";
  document.getElementById("settingsUserPasswordInput").value = "";
  document.getElementById("settingsUserRoleInput").value = "read-only";
  document.getElementById("settingsUserStatusInput").value = "active";
  document.getElementById("settingsUserVacationApprovalInput").value = "no";
  renderSettingsPermissionGrid({
    role: "read-only",
    permissions: defaultUserPermissions(),
  });
}

function getUserFromFormPermissions(roleValue) {
  const isAdministrator = roleValue === "admin";
  return getSettingsPermissionDefinitions().reduce((accumulator, definition) => {
    const checkbox = document.querySelector(`[data-settings-permission='${definition.viewId}']`);
    accumulator[definition.viewId] = isAdministrator ? true : Boolean(checkbox?.checked);
    return accumulator;
  }, {});
}

function renderSettingsPermissionGrid(user = null) {
  const target = document.getElementById("settingsPermissionGrid");
  if (!target) return;

  const roleValue = String(user?.role || document.getElementById("settingsUserRoleInput")?.value || "read-only");
  const isAdministrator = roleValue === "admin";
  const permissions = user?.permissions || {};

  target.innerHTML = getSettingsPermissionDefinitions().map((definition) => `
    <label class="permission-card">
      <input
        type="checkbox"
        data-settings-permission="${settingsEscape(definition.viewId)}"
        ${isAdministrator || permissions?.[definition.viewId] ? "checked" : ""}
        ${isAdministrator ? "disabled" : ""}>
      <div>
        <strong>${settingsEscape(definition.label)}</strong>
        <small>${settingsEscape(definition.viewId)}</small>
      </div>
    </label>
  `).join("");
}

function fillSettingsUserForm(userId) {
  const user = loadSettingsUsers().find((item) => item.id === userId);
  if (!user) {
    resetSettingsUserForm();
    return;
  }

  settingsViewState.editingUserId = user.id;
  document.getElementById("settingsUserFormHeading").textContent = `Edycja konta: ${user.name}`;
  document.getElementById("saveUserButton").textContent = "Zapisz zmiany";
  document.getElementById("settingsUserNameInput").value = user.name || "";
  document.getElementById("settingsUserUsernameInput").value = user.username || "";
  document.getElementById("settingsUserEmailInput").value = user.email || "";
  document.getElementById("settingsUserPasswordInput").value = "";
  document.getElementById("settingsUserRoleInput").value = user.role || "read-only";
  document.getElementById("settingsUserStatusInput").value = user.status || "active";
  document.getElementById("settingsUserVacationApprovalInput").value = user.canApproveVacations ? "yes" : "no";
  renderSettingsPermissionGrid(user);
}

function renderSettingsCurrentUserCard() {
  const target = document.getElementById("settingsCurrentUserCard");
  if (!target) return;

  const currentUser = getSettingsCurrentUser();
  if (!currentUser) {
    target.innerHTML = "<p>Brak aktywnego konta.</p>";
    return;
  }

  const permissions = Object.entries(currentUser.permissions || {})
    .filter(([, allowed]) => allowed)
    .map(([viewId]) => getSettingsPermissionDefinitions().find((definition) => definition.viewId === viewId)?.label || viewId);

  target.innerHTML = `
    <div><span>Użytkownik</span><strong>${settingsEscape(currentUser.name)}</strong></div>
    <div><span>Login</span><strong>${settingsEscape(currentUser.username || "-")}</strong></div>
    <div><span>Rola</span><strong>${settingsEscape(settingsRoleLabel(currentUser.role))}</strong></div>
    <div><span>Status</span><strong>${settingsEscape(currentUser.status === "inactive" ? "Nieaktywne" : "Aktywne")}</strong></div>
    <div><span>E-mail</span><strong>${settingsEscape(currentUser.email || "-")}</strong></div>
    <div><span>Akceptacja urlopów</span><strong>${settingsEscape(currentUser.canApproveVacations ? "Tak" : "Nie")}</strong></div>
    <div class="settings-meta-wide"><span>Dostępne moduły</span><strong>${settingsEscape(permissions.join(", ") || "Brak")}</strong></div>
  `;
}

function renderSettingsUsersTable() {
  const target = document.getElementById("settingsUsersTable");
  if (!target) return;

  const query = settingsViewState.userSearch.toLowerCase();
  const rows = loadSettingsUsers().filter((user) => {
    if (!query) return true;
    return [
      user.name,
      user.username,
      user.email,
      settingsRoleLabel(user.role),
      user.status === "inactive" ? "nieaktywne" : "aktywne",
    ].some((value) => String(value || "").toLowerCase().includes(query));
  }).map((user) => ({
    ...user,
    moduleCount: Object.values(user.permissions || {}).filter(Boolean).length,
  }));

  if (!rows.length) {
    target.innerHTML = "<p>Brak użytkowników dla podanego filtra.</p>";
    return;
  }

  const sortState = settingsViewState.userSort || settingsDefaultUserSort();
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, settingsUsersColumnMap())
    : rows;

  target.innerHTML = `
    <table class="data-table invoice-module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${settingsRenderHeader("Użytkownik", "name", sortState)}</th>
          <th>${settingsRenderHeader("Login", "username", sortState)}</th>
          <th>${settingsRenderHeader("E-mail", "email", sortState)}</th>
          <th>${settingsRenderHeader("Rola", "role", sortState)}</th>
          <th>${settingsRenderHeader("Status", "status", sortState)}</th>
          <th>${settingsRenderHeader("Akceptuje urlopy", "canApproveVacations", sortState)}</th>
          <th class="text-right">${settingsRenderHeader("Liczba modułów", "moduleCount", sortState)}</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((user, index) => {
          // Render akcje 1:1 jak w Rejestrze faktur (ten sam układ i klasy).
          const actions = `
               <button class="table-action-button" type="button" title="Edytuj konto" data-settings-user-edit="${settingsEscape(user.id)}">Edytuj</button>
               <button class="table-action-button danger-button" type="button" title="Usuń konto" data-settings-user-delete="${settingsEscape(user.id)}">Usuń</button>
             `;
          return `
            <tr class="clickable-row${user.id === settingsViewState.editingUserId ? " is-selected" : ""}" data-settings-user="${settingsEscape(user.id)}">
              <td>${index + 1}</td>
              <td>${settingsEscape(user.name)}</td>
              <td>${settingsEscape(user.username || "-")}</td>
              <td>${settingsEscape(user.email || "-")}</td>
              <td>${settingsEscape(settingsRoleLabel(user.role))}</td>
              <td>${settingsEscape(user.status === "inactive" ? "Nieaktywne" : "Aktywne")}</td>
              <td>${settingsEscape(user.canApproveVacations ? "Tak" : "Nie")}</td>
              <td class="text-right">${settingsEscape(String(user.moduleCount))}</td>
              <td class="action-cell">${actions}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderWorkflowSettings() {
  const store = loadSettingsStoreSafe();
  if (!store) return;
  document.getElementById("settingsVacationApprovalModeInput").value = store.workflow?.vacationApprovalMode || "permission";
  document.getElementById("settingsVacationNotificationInput").value = store.workflow?.vacationNotifications || "on";
}

function renderAuditTable() {
  const target = document.getElementById("settingsAuditTable");
  if (!target || typeof window.loadAuditLog !== "function") return;

  const query = settingsViewState.auditSearch.toLowerCase();
  const rows = window.loadAuditLog().filter((entry) => {
    if (!query) return true;
    return [
      entry.user_name,
      entry.module,
      entry.action,
      entry.subject,
      entry.details,
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  if (!rows.length) {
    target.innerHTML = "<p>Rejestr zmian jest pusty.</p>";
    return;
  }

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Data</th>
          <th>Użytkownik</th>
          <th>Moduł</th>
          <th>Akcja</th>
          <th>Obiekt</th>
          <th>Szczegóły</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((entry) => `
          <tr>
            <td>${settingsEscape(new Date(entry.timestamp).toLocaleString("pl-PL"))}</td>
            <td>${settingsEscape(entry.user_name || "-")}</td>
            <td>${settingsEscape(entry.module || "-")}</td>
            <td>${settingsEscape(entry.action || "-")}</td>
            <td>${settingsEscape(entry.subject || "-")}</td>
            <td>${settingsEscape(entry.details || "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderSettingsModule() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("settingsView")) return;
  renderSettingsCurrentUserCard();
  renderSettingsUsersTable();
  renderWorkflowSettings();
  renderAuditTable();
  if (settingsViewState.editingUserId) fillSettingsUserForm(settingsViewState.editingUserId);
  else resetSettingsUserForm();
}

async function saveSettingsUser() {
  const store = loadSettingsStoreSafe();
  if (!store) return;

  const name = settingsText(document.getElementById("settingsUserNameInput").value);
  if (!name) {
    window.alert("Podaj imię i nazwisko użytkownika.");
    return;
  }

  const username = settingsNormalizeUsername(document.getElementById("settingsUserUsernameInput").value, name);
  const email = settingsText(document.getElementById("settingsUserEmailInput").value || "").toLowerCase();
  const password = settingsText(document.getElementById("settingsUserPasswordInput").value || "");
  if (!username) {
    window.alert("Podaj login użytkownika.");
    return;
  }

  const role = String(document.getElementById("settingsUserRoleInput").value || "read-only");
  const status = String(document.getElementById("settingsUserStatusInput").value || "active");
  const canApproveVacations = String(document.getElementById("settingsUserVacationApprovalInput").value || "no") === "yes";
  const existing = store.users.find((user) => user.id === settingsViewState.editingUserId);
  const duplicate = store.users.find((user) => user.name.toLowerCase() === name.toLowerCase() && user.id !== settingsViewState.editingUserId);
  if (duplicate) {
    window.alert("Użytkownik o tej nazwie już istnieje.");
    return;
  }
  const duplicateUsername = store.users.find((user) => settingsNormalizeUsername(user.username || user.name) === username && user.id !== settingsViewState.editingUserId);
  if (duplicateUsername) {
    window.alert("Taki login jest już przypisany do innego konta.");
    return;
  }

  const payload = {
    id: existing?.id || "",
    name,
    username,
    email,
    password,
    role,
    status,
    permissions: getUserFromFormPermissions(role),
    canApproveVacations: role === "admin" ? true : canApproveVacations,
  };

  try {
    let savedUser = null;
    if (window.ClodeAuthClient?.saveUser) {
      savedUser = await window.ClodeAuthClient.saveUser(payload);
    } else {
      savedUser = payload;
    }
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog(
        "Administracja",
        existing ? "Zaktualizowano konto" : "Dodano konto",
        name,
        `Login: ${username}`
      );
    }
    settingsViewState.editingUserId = savedUser?.id || payload.id;
    renderSettingsModule();
  } catch (error) {
    window.alert(error?.message || "Nie udało się zapisać konta.");
  }
}

async function deleteSettingsUser(userIdArg = "") {
  const userId = String(userIdArg || settingsViewState.editingUserId || "").trim();
  if (!userId) return;

  const store = loadSettingsStoreSafe();
  if (!store) return;
  const user = store.users.find((item) => item.id === userId);
  if (!user) return;

  if (!window.confirm(`Czy na pewno chcesz usunąć konto ${user.name}?`)) return;

  try {
    if (window.ClodeAuthClient?.deleteUser) {
      await window.ClodeAuthClient.deleteUser(userId);
    }
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog("Administracja", "Usunięto konto", user.name, `Login: ${user.username || "-"}`);
    }
    settingsViewState.editingUserId = "";
    renderSettingsModule();
  } catch (error) {
    window.alert(error?.message || "Nie udało się usunąć konta.");
  }
}

function saveWorkflowSettings() {
  const store = loadSettingsStoreSafe();
  if (!store) return;
  store.workflow = {
    vacationApprovalMode: String(document.getElementById("settingsVacationApprovalModeInput").value || "permission"),
    vacationNotifications: String(document.getElementById("settingsVacationNotificationInput").value || "on"),
  };
  saveSettingsStoreSafe(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Administracja", "Zaktualizowano reguły obiegu", "Ustawienia workflow", "");
  }
  renderSettingsModule();
}

function initSettingsView() {
  if (settingsViewState.initialized || !document.getElementById("settingsView")) return;

  document.getElementById("newUserButton")?.addEventListener("click", resetSettingsUserForm);
  document.getElementById("saveUserButton")?.addEventListener("click", () => {
    void saveSettingsUser();
  });
  document.getElementById("deleteUserButton")?.addEventListener("click", () => {
    void deleteSettingsUser();
  });
  document.getElementById("settingsUserRoleInput")?.addEventListener("change", () => {
    const currentRole = document.getElementById("settingsUserRoleInput").value;
    renderSettingsPermissionGrid({
      role: currentRole,
      permissions: getUserFromFormPermissions(currentRole),
    });
  });
  document.getElementById("settingsUserSearchInput")?.addEventListener("input", (event) => {
    settingsViewState.userSearch = String(event.target.value || "");
    renderSettingsUsersTable();
  });
  document.getElementById("settingsAuditSearchInput")?.addEventListener("input", (event) => {
    settingsViewState.auditSearch = String(event.target.value || "");
    renderAuditTable();
  });
  document.getElementById("saveWorkflowSettingsButton")?.addEventListener("click", saveWorkflowSettings);
  document.getElementById("settingsUsersTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='settingsUsers']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      settingsViewState.userSort = window.ClodeTableUtils.nextSort(
        settingsViewState.userSort || settingsDefaultUserSort(),
        sortButton.dataset.sortKey,
        settingsUsersColumnMap()
      );
      settingsSaveUserSort();
      renderSettingsUsersTable();
      return;
    }

    const editButton = event.target.closest("[data-settings-user-edit]");
    if (editButton) {
      fillSettingsUserForm(editButton.dataset.settingsUserEdit);
      renderSettingsUsersTable();
      return;
    }
    const deleteButton = event.target.closest("[data-settings-user-delete]");
    if (deleteButton) {
      void deleteSettingsUser(deleteButton.dataset.settingsUserDelete);
      return;
    }
    const row = event.target.closest("[data-settings-user]");
    if (!row) return;
    fillSettingsUserForm(row.dataset.settingsUser);
    renderSettingsUsersTable();
  });

  window.addEventListener("settings-updated", renderSettingsModule);
  window.addEventListener("settings-users-updated", renderSettingsModule);
  window.addEventListener("audit-log-updated", renderAuditTable);
  window.addEventListener("current-user-changed", renderSettingsModule);
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "settingsView") renderSettingsModule();
  });

  settingsViewState.initialized = true;
  if (!settingsViewState.userSort) {
    settingsViewState.userSort = settingsLoadUserSort();
  }
  renderSettingsModule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettingsView);
} else {
  initSettingsView();
}

