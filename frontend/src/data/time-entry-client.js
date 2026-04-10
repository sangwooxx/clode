(function initClodeTimeEntryApi(global) {
  const SESSION_STORAGE_KEY = "clode_backend_session_token";
  const LEGACY_SESSION_STORAGE_KEY = "agent_backend_session_token";

  function createTimeEntryApi(options) {
    const config = {
      baseUrl: options?.baseUrl || "http://127.0.0.1:8787/api/v1",
      timeoutMs: Number(options?.timeoutMs || 7000),
    };

    function getSessionToken() {
      try {
        return String(global.sessionStorage?.getItem(SESSION_STORAGE_KEY) || global.sessionStorage?.getItem(LEGACY_SESSION_STORAGE_KEY) || "").trim();
      } catch {
        return "";
      }
    }

    async function request(method, path, body) {
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
      } finally {
        global.clearTimeout(timer);
      }
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
