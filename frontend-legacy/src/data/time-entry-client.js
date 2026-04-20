(function initClodeTimeEntryApi(global) {
  const SESSION_STORAGE_KEY = "clode_backend_session_token";
  const LEGACY_SESSION_STORAGE_KEY = "agent_backend_session_token";
  const LOCAL_SESSION_STORAGE_KEY = "clode_backend_persisted_session_token";
  const LEGACY_LOCAL_SESSION_STORAGE_KEY = "agent_backend_persisted_session_token";

  function resolveApiBaseUrl() {
    return global.__CLODE_API_BASE_URL || global.__AGENT_API_BASE_URL || (global.location?.origin ? `${global.location.origin}/api/v1` : "/api/v1");
  }

  function createTimeEntryApi(options) {
    const config = {
      baseUrl: options?.baseUrl || resolveApiBaseUrl(),
      timeoutMs: Number(options?.timeoutMs || 20000),
      retryCount: Number(options?.retryCount || 1),
    };

    function getSessionToken() {
      try {
        const sessionToken = String(
          global.sessionStorage?.getItem(SESSION_STORAGE_KEY)
          || global.sessionStorage?.getItem(LEGACY_SESSION_STORAGE_KEY)
          || ""
        ).trim();
        if (sessionToken) return sessionToken;
        return String(
          global.localStorage?.getItem(LOCAL_SESSION_STORAGE_KEY)
          || global.localStorage?.getItem(LEGACY_LOCAL_SESSION_STORAGE_KEY)
          || ""
        ).trim();
      } catch {
        return "";
      }
    }

    async function request(method, path, body) {
      let lastError = null;
      for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
        const controller = new AbortController();
        const timer = global.setTimeout(() => controller.abort(), config.timeoutMs);
        try {
          const headers = { "Content-Type": "application/json" };
          const token = getSessionToken();
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
            const error = new Error(payload?.error || `API ${method} ${path} failed with status ${response.status}`);
            error.status = response.status;
            error.payload = payload;
            throw error;
          }
          return payload;
        } catch (error) {
          lastError = error;
          const isAbort = error?.name === "AbortError";
          const isNetwork = error instanceof TypeError;
          const shouldRetry = attempt < config.retryCount && (isAbort || isNetwork);
          if (!shouldRetry) {
            throw error;
          }
        } finally {
          global.clearTimeout(timer);
        }
      }
      throw lastError || new Error(`API ${method} ${path} failed.`);
    }

    function queryString(filters) {
      const params = new URLSearchParams();
      Object.entries(filters || {}).forEach(([key, value]) => {
        const normalized = value === undefined || value === null ? "" : String(value);
        if (!normalized) return;
        params.set(key, normalized);
      });
      const serialized = params.toString();
      return serialized ? `?${serialized}` : "";
    }

    return {
      async list(filters = {}) {
        return request("GET", `/time-entries${queryString(filters)}`);
      },
      async create(payload) {
        return request("POST", "/time-entries", payload);
      },
      async update(entryId, payload) {
        return request("PUT", `/time-entries/${encodeURIComponent(entryId)}`, payload);
      },
      async remove(entryId) {
        return request("DELETE", `/time-entries/${encodeURIComponent(entryId)}`);
      },
      async createMonth(payload) {
        return request("POST", "/time-months", payload);
      },
      async updateMonth(monthKey, payload) {
        return request("PUT", `/time-months/${encodeURIComponent(monthKey)}`, payload);
      },
      async removeMonth(monthKey) {
        return request("DELETE", `/time-months/${encodeURIComponent(monthKey)}`);
      },
    };
  }

  global.ClodeTimeEntryApi = {
    create: createTimeEntryApi,
  };
  global.AgentTimeEntryApi = global.ClodeTimeEntryApi;
})(window);
