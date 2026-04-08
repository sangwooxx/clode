const APP_SHELL_VIEW_KEY = "agentFirmowyActiveView";
const SHELL_CONTRACT_REGISTRY_KEY = "agentInvestmentCatalogV1";
const SHELL_CONTRACT_DELETED_KEY = "agentInvestmentCatalogDeletedV1";
const SETTINGS_STORAGE_KEY = "agentAppSettingsV1";
const AUDIT_LOG_STORAGE_KEY = "agentAuditLogV1";
const NOTIFICATION_STORAGE_KEY = "agentNotificationCenterV1";
const APP_MODULE_VERSION = "20260408-01";

const viewModuleMap = {
  hoursView: [`hours-lite.js?v=${APP_MODULE_VERSION}`],
  employeesView: [`hours-lite.js?v=${APP_MODULE_VERSION}`, `employees.js?v=${APP_MODULE_VERSION}`],
  workwearView: [`hours-lite.js?v=${APP_MODULE_VERSION}`, `employees.js?v=${APP_MODULE_VERSION}`, `workwear.js?v=${APP_MODULE_VERSION}`],
  vacationsView: [`employees.js?v=${APP_MODULE_VERSION}`, `vacations.js?v=${APP_MODULE_VERSION}`],
  planningView: [`employees.js?v=${APP_MODULE_VERSION}`, `vacations.js?v=${APP_MODULE_VERSION}`, `planning.js?v=${APP_MODULE_VERSION}`],
  invoicesView: [`invoices.js?v=${APP_MODULE_VERSION}`],
  settingsView: [`settings.js?v=${APP_MODULE_VERSION}`],
};

const viewRenderHooks = {
  invoicesView: "renderInvoiceModule",
  hoursView: "renderHoursLite",
  employeesView: "renderEmployeesModule",
  workwearView: "renderWorkwearModule",
  vacationsView: "renderVacationsModule",
  planningView: "renderPlanningModule",
  settingsView: "renderSettingsModule",
};

const loadedModuleScripts = new Map();

const registrySorts = {
  contracts: { key: "contract_number", direction: "asc" },
  invoices: { key: "contract_number", direction: "asc" },
};

const shellState = {
  contractSearch: "",
  selectedContractIds: [],
  contractRegistry: [],
  contractRegistryLoaded: false,
  contractRegistryLoading: null,
  editingContractId: "",
};

function shellReadStore(storageKey, fallbackValue) {
  if (window.AgentDataAccess?.legacy) {
    return window.AgentDataAccess.legacy.read(storageKey, fallbackValue);
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? fallbackValue : JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function shellWriteStore(storageKey, value, options = {}) {
  if (window.AgentDataAccess?.legacy) {
    return window.AgentDataAccess.legacy.write(storageKey, value, options);
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
  if (options.eventName) {
    window.dispatchEvent(new CustomEvent(options.eventName));
  }
  return value;
}

function getContractApi() {
  if (!window.AgentContractApi?.create) return null;
  return window.AgentContractApi.create({
    baseUrl: window.__AGENT_API_BASE_URL || "http://127.0.0.1:8787/api/v1",
  });
}

const permissionDefinitions = [
  { viewId: "dashboardView", label: "Dashboard" },
  { viewId: "contractsView", label: "Rejestr kontraktów" },
  { viewId: "hoursView", label: "Ewidencja czasu pracy" },
  { viewId: "invoicesView", label: "Rejestr faktur" },
  { viewId: "employeesView", label: "Kartoteka pracowników" },
  { viewId: "planningView", label: "Planowanie zasobów" },
  { viewId: "workwearView", label: "Odzież robocza" },
  { viewId: "vacationsView", label: "Urlopy i nieobecności" },
  { viewId: "settingsView", label: "Ustawienia systemu" },
];

permissionDefinitions[1].label = "Rejestr kontrakt\u00f3w";
permissionDefinitions[4].label = "Kartoteka pracownik\u00f3w";
permissionDefinitions[5].label = "Planowanie zasob\u00f3w";
permissionDefinitions[6].label = "Odzie\u017c robocza";
permissionDefinitions[7].label = "Urlopy i nieobecno\u015bci";

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, ".");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function splitEmployeeNameParts(value) {
  if (value && typeof value === "object") {
    const firstName = String(value.first_name || value.firstName || "").trim();
    const lastName = String(value.last_name || value.lastName || "").trim();
    const fallbackName = String(value.name || "").trim();
    if (firstName || lastName) {
      const registryName = [lastName, firstName].filter(Boolean).join(" ").trim();
      const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || registryName || fallbackName;
      return {
        firstName,
        lastName,
        registryName: registryName || fallbackName,
        displayName,
        searchText: [registryName, displayName, lastName, firstName].filter(Boolean).join(" ").toLowerCase(),
      };
    }
    value = fallbackName;
  }

  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return {
      firstName: "",
      lastName: "",
      registryName: "",
      displayName: "",
      searchText: "",
    };
  }

  const parts = normalized.split(" ");
  if (parts.length === 1) {
    return {
      firstName: "",
      lastName: parts[0],
      registryName: parts[0],
      displayName: parts[0],
      searchText: parts[0].toLowerCase(),
    };
  }

  const [lastName, ...firstNameParts] = parts;
  const firstName = firstNameParts.join(" ").trim();
  const registryName = [lastName, firstName].filter(Boolean).join(" ").trim();
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || registryName;
  return {
    firstName,
    lastName,
    registryName,
    displayName,
    searchText: [registryName, displayName, lastName, firstName].filter(Boolean).join(" ").toLowerCase(),
  };
}

function composeEmployeeRegistryName(firstName, lastName) {
  return [String(lastName || "").trim(), String(firstName || "").trim()].filter(Boolean).join(" ").trim();
}

function compareEmployeeNames(left, right) {
  const leftParts = splitEmployeeNameParts(left);
  const rightParts = splitEmployeeNameParts(right);

  return (
    leftParts.lastName.localeCompare(rightParts.lastName, "pl", { sensitivity: "base", numeric: true }) ||
    leftParts.firstName.localeCompare(rightParts.firstName, "pl", { sensitivity: "base", numeric: true }) ||
    leftParts.registryName.localeCompare(rightParts.registryName, "pl", { sensitivity: "base", numeric: true })
  );
}

window.EmployeeNameUtils = {
  split: splitEmployeeNameParts,
  compose: composeEmployeeRegistryName,
  compare: compareEmployeeNames,
  display(value) {
    return splitEmployeeNameParts(value).displayName;
  },
  searchText(value) {
    return splitEmployeeNameParts(value).searchText;
  },
};

window.AgentTableUtils = {
  escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },
  nextSort(currentSort, key, columnMap) {
    const defaultDirection = columnMap?.[key]?.defaultDirection || "asc";
    if (currentSort?.key === key) {
      return {
        key,
        direction: currentSort.direction === "asc" ? "desc" : "asc",
      };
    }
    return { key, direction: defaultDirection };
  },
  compareValues(left, right, type, direction) {
    const factor = direction === "desc" ? -1 : 1;

    if (type === "number") {
      return (Number(left || 0) - Number(right || 0)) * factor;
    }

    if (type === "date") {
      const leftTime = left ? new Date(left).getTime() : 0;
      const rightTime = right ? new Date(right).getTime() : 0;
      return (leftTime - rightTime) * factor;
    }

    return String(left ?? "").localeCompare(String(right ?? ""), "pl", {
      sensitivity: "base",
      numeric: true,
    }) * factor;
  },
  sortItems(items, sortState, columnMap) {
    if (!Array.isArray(items)) return [];
    const activeColumn = columnMap?.[sortState?.key];
    if (!activeColumn) return [...items];

    const getValue = activeColumn.getValue || ((item) => item?.[sortState.key]);
    return [...items].sort((left, right) => {
      const result = this.compareValues(
        getValue(left),
        getValue(right),
        activeColumn.type || "string",
        sortState.direction || "asc"
      );
      if (result !== 0) return result;

      const leftFallback = left?.name || left?.employee_name || left?.month_key || "";
      const rightFallback = right?.name || right?.employee_name || right?.month_key || "";
      return String(leftFallback).localeCompare(String(rightFallback), "pl", {
        sensitivity: "base",
        numeric: true,
      });
    });
  },
  renderHeader(label, tableName, key, sortState) {
    const isActive = sortState?.key === key;
    const indicator = isActive ? (sortState.direction === "asc" ? "&uarr;" : "&darr;") : "&harr;";
    const activeClass = isActive ? " is-active" : "";
    return `
      <button class="sort-button${activeClass}" data-sort-table="${tableName}" data-sort-key="${key}" type="button">
        <span>${this.escapeHtml(label)}</span>
        <span class="sort-indicator">${indicator}</span>
      </button>
    `;
  },
};

function getDefaultPermissionMap(isAdministrator = false) {
  return permissionDefinitions.reduce((accumulator, definition) => {
    accumulator[definition.viewId] = isAdministrator ? true : definition.viewId !== "settingsView";
    return accumulator;
  }, {});
}

function legacyNormalizeUserRecord(user, index = 0) {
  const role = String(user?.role || "użytkownik").trim();
  const isAdministrator = role === "administrator";
  return {
    id: String(user?.id || `user-${Date.now()}-${index}`).trim(),
    name: String(user?.name || "").trim(),
    role: isAdministrator ? "administrator" : role,
    status: String(user?.status || "active").trim() === "inactive" ? "inactive" : "active",
    permissions: {
      ...getDefaultPermissionMap(isAdministrator),
      ...(user?.permissions || {}),
    },
    canApproveVacations: isAdministrator ? true : Boolean(user?.canApproveVacations),
  };
}

function normalizeUserRecord(user, index = 0) {
  const role = String(user?.role || "").trim() || "użytkownik";
  const isAdministrator = role === "administrator";
  const name = String(user?.name || "").trim();
  return {
    id: String(user?.id || `user-${Date.now()}-${index}`).trim(),
    name,
    username: normalizeUsername(user?.username || name),
    email: normalizeEmail(user?.email),
    password: String(user?.password || "").trim(),
    role: isAdministrator ? "administrator" : role,
    status: String(user?.status || "active").trim() === "inactive" ? "inactive" : "active",
    permissions: {
      ...getDefaultPermissionMap(isAdministrator),
      ...(user?.permissions || {}),
    },
    canApproveVacations: isAdministrator ? true : Boolean(user?.canApproveVacations),
  };
}

function createDefaultSettingsStore() {
  return {
    workflow: {
      vacationApprovalMode: "permission",
      vacationNotifications: "on",
    },
  };
}

function loadSettingsStore() {
  const authClient = window.AgentAuthClient;
  const currentUser = authClient?.getCurrentUser?.() || null;
  const users = authClient?.getUsers?.() || [];
  const parsed = shellReadStore(SETTINGS_STORAGE_KEY, null);
  if (parsed && typeof parsed === "object") {
    const fallback = createDefaultSettingsStore();
    return {
      current_user_id: currentUser?.id || "",
      workflow: {
        ...fallback.workflow,
        ...(parsed.workflow || {}),
      },
      users,
    };
  }
  return {
    ...createDefaultSettingsStore(),
    current_user_id: currentUser?.id || "",
    users,
  };
}

function loadAuthSession() {
  const currentUser = window.AgentAuthClient?.getCurrentUser?.() || null;
  return {
    user_id: currentUser?.id || "",
    logged_in_at: currentUser?.last_login_at || "",
  };
}

function saveAuthSession(userId = "") {
  if (!userId) {
    window.AgentAuthClient?.logout?.().catch(() => {});
  }
}

function saveSettingsStore(store) {
  const payload = {
    workflow: {
      ...createDefaultSettingsStore().workflow,
      ...(store?.workflow || {}),
    },
  };
  shellWriteStore(SETTINGS_STORAGE_KEY, payload, { eventName: "settings-updated" });
  return payload;
}

function loadAuditLog() {
  const parsed = shellReadStore(AUDIT_LOG_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveAuditLog(entries) {
  shellWriteStore(AUDIT_LOG_STORAGE_KEY, entries, { eventName: "audit-log-updated" });
}

function loadNotifications() {
  const parsed = shellReadStore(NOTIFICATION_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveNotifications(entries) {
  shellWriteStore(NOTIFICATION_STORAGE_KEY, entries, { eventName: "notifications-updated" });
}

function getSettingsUsers() {
  return (window.AgentAuthClient?.getUsers?.() || [])
    .filter((user) => user.status !== "inactive")
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    }));
}

function getAllSettingsUsers() {
  return (window.AgentAuthClient?.getUsers?.() || [])
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    }));
}

function getCurrentUser() {
  return window.AgentAuthClient?.getCurrentUser?.() || null;
}

function setCurrentUser(userId) {
  const currentUser = getCurrentUser();
  if (currentUser?.id === userId) {
    window.dispatchEvent(new CustomEvent("current-user-changed"));
  }
}

function isAuthenticated() {
  return Boolean(window.AgentAuthClient?.isAuthenticated?.());
}

async function authenticateUser(usernameValue, passwordValue) {
  if (!window.AgentAuthClient?.login) {
    return {
      ok: false,
      message: "Moduł logowania nie został załadowany.",
    };
  }
  return window.AgentAuthClient.login(usernameValue, passwordValue);
}

async function requestPasswordReminder(usernameValue) {
  if (!window.AgentAuthClient?.requestPasswordReminder) {
    return {
      ok: false,
      message: "Moduł resetu hasła nie został załadowany.",
    };
  }
  return window.AgentAuthClient.requestPasswordReminder(usernameValue);
}

function canAccessView(viewId) {
  return window.AgentAuthClient?.canAccessView?.(viewId) ?? viewId === "homeView";
}

function canApproveVacationRequests() {
  const settings = loadSettingsStore();
  const currentUser = getCurrentUser();
  if (!currentUser) return false;
  if (currentUser.role === "admin") return true;
  if (settings.workflow.vacationApprovalMode === "admin") return false;
  return Boolean(window.AgentAuthClient?.canApproveVacations?.() ?? currentUser.canApproveVacations);
}

function recordAuditLog(moduleName, actionLabel, subjectLabel, details = "") {
  const currentUser = getCurrentUser();
  const entries = loadAuditLog();
  entries.unshift({
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    module: String(moduleName || "").trim(),
    action: String(actionLabel || "").trim(),
    subject: String(subjectLabel || "").trim(),
    details: String(details || "").trim(),
    user_id: currentUser?.id || "system",
    user_name: currentUser?.name || "System",
  });
  saveAuditLog(entries.slice(0, 1500));
}

function pushNotification(type, title, message, meta = {}) {
  const settings = loadSettingsStore();
  if (type === "vacation" && settings.workflow.vacationNotifications === "off") return;
  const entries = loadNotifications();
  entries.unshift({
    id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    type: String(type || "info"),
    title: String(title || "").trim(),
    message: String(message || "").trim(),
    meta,
    read: false,
  });
  saveNotifications(entries.slice(0, 200));
}

function markNotificationRead(notificationId) {
  const entries = loadNotifications().map((entry) => (
    entry.id === notificationId ? { ...entry, read: true } : entry
  ));
  saveNotifications(entries);
}

function markAllNotificationsRead() {
  const entries = loadNotifications().map((entry) => ({ ...entry, read: true }));
  saveNotifications(entries);
}

function unreadNotificationsCount() {
  return loadNotifications().filter((entry) => !entry.read).length;
}

const contractColumns = {
  contract_number: { type: "string", defaultDirection: "asc" },
  name: { type: "string", defaultDirection: "asc" },
  investor: { type: "string", defaultDirection: "asc" },
  signed_date: { type: "date", defaultDirection: "desc" },
  end_date: { type: "date", defaultDirection: "desc" },
  contract_value: { type: "number", defaultDirection: "desc" },
  status: { type: "string", defaultDirection: "asc" },
};

const invoiceColumns = {
  contract_number: { type: "string", defaultDirection: "asc" },
  name: { type: "string", defaultDirection: "asc" },
  material_cost: { type: "number", defaultDirection: "desc" },
  labor_cost: { type: "number", defaultDirection: "desc" },
  total_cost: { type: "number", defaultDirection: "desc" },
  sales: { type: "number", defaultDirection: "desc" },
  margin: { type: "number", defaultDirection: "desc" },
  invoice_count: { type: "number", defaultDirection: "desc" },
};

function formatContractNumber(value) {
  const numeric = Number(value || 0);
  return numeric > 0 ? String(numeric).padStart(3, "0") : "";
}

function compareContractDates(left, right) {
  const leftTime = left ? new Date(left).getTime() : Number.POSITIVE_INFINITY;
  const rightTime = right ? new Date(right).getTime() : Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return 0;
}

function assignContractNumbers(registry) {
  const sorted = [...registry].sort((left, right) => {
    const dateDelta = compareContractDates(left.signed_date, right.signed_date);
    if (dateDelta !== 0) return dateDelta;
    return String(left.name || "").localeCompare(String(right.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });

  const numberByName = new Map(
    sorted.map((item, index) => [item.name, formatContractNumber(index + 1)])
  );

  return registry.map((item) => ({
    ...item,
    contract_number: numberByName.get(item.name) || item.contract_number || "",
  }));
}

function createContractId() {
  if (window.crypto?.randomUUID) {
    return `contract-${window.crypto.randomUUID()}`;
  }
  return `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRegistryEntry(entry) {
  return {
    id: String(entry?.id || createContractId()).trim(),
    contract_number: formatContractNumber(entry?.contract_number),
    name: String(entry?.name || "").trim(),
    investor: String(entry?.investor || "").trim(),
    signed_date: String(entry?.signed_date || entry?.start_date || "").trim(),
    end_date: String(entry?.end_date || "").trim(),
    contract_value: Number(entry?.contract_value || 0),
    status: String(entry?.status || "active").trim() === "completed" ? "archived" : String(entry?.status || "active").trim() === "archived" ? "archived" : "active",
  };
}

function loadDeletedContractNames() {
  const parsed = shellReadStore(SHELL_CONTRACT_DELETED_KEY, []);
  return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function saveDeletedContractNames(names) {
  const unique = [...new Set((names || []).map((item) => String(item || "").trim()).filter(Boolean))];
  shellWriteStore(SHELL_CONTRACT_DELETED_KEY, unique);
}

function sortContractRegistryItems(registry) {
  return [...registry].sort((left, right) => {
    const statusOrder = (left.status === "archived" ? 1 : 0) - (right.status === "archived" ? 1 : 0);
    if (statusOrder !== 0) return statusOrder;
    const byNumber = String(left.contract_number || "").localeCompare(String(right.contract_number || ""), "pl", {
      numeric: true,
      sensitivity: "base",
    });
    if (byNumber !== 0) return byNumber;
    const byDate = compareContractDates(left.signed_date, right.signed_date);
    if (byDate !== 0) return byDate;
    return String(left.name || "").localeCompare(String(right.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function saveContractRegistry(registry) {
  const normalized = sortContractRegistryItems(
    (Array.isArray(registry) ? registry : [])
      .filter((item) => String(item?.id || "").trim() && String(item?.name || "").trim())
      .map(normalizeRegistryEntry)
      .filter((item) => item.id && item.name)
  );
  shellState.contractRegistry = normalized;
  shellState.contractRegistryLoaded = true;
  window.dispatchEvent(new CustomEvent("contract-registry-updated"));
  if (typeof window.refreshDashboardLocalRegistry === "function") {
    window.refreshDashboardLocalRegistry();
  }
  return normalized;
}

async function loadContractRegistryFromBackend(options = {}) {
  if (!isAuthenticated()) {
    return saveContractRegistry([]);
  }
  if (shellState.contractRegistryLoading && !options.force) {
    return shellState.contractRegistryLoading;
  }

  const api = getContractApi();
  if (!api) {
    return saveContractRegistry([]);
  }

  const promise = api.list({
    includeArchived: options.includeArchived !== false,
  }).then((payload) => {
    const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
    return saveContractRegistry(contracts);
  }).catch((error) => {
    console.warn("Nie udało się pobrać rejestru kontraktów z backendu.", error);
    if (!shellState.contractRegistryLoaded) {
      saveContractRegistry([]);
    }
    return getContractRegistry();
  }).finally(() => {
    shellState.contractRegistryLoading = null;
  });

  shellState.contractRegistryLoading = promise;
  return promise;
}

async function ensureContractRegistryLoaded(options = {}) {
  if (shellState.contractRegistryLoaded && !options.force) {
    return getContractRegistry();
  }
  return loadContractRegistryFromBackend(options);
}

function getContractRegistry() {
  return Array.isArray(shellState.contractRegistry) ? [...shellState.contractRegistry] : [];
}

function getContractById(contractId) {
  const normalizedId = String(contractId || "").trim();
  if (!normalizedId) return null;
  return getContractRegistry().find((item) => item.id === normalizedId) || null;
}

function findUniqueContractByName(name) {
  const normalizedName = String(name || "").trim();
  if (!normalizedName) return null;
  const matches = getContractRegistry().filter((item) => String(item?.name || "").trim() === normalizedName);
  return matches.length === 1 ? matches[0] : null;
}

function resolveContractReference(reference) {
  const normalizedReference = String(reference || "").trim();
  if (!normalizedReference) return null;
  return getContractById(normalizedReference) || findUniqueContractByName(normalizedReference);
}

function getContractByName(name) {
  return findUniqueContractByName(name);
}

function getActiveContractRegistry() {
  return getContractRegistry().filter((item) => item.status !== "archived");
}

function getContractCodeByName(name) {
  return resolveContractReference(name)?.contract_number || "";
}

function getContractReportLabelByName(name) {
  const contract = resolveContractReference(name);
  return contract?.contract_number ? `${contract.contract_number} - ${contract.name}` : String(name || "");
}

function resetContractForm() {
  shellState.editingContractId = "";
  document.getElementById("contractNameInput").value = "";
  document.getElementById("contractInvestorInput").value = "";
  document.getElementById("contractSignedInput").value = "";
  document.getElementById("contractEndInput").value = "";
  document.getElementById("contractValueInput").value = "";
  document.getElementById("contractStatusInput").value = "active";
}

function isContractSelected(contractId) {
  return shellState.selectedContractIds.includes(contractId);
}

function toggleContractSelection(contractId, forceValue) {
  const normalizedId = String(contractId || "").trim();
  if (!normalizedId) return;
  const selected = new Set(shellState.selectedContractIds);
  const nextValue = typeof forceValue === "boolean" ? forceValue : !selected.has(normalizedId);
  if (nextValue) selected.add(normalizedId);
  else selected.delete(normalizedId);
  shellState.selectedContractIds = [...selected];
}

function clearContractSelection() {
  shellState.selectedContractIds = [];
}

async function getContractOperationalUsage(contractId) {
  const normalizedId = String(contractId || "").trim();
  if (!normalizedId) {
    return { hours: 0, invoices: 0, planning: 0 };
  }

  const api = getContractApi();
  if (!api) {
    return { hours: 0, invoices: 0, planning: 0 };
  }

  try {
    const payload = await api.getUsage(normalizedId);
    return {
      hours: Number(payload?.usage?.hours || 0),
      invoices: Number(payload?.usage?.invoices || 0),
      planning: Number(payload?.usage?.planning || 0),
    };
  } catch (error) {
    console.warn("Nie udało się pobrać użycia kontraktu.", error);
    return { hours: 0, invoices: 0, planning: 0 };
  }
}

async function deleteContracts(contractIds) {
  const ids = [...new Set((contractIds || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!ids.length) {
    window.alert("Zaznacz najpierw kontrakty do usunięcia.");
    return;
  }

  const contractsById = new Map(getContractRegistry().map((item) => [item.id, item]));
  const blocked = (await Promise.all(
    ids.map(async (id) => ({ id, contract: contractsById.get(id) || null, usage: await getContractOperationalUsage(id) }))
  )).filter(({ usage }) => usage.hours > 0 || usage.invoices > 0 || usage.planning > 0);

  if (blocked.length) {
    const lines = blocked.map(({ contract, usage }) => {
      const details = [];
      if (usage.hours) details.push(`godziny: ${usage.hours}`);
      if (usage.invoices) details.push(`faktury: ${usage.invoices}`);
      if (usage.planning) details.push(`planowanie: ${usage.planning}`);
      return `- ${contract?.name || contract?.id || "Kontrakt"} (${details.join(", ")})`;
    });
    window.alert(`Nie można usunąć kontraktów z danymi operacyjnymi:\n${lines.join("\n")}`);
    return;
  }

  const names = ids.map((id) => contractsById.get(id)?.name || id);
  const label = ids.length === 1
    ? `Czy na pewno chcesz usunąć kontrakt "${names[0]}"?`
    : `Czy na pewno chcesz usunąć ${ids.length} zaznaczone kontrakty?`;
  if (!window.confirm(label)) return;

  const api = getContractApi();
  if (!api) {
    window.alert("API kontraktów nie jest dostępne.");
    return;
  }

  try {
    if (ids.length === 1) {
      await api.archive(ids[0]);
    } else {
      await api.bulkArchive(ids);
    }

    await loadContractRegistryFromBackend({ includeArchived: true, force: true });
    clearContractSelection();
    resetContractForm();
    recordAuditLog("Kontrakty", "Zarchiwizowano kontrakty", names.join(", "), `Liczba pozycji: ${ids.length}`);
    renderContractRegistry();
    renderInvoiceRegistry();
    if (typeof window.renderInvoiceModule === "function") {
      window.renderInvoiceModule();
    }
  } catch (error) {
    window.alert(error?.message || "Nie udało się zarchiwizować kontraktów.");
  }
}

function loadScriptOnce(src) {
  if (loadedModuleScripts.has(src)) {
    return loadedModuleScripts.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Nie uda\u0142o si\u0119 za\u0142adowa\u0107 modu\u0142u: ${src}`));
    document.body.appendChild(script);
  });

  loadedModuleScripts.set(src, promise);
  return promise;
}

function ensureViewModuleLoaded(viewId) {
  const modules = viewModuleMap[viewId] || [];
  if (!modules.length) {
    return Promise.resolve();
  }

  return modules.reduce((chain, src) => {
    return chain.then(() => loadScriptOnce(src));
  }, Promise.resolve()).catch((error) => {
    console.error(error);
  });
}

function runViewRenderHook(viewId) {
  const renderHookName = viewRenderHooks[viewId];
  if (!renderHookName) return;
  const renderHook = window[renderHookName];
  if (typeof renderHook === "function" && document.getElementById(viewId)?.classList.contains("is-active")) {
    renderHook();
  }
}

function setActiveView(viewId) {
  if (!canAccessView(viewId)) {
    viewId = "homeView";
  }
  document.querySelectorAll(".app-view").forEach((view) => {
    view.classList.toggle("is-active", view.id === viewId);
  });
  document.querySelectorAll(".rail-main-link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
  document.getElementById("railSettingsButton")?.classList.toggle("is-active", viewId === "settingsView");
  shellWriteStore(APP_SHELL_VIEW_KEY, viewId);
  window.dispatchEvent(new CustomEvent("app-view-changed", {
    detail: { viewId },
  }));
  renderRailFooter();
  ensureViewModuleLoaded(viewId).then(() => {
    runViewRenderHook(viewId);
  });
}

function renderRegistryTable(targetId, tableName, sortState) {
  const target = document.getElementById(targetId);
  if (!target) return;

  const registry = window.AgentTableUtils.sortItems(
    getContractRegistry(),
    sortState,
    contractColumns
  ).filter((item) => {
    const query = shellState.contractSearch.trim().toLowerCase();
    if (!query) return true;
    return [
      item.contract_number,
      item.name,
      item.investor,
      item.status === "archived" ? "zarchiwizowana" : "w realizacji",
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });

  if (!registry.length) {
    target.innerHTML = "<p>Na razie brak kontrakt\u00f3w w rejestrze.</p>";
    return;
  }

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th class="control-col">
            <input id="contractSelectAll" type="checkbox" ${registry.length && registry.every((item) => isContractSelected(item.id)) ? "checked" : ""}>
          </th>
          <th>${window.AgentTableUtils.renderHeader("Nr", tableName, "contract_number", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Nazwa kontraktu", tableName, "name", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Zamawiaj\u0105cy / inwestor", tableName, "investor", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Data podpisania", tableName, "signed_date", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Termin zako\u0144czenia", tableName, "end_date", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kwota rycza\u0142towa", tableName, "contract_value", sortState)}</th>
          <th>${window.AgentTableUtils.renderHeader("Status", tableName, "status", sortState)}</th>
          <th class="control-col">Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${registry.map((item) => `
          <tr class="clickable-row" data-contract-id="${window.AgentTableUtils.escapeHtml(item.id || "")}">
            <td class="control-col">
              <input type="checkbox" data-contract-select="${window.AgentTableUtils.escapeHtml(item.id || "")}" ${isContractSelected(item.id) ? "checked" : ""}>
            </td>
            <td>${window.AgentTableUtils.escapeHtml(item.contract_number || "-")}</td>
            <td><strong>${window.AgentTableUtils.escapeHtml(item.name || "-")}</strong></td>
            <td>${window.AgentTableUtils.escapeHtml(item.investor || "-")}</td>
            <td>${window.AgentTableUtils.escapeHtml(item.signed_date || "-")}</td>
            <td>${window.AgentTableUtils.escapeHtml(item.end_date || "-")}</td>
            <td>${item.contract_value ? new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.contract_value) : "-"}</td>
            <td>${window.AgentTableUtils.escapeHtml(item.status === "archived" ? "Zarchiwizowana" : "W realizacji")}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" title="Edytuj kontrakt" data-contract-edit="${window.AgentTableUtils.escapeHtml(item.id || "")}">Edytuj</button>
              <button class="table-action-button danger-button" type="button" title="Usu\u0144 kontrakt" data-contract-delete="${window.AgentTableUtils.escapeHtml(item.id || "")}">Usu\u0144</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderContractRegistry() {
  renderRegistryTable("contractsRegistryTable", "contractsRegistry", registrySorts.contracts);
}

function buildInvoiceRegistryRows() {
  const dashboardInvestments = typeof window.getDashboardInvestments === "function"
    ? window.getDashboardInvestments()
    : [];
  const investmentsMap = new Map(
    dashboardInvestments
      .map((item) => [String(item?.id || "").trim(), item])
      .filter(([id]) => id)
  );
  return getContractRegistry().map((contract) => {
    const investment = investmentsMap.get(String(contract.id || "").trim());
    return {
      ...contract,
      material_cost: Number(investment?.material_cost || 0),
      labor_cost: Number(investment?.labor_cost || 0),
      total_cost: Number(investment?.total_cost || 0),
      sales: Number(investment?.sales || 0),
      margin: Number(investment?.margin || 0),
      invoice_count: Number(investment?.invoice_count || 0),
    };
  });
}

function renderInvoiceRegistry() {
  const target = document.getElementById("invoiceRegistryTable");
  if (!target) return;

  const rows = window.AgentTableUtils.sortItems(
    buildInvoiceRegistryRows(),
    registrySorts.invoices,
    invoiceColumns
  );

  if (!rows.length) {
    target.innerHTML = "<p>Na razie brak kontrakt\u00f3w do zestawienia faktur.</p>";
    return;
  }

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Nr", "invoiceRegistry", "contract_number", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kontrakt", "invoiceRegistry", "name", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Faktury kosztowe", "invoiceRegistry", "material_cost", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "invoiceRegistry", "labor_cost", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("\u0141\u0105czny koszt", "invoiceRegistry", "total_cost", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Sprzeda\u017c", "invoiceRegistry", "sales", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Mar\u017ca", "invoiceRegistry", "margin", registrySorts.invoices)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba faktur", "invoiceRegistry", "invoice_count", registrySorts.invoices)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((item) => `
          <tr>
            <td>${window.AgentTableUtils.escapeHtml(item.contract_number || "-")}</td>
            <td><strong>${window.AgentTableUtils.escapeHtml(item.name || "-")}</strong></td>
            <td>${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.material_cost || 0)}</td>
            <td>${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.labor_cost || 0)}</td>
            <td>${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.total_cost || 0)}</td>
            <td>${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.sales || 0)}</td>
            <td>${new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(item.margin || 0)}</td>
            <td>${window.AgentTableUtils.escapeHtml(String(item.invoice_count || 0))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderRailAccess() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const viewId = button.dataset.view;
    if (!viewId || viewId === "homeView") return;
    button.hidden = !isAuthenticated() || !canAccessView(viewId);
  });

  const settingsButton = document.getElementById("railSettingsButton");
  if (settingsButton) {
    settingsButton.disabled = !isAuthenticated();
  }

  const activeViewId = shellReadStore(APP_SHELL_VIEW_KEY, "homeView") || "homeView";
  if (!canAccessView(activeViewId) && activeViewId !== "homeView") {
    setActiveView("homeView");
  }
}

function renderNotificationsPanel() {
  const badge = document.getElementById("railNotificationsBadge");
  const notifications = loadNotifications();
  const unreadCount = notifications.filter((entry) => !entry.read).length;

  if (badge) {
    badge.hidden = unreadCount <= 0;
    badge.textContent = String(unreadCount);
  }
}

function renderRailFooter() {
  const currentUser = getCurrentUser();
  const nameTarget = document.getElementById("railCurrentUserName");
  const roleTarget = document.getElementById("railCurrentUserRole");

  if (nameTarget) nameTarget.textContent = currentUser?.name || "Niezalogowany";
  if (roleTarget) {
    roleTarget.textContent = currentUser
      ? ({
        admin: "Administrator",
        "księgowość": "Księgowość",
        kierownik: "Kierownik",
        "read-only": "Tylko odczyt",
      }[currentUser.role] || currentUser.role)
      : "Zaloguj się";
  }

  renderNotificationsPanel();
}

function setLoginStatus(message = "", type = "info") {
  const target = document.getElementById("loginStatusMessage");
  if (!target) return;
  target.textContent = message;
  target.dataset.state = type;
}

function bindLoginActions() {
  document.getElementById("loginButton")?.addEventListener("click", async () => {
    const username = document.getElementById("loginUsernameInput")?.value || "";
    const password = document.getElementById("loginPasswordInput")?.value || "";
    const result = await authenticateUser(username, password);
    setLoginStatus(result.message, result.ok ? "success" : "error");
    if (!result.ok) return;
    try {
      await loadContractRegistryFromBackend({ includeArchived: true, force: true });
    } catch {}
    renderRailAccess();
    renderRailFooter();
    renderContractRegistry();
    renderInvoiceRegistry();
    setActiveView("dashboardView");
  });

  document.getElementById("loginPasswordInput")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("loginButton")?.click();
    }
  });

  document.getElementById("forgotPasswordButton")?.addEventListener("click", async () => {
    const username = document.getElementById("loginUsernameInput")?.value || "";
    const result = await requestPasswordReminder(username);
    setLoginStatus(result.message, result.ok ? "info" : "error");
  });
}

async function saveContractFromForm() {
  const name = String(document.getElementById("contractNameInput")?.value || "").trim();
  const investor = String(document.getElementById("contractInvestorInput")?.value || "").trim();
  const signedDate = String(document.getElementById("contractSignedInput")?.value || "").trim();
  const endDate = String(document.getElementById("contractEndInput")?.value || "").trim();
  const contractValue = Number(document.getElementById("contractValueInput")?.value || 0);
  const status = String(document.getElementById("contractStatusInput")?.value || "active").trim() === "completed"
    ? "archived"
    : "active";

  if (!name) {
    window.alert("Podaj nazwę kontraktu.");
    return;
  }

  if (!Number.isFinite(contractValue) || contractValue < 0) {
    window.alert("Kwota kontraktu nie może być ujemna.");
    return;
  }

  if (signedDate && endDate && new Date(endDate).getTime() < new Date(signedDate).getTime()) {
    window.alert("Termin zakończenia nie może być wcześniejszy niż data podpisania umowy.");
    return;
  }

  const api = getContractApi();
  if (!api) {
    window.alert("API kontraktów nie jest dostępne.");
    return;
  }

  const existing = shellState.editingContractId ? getContractById(shellState.editingContractId) : null;
  const payload = {
    name,
    investor,
    signed_date: signedDate,
    end_date: endDate,
    contract_value: contractValue,
    status,
  };

  if (existing?.contract_number) {
    payload.contract_number = existing.contract_number;
  } else {
    payload.contract_number = "";
  }

  try {
    if (existing) {
      await api.update(existing.id, payload);
    } else {
      await api.create(payload);
    }

    await loadContractRegistryFromBackend({ includeArchived: true, force: true });
    recordAuditLog(
      "Kontrakty",
      existing ? "Zaktualizowano kontrakt" : "Dodano kontrakt",
      name,
      investor ? `Inwestor: ${investor}` : ""
    );
    clearContractSelection();
    resetContractForm();
    renderContractRegistry();
    renderInvoiceRegistry();
    if (typeof window.renderInvoiceModule === "function") {
      window.renderInvoiceModule();
    }
  } catch (error) {
    window.alert(error?.message || "Nie udało się zapisać kontraktu.");
  }
}

function fillContractForm(contractId) {
  const contract = getContractById(contractId);
  if (!contract) return;
  shellState.editingContractId = contract.id;
  document.getElementById("contractNameInput").value = contract.name || "";
  document.getElementById("contractInvestorInput").value = contract.investor || "";
  document.getElementById("contractSignedInput").value = contract.signed_date || "";
  document.getElementById("contractEndInput").value = contract.end_date || "";
  document.getElementById("contractValueInput").value = contract.contract_value || "";
  document.getElementById("contractStatusInput").value = contract.status || "active";
}

function bindShellNavigation() {
  document.querySelectorAll(".rail-main-link").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.view));
  });
  document.querySelector(".rail-brand[data-view='homeView']")?.addEventListener("click", () => setActiveView("homeView"));
  document.getElementById("railSettingsButton")?.addEventListener("click", () => setActiveView("settingsView"));
}

function bindRegistrySort(targetId, tableName, sortState) {
  const target = document.getElementById(targetId);
  if (!target) return;

  target.addEventListener("click", (event) => {
    const button = event.target.closest(`button[data-sort-table='${tableName}']`);
    if (!button) return;

    const nextSort = window.AgentTableUtils.nextSort(
      sortState,
      button.dataset.sortKey,
      tableName === "contractsRegistry" ? contractColumns : invoiceColumns
    );
    sortState.key = nextSort.key;
    sortState.direction = nextSort.direction;

    if (tableName === "contractsRegistry") {
      renderContractRegistry();
      return;
    }

    renderInvoiceRegistry();
  });
}

function registerShellGlobals() {
  window.renderInvoiceRegistry = renderInvoiceRegistry;
  window.renderContractRegistry = renderContractRegistry;
  window.getContractRegistry = getContractRegistry;
  window.getContractById = getContractById;
  window.getContractByName = getContractByName;
  window.getActiveContractRegistry = getActiveContractRegistry;
  window.getContractCodeByName = getContractCodeByName;
  window.getContractReportLabelByName = getContractReportLabelByName;
  window.saveContractRegistry = saveContractRegistry;
  window.refreshContractRegistryFromBackend = loadContractRegistryFromBackend;
  window.loadSettingsStore = loadSettingsStore;
  window.saveSettingsStore = saveSettingsStore;
  window.getSettingsUsers = getSettingsUsers;
  window.getAllSettingsUsers = getAllSettingsUsers;
  window.getCurrentUser = getCurrentUser;
  window.setCurrentUser = setCurrentUser;
  window.isAuthenticated = isAuthenticated;
  window.authenticateUser = authenticateUser;
  window.requestPasswordReminder = requestPasswordReminder;
  window.canAccessView = canAccessView;
  window.canApproveVacationRequests = canApproveVacationRequests;
  window.permissionDefinitions = permissionDefinitions;
  window.loadAuditLog = loadAuditLog;
  window.recordAuditLog = recordAuditLog;
  window.loadNotifications = loadNotifications;
  window.pushNotification = pushNotification;
  window.markNotificationRead = markNotificationRead;
  window.markAllNotificationsRead = markAllNotificationsRead;
  window.renderShellFooter = renderRailFooter;
  window.renderRailAccess = renderRailAccess;
  window.isAppViewActive = function isAppViewActive(viewId) {
    return document.getElementById(viewId)?.classList.contains("is-active") || false;
  };
}

async function initShell() {
  registerShellGlobals();
  bindShellNavigation();
  bindLoginActions();
  bindRegistrySort("contractsRegistryTable", "contractsRegistry", registrySorts.contracts);
  bindRegistrySort("invoiceRegistryTable", "invoiceRegistry", registrySorts.invoices);
  document.getElementById("saveContractButton")?.addEventListener("click", saveContractFromForm);
  document.getElementById("newContractButton")?.addEventListener("click", resetContractForm);
  document.getElementById("deleteSelectedContractsButton")?.addEventListener("click", () => {
    deleteContracts(shellState.selectedContractIds);
  });
  document.getElementById("contractSearchInput")?.addEventListener("input", (event) => {
    shellState.contractSearch = String(event.target.value || "");
    renderContractRegistry();
  });
  document.getElementById("contractsRegistryTable")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-contract-select]") || event.target.id === "contractSelectAll") {
      return;
    }
    const deleteButton = event.target.closest("[data-contract-delete]");
    if (deleteButton) {
      event.stopPropagation();
      deleteContracts([deleteButton.dataset.contractDelete]);
      return;
    }
    const editButton = event.target.closest("[data-contract-edit]");
    if (editButton) {
      event.stopPropagation();
      fillContractForm(editButton.dataset.contractEdit);
      return;
    }
    const row = event.target.closest("[data-contract-id]");
    if (!row) return;
    fillContractForm(row.dataset.contractId);
  });
  document.getElementById("contractsRegistryTable")?.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-contract-select]");
    if (checkbox) {
      toggleContractSelection(checkbox.dataset.contractSelect, checkbox.checked);
      renderContractRegistry();
      return;
    }
    if (event.target.id === "contractSelectAll") {
      const visibleNames = getContractRegistry()
        .filter((item) => {
          const query = shellState.contractSearch.trim().toLowerCase();
        if (!query) return true;
        return [
          item.contract_number,
          item.name,
          item.investor,
          item.status === "archived" ? "zarchiwizowana" : "w realizacji",
        ].some((value) => String(value || "").toLowerCase().includes(query));
      })
        .map((item) => item.id);
      visibleNames.forEach((id) => toggleContractSelection(id, event.target.checked));
      renderContractRegistry();
    }
  });

  if (window.AgentAuthClient?.bootstrap) {
    const authResult = await window.AgentAuthClient.bootstrap();
    if (!authResult.ok && authResult.message) {
      setLoginStatus(authResult.message, "error");
    }
  }

  if (isAuthenticated()) {
    await loadContractRegistryFromBackend({ includeArchived: true, force: true });
  } else {
    saveContractRegistry([]);
  }

  renderRailAccess();
  renderRailFooter();
  setActiveView(isAuthenticated() ? (shellReadStore(APP_SHELL_VIEW_KEY, "dashboardView") || "dashboardView") : "homeView");
  renderContractRegistry();
  renderInvoiceRegistry();

  window.addEventListener("storage", () => {
    renderRailAccess();
    renderRailFooter();
    renderContractRegistry();
    renderInvoiceRegistry();
  });
  window.addEventListener("contract-registry-updated", () => {
    renderContractRegistry();
    renderInvoiceRegistry();
  });
  window.addEventListener("dashboard-data-updated", () => {
    renderInvoiceRegistry();
  });
  window.addEventListener("settings-updated", () => {
    renderRailAccess();
    renderRailFooter();
  });
  window.addEventListener("notifications-updated", renderNotificationsPanel);
  window.addEventListener("current-user-changed", () => {
    renderRailAccess();
    renderRailFooter();
    if (!isAuthenticated()) {
      saveContractRegistry([]);
      setActiveView("homeView");
      renderContractRegistry();
      renderInvoiceRegistry();
      return;
    }
    void loadContractRegistryFromBackend({ includeArchived: true, force: true }).then(() => {
      renderContractRegistry();
      renderInvoiceRegistry();
    });
  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    void initShell();
  });
} else {
  void initShell();
}
