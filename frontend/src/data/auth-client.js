(function initAgentAuthClient(global) {
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

  ROLE_DEFAULT_PERMISSIONS["księgowość"] = {
    ...(ROLE_DEFAULT_PERMISSIONS["ksiÄ™gowoÅ›Ä‡"] || {}),
  };
  ROLE_ALIASES["księgowość"] = "księgowość";
  ROLE_ALIASES.ksiegowosc = "księgowość";
  ROLE_ALIASES["użytkownik"] = "read-only";

  const config = {
    baseUrl: global.__AGENT_API_BASE_URL || "http://127.0.0.1:8787/api/v1",
    timeoutMs: 7000,
  };
  const SESSION_STORAGE_KEY = "agent_backend_session_token";

  const state = global.__AGENT_AUTH_STATE || {
    initialized: false,
    backendAvailable: false,
    currentUser: null,
    users: [],
    sessionToken: "",
  };
  global.__AGENT_AUTH_STATE = state;

  function getSessionStorage() {
    try {
      return global.sessionStorage;
    } catch {
      return null;
    }
  }

  function loadStoredSessionToken() {
    const storage = getSessionStorage();
    if (!storage) return "";
    return String(storage.getItem(SESSION_STORAGE_KEY) || "").trim();
  }

  function storeSessionToken(token) {
    const normalized = String(token || "").trim();
    state.sessionToken = normalized;
    const storage = getSessionStorage();
    if (!storage) return;
    if (normalized) {
      storage.setItem(SESSION_STORAGE_KEY, normalized);
    } else {
      storage.removeItem(SESSION_STORAGE_KEY);
    }
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

  function dispatchChangeEvents() {
    global.dispatchEvent(new CustomEvent("agent-auth-changed", {
      detail: {
        user: clone(state.currentUser),
        backendAvailable: state.backendAvailable,
      },
    }));
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
        state.sessionToken = loadStoredSessionToken();
      }
      const payload = await request("GET", "/auth/me");
      state.currentUser = normalizeUser(payload?.user);
      state.backendAvailable = true;
      state.initialized = true;
      if (options.loadUsers !== false) {
        await loadUsers();
      }
      dispatchChangeEvents();
      return {
        ok: true,
        user: clone(state.currentUser),
      };
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

  global.AgentAuthClient = {
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
})(window);
