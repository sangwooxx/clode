(function initClodeAuthClient(global) {
  const AUTH_VIEW_IDS = [
    "dashboardView",
    "contractsView",
    "hoursView",
    "invoicesView",
    "employeesView",
    "planningView",
    "workwearView",
    "vacationsView",
    "settingsView",
  ];

  const ROLE_DEFAULT_PERMISSIONS = {
    admin: Object.fromEntries(AUTH_VIEW_IDS.map((viewId) => [viewId, true])),
    "księgowość": {
      dashboardView: true,
      contractsView: true,
      hoursView: true,
      invoicesView: true,
      employeesView: false,
      planningView: false,
      workwearView: false,
      vacationsView: false,
      settingsView: false,
    },
    kierownik: {
      dashboardView: true,
      contractsView: true,
      hoursView: true,
      invoicesView: true,
      employeesView: true,
      planningView: true,
      workwearView: true,
      vacationsView: true,
      settingsView: false,
    },
    "read-only": {
      dashboardView: true,
      contractsView: true,
      hoursView: false,
      invoicesView: true,
      employeesView: false,
      planningView: false,
      workwearView: false,
      vacationsView: false,
      settingsView: false,
    },
  };

  const ROLE_ALIASES = {
    administrator: "admin",
    admin: "admin",
    "księgowość": "księgowość",
    ksiegowosc: "księgowość",
    kierownik: "kierownik",
    kadry: "kierownik",
    "użytkownik": "read-only",
    uzytkownik: "read-only",
    "read-only": "read-only",
    readonly: "read-only",
  };

  const config = {
    baseUrl: global.__CLODE_API_BASE_URL || global.__AGENT_API_BASE_URL || "http://127.0.0.1:8787/api/v1",
    timeoutMs: 7000,
  };
  const SESSION_STORAGE_KEY = "clode_backend_session_token";
  const LEGACY_SESSION_STORAGE_KEY = "agent_backend_session_token";
  const LOCAL_SESSION_STORAGE_KEY = "clode_backend_persisted_session_token";
  const LEGACY_LOCAL_SESSION_STORAGE_KEY = "agent_backend_persisted_session_token";
  const AUTH_STATE_STORAGE_KEY = global.ClodeStorageKeys?.authSession || "clodeAuthSessionV1";
  const LEGACY_AUTH_STATE_STORAGE_KEY = global.ClodeLegacyStorageKeys?.authSession || "agentAuthSessionV1";

  const state = global.__CLODE_AUTH_STATE || global.__AGENT_AUTH_STATE || {
    initialized: false,
    backendAvailable: false,
    currentUser: null,
    users: [],
    sessionToken: "",
  };
  global.__CLODE_AUTH_STATE = state;
  global.__AGENT_AUTH_STATE = state;

  function getLocalStorage() {
    try {
      return global.localStorage;
    } catch {
      return null;
    }
  }

  function getSessionStorage() {
    try {
      return global.sessionStorage;
    } catch {
      return null;
    }
  }

  function readStorageToken(storage, primaryKey, legacyKey) {
    if (!storage) return "";
    return String(storage.getItem(primaryKey) || storage.getItem(legacyKey) || "").trim();
  }

  function loadStoredSessionToken() {
    const sessionToken = readStorageToken(getSessionStorage(), SESSION_STORAGE_KEY, LEGACY_SESSION_STORAGE_KEY);
    if (sessionToken) {
      return sessionToken;
    }
    return readStorageToken(getLocalStorage(), LOCAL_SESSION_STORAGE_KEY, LEGACY_LOCAL_SESSION_STORAGE_KEY);
  }

  function storeSessionToken(token) {
    const normalized = String(token || "").trim();
    state.sessionToken = normalized;
    const storages = [
      {
        storage: getSessionStorage(),
        primaryKey: SESSION_STORAGE_KEY,
        legacyKey: LEGACY_SESSION_STORAGE_KEY,
      },
      {
        storage: getLocalStorage(),
        primaryKey: LOCAL_SESSION_STORAGE_KEY,
        legacyKey: LEGACY_LOCAL_SESSION_STORAGE_KEY,
      },
    ];

    storages.forEach(({ storage, primaryKey, legacyKey }) => {
      if (!storage) return;
      if (normalized) {
        storage.setItem(primaryKey, normalized);
        storage.setItem(legacyKey, normalized);
      } else {
        storage.removeItem(primaryKey);
        storage.removeItem(legacyKey);
      }
    });
  }

  function syncSessionTokenFromStorage() {
    const normalized = loadStoredSessionToken();
    if (!normalized) {
      storeSessionToken("");
      return "";
    }
    storeSessionToken(normalized);
    return normalized;
  }

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function normalizeRole(role) {
    const normalized = String(role || "").trim().toLowerCase();
    return ROLE_ALIASES[normalized] || "read-only";
  }

  function defaultPermissions(role) {
    const normalizedRole = normalizeRole(role);
    return clone(ROLE_DEFAULT_PERMISSIONS[normalizedRole] || ROLE_DEFAULT_PERMISSIONS["read-only"]);
  }

  function normalizeUser(user) {
    if (!user || typeof user !== "object") return null;
    const role = normalizeRole(user.role);
    return {
      id: String(user.id || "").trim(),
      name: String(user.displayName || user.name || "").trim(),
      displayName: String(user.displayName || user.name || "").trim(),
      username: String(user.username || "").trim(),
      email: String(user.email || "").trim(),
      role,
      status: String(user.status || (user.is_active === false ? "inactive" : "active")).trim() === "inactive" ? "inactive" : "active",
      is_active: Boolean(user.is_active ?? (user.status !== "inactive")),
      permissions: {
        ...defaultPermissions(role),
        ...(user.permissions || {}),
      },
      canApproveVacations: role === "admin" ? true : Boolean(user.canApproveVacations),
      created_at: String(user.created_at || "").trim(),
      updated_at: String(user.updated_at || "").trim(),
      last_login_at: String(user.last_login_at || "").trim(),
    };
  }

  function readStoredAuthSnapshot() {
    const storage = getLocalStorage();
    if (!storage) {
      return { currentUser: null, users: [] };
    }

    try {
      const raw = storage.getItem(AUTH_STATE_STORAGE_KEY) || storage.getItem(LEGACY_AUTH_STATE_STORAGE_KEY) || "";
      if (!raw) {
        return { currentUser: null, users: [] };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return { currentUser: null, users: [] };
      }
      return {
        currentUser: normalizeUser(parsed.currentUser || parsed.current_user || null),
        users: Array.isArray(parsed.users) ? parsed.users.map(normalizeUser).filter(Boolean) : [],
      };
    } catch {
      return { currentUser: null, users: [] };
    }
  }

  function writeStoredAuthSnapshot() {
    const storage = getLocalStorage();
    if (!storage) return;

    if (!state.currentUser) {
      storage.removeItem(AUTH_STATE_STORAGE_KEY);
      storage.removeItem(LEGACY_AUTH_STATE_STORAGE_KEY);
      return;
    }

    const payload = JSON.stringify({
      currentUser: clone(state.currentUser),
      users: clone(state.users || []),
      savedAt: new Date().toISOString(),
    });
    storage.setItem(AUTH_STATE_STORAGE_KEY, payload);
    storage.setItem(LEGACY_AUTH_STATE_STORAGE_KEY, payload);
  }

  (function hydrateAuthStateFromSnapshot() {
    if (state.currentUser) return;
    const snapshot = readStoredAuthSnapshot();
    if (snapshot.currentUser) {
      state.currentUser = snapshot.currentUser;
    }
    if ((!Array.isArray(state.users) || !state.users.length) && snapshot.users.length) {
      state.users = snapshot.users;
    }
  })();

  function dispatchChangeEvents() {
    writeStoredAuthSnapshot();
    const detail = {
      user: clone(state.currentUser),
      backendAvailable: state.backendAvailable,
    };
    global.dispatchEvent(new CustomEvent("clode-auth-changed", { detail }));
    global.dispatchEvent(new CustomEvent("agent-auth-changed", { detail }));
    global.dispatchEvent(new CustomEvent("current-user-changed"));
    global.dispatchEvent(new CustomEvent("settings-users-updated"));
  }

  async function request(method, path, body) {
    const controller = new AbortController();
    const timer = global.setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const headers = {
        "Content-Type": "application/json",
      };
      const token = state.sessionToken || loadStoredSessionToken();
      if (token) {
        headers["X-Clode-Session"] = token;
        headers["X-Agent-Session"] = token;
      }

      const response = await global.fetch(`${config.baseUrl}${path}`, {
        method,
        credentials: "include",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      let payload = null;
      if (response.status !== 204) {
        payload = await response.json().catch(() => null);
      }

      if (!response.ok) {
        const error = new Error(payload?.error || payload?.message || `API ${method} ${path} failed.`);
        error.status = response.status;
        error.payload = payload;
        throw error;
      }

      return payload;
    } finally {
      global.clearTimeout(timer);
    }
  }

  async function loadUsers() {
    if (!state.currentUser || state.currentUser.role !== "admin") {
      state.users = state.currentUser ? [clone(state.currentUser)] : [];
      return clone(state.users);
    }

    const payload = await request("GET", "/users");
    state.users = Array.isArray(payload?.users) ? payload.users.map(normalizeUser).filter(Boolean) : [];
    return clone(state.users);
  }

  async function refreshSession(options = {}) {
    try {
      if (!state.sessionToken) {
        state.sessionToken = syncSessionTokenFromStorage();
      }
      const payload = await request("GET", "/auth/me");
      state.currentUser = normalizeUser(payload?.user);
      state.backendAvailable = true;
      state.initialized = true;
      if (options.loadUsers !== false) {
        await loadUsers();
      }
      dispatchChangeEvents();
      return { ok: true, user: clone(state.currentUser) };
    } catch (error) {
      state.currentUser = null;
      state.users = [];
      state.backendAvailable = Boolean(error.status);
      state.initialized = true;
      if (error.status === 401) {
        storeSessionToken("");
      }
      dispatchChangeEvents();
      return {
        ok: false,
        message: error.status === 401 ? "" : (error.message || "Backend logowania jest niedostępny."),
      };
    }
  }

  async function login(username, password) {
    try {
      const payload = await request("POST", "/auth/login", { username, password });
      storeSessionToken(payload?.session_token || "");
      state.currentUser = normalizeUser(payload?.user);
      state.backendAvailable = true;
      state.initialized = true;
      await loadUsers();
      dispatchChangeEvents();
      return {
        ok: true,
        user: clone(state.currentUser),
        message: state.currentUser ? `Zalogowano jako ${state.currentUser.name}.` : "Zalogowano.",
      };
    } catch (error) {
      state.backendAvailable = error.status !== undefined;
      return {
        ok: false,
        message: error.message || "Nie udało się zalogować.",
      };
    }
  }

  async function logout() {
    try {
      await request("POST", "/auth/logout", {});
    } catch {
      // Ignore logout transport issues and clear local state anyway.
    }
    storeSessionToken("");
    state.currentUser = null;
    state.users = [];
    state.initialized = true;
    dispatchChangeEvents();
    return { ok: true };
  }

  async function requestPasswordReminder(username) {
    try {
      const payload = await request("POST", "/auth/password-reset-request", { username });
      return {
        ok: true,
        message: payload?.message || "Zarejestrowano prośbę o reset hasła.",
      };
    } catch (error) {
      return {
        ok: false,
        message: error.message || "Nie udało się zarejestrować prośby o reset hasła.",
      };
    }
  }

  async function saveUser(payload) {
    const cleanedPayload = {
      id: String(payload?.id || "").trim(),
      name: String(payload?.name || "").trim(),
      username: String(payload?.username || "").trim(),
      email: String(payload?.email || "").trim(),
      password: String(payload?.password || "").trim(),
      role: normalizeRole(payload?.role),
      status: String(payload?.status || "active").trim() === "inactive" ? "inactive" : "active",
      permissions: clone(payload?.permissions || {}),
      canApproveVacations: Boolean(payload?.canApproveVacations),
    };

    const response = cleanedPayload.id
      ? await request("PUT", `/users/${encodeURIComponent(cleanedPayload.id)}`, cleanedPayload)
      : await request("POST", "/users", cleanedPayload);

    if (state.currentUser && response?.user?.id === state.currentUser.id) {
      await refreshSession();
    } else {
      await loadUsers();
      dispatchChangeEvents();
    }
    return normalizeUser(response?.user);
  }

  async function deleteUser(userId) {
    await request("DELETE", `/users/${encodeURIComponent(userId)}`);
    await loadUsers();
    dispatchChangeEvents();
    return { ok: true };
  }

  global.ClodeAuthClient = {
    bootstrap: refreshSession,
    refreshSession,
    login,
    logout,
    requestPasswordReminder,
    loadUsers,
    saveUser,
    deleteUser,
    getCurrentUser() {
      return clone(state.currentUser);
    },
    getUsers() {
      return clone(state.users);
    },
    isAuthenticated() {
      return Boolean(state.currentUser);
    },
    canAccessView(viewId) {
      if (viewId === "homeView") return true;
      if (!state.currentUser) return false;
      if (state.currentUser.role === "admin") return true;
      return Boolean(state.currentUser.permissions?.[viewId]);
    },
    canApproveVacations() {
      if (!state.currentUser) return false;
      return state.currentUser.role === "admin" || Boolean(state.currentUser.canApproveVacations);
    },
    getState() {
      return clone(state);
    },
  };
  global.AgentAuthClient = global.ClodeAuthClient;
})(window);
