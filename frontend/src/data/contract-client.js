(function initClodeContractApi(global) {
  const SESSION_STORAGE_KEY = "clode_backend_session_token";
  const LEGACY_SESSION_STORAGE_KEY = "agent_backend_session_token";

  function resolveApiBaseUrl() {
    return global.__CLODE_API_BASE_URL || global.__AGENT_API_BASE_URL || (global.location?.origin ? `${global.location.origin}/api/v1` : "/api/v1");
  }

  function createContractApi(options) {
    const config = {
      baseUrl: options?.baseUrl || resolveApiBaseUrl(),
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

    return {
      async list(options = {}) {
        const params = new URLSearchParams();
        params.set("include_archived", options.includeArchived ? "1" : "0");
        return request("GET", `/contracts?${params.toString()}`);
      },
      async get(contractId) {
        return request("GET", `/contracts/${encodeURIComponent(contractId)}`);
      },
      async create(payload) {
        return request("POST", "/contracts", payload);
      },
      async update(contractId, payload) {
        return request("PUT", `/contracts/${encodeURIComponent(contractId)}`, payload);
      },
      async archive(contractId) {
        return request("DELETE", `/contracts/${encodeURIComponent(contractId)}`);
      },
      async bulkArchive(ids) {
        return request("POST", "/contracts/bulk-archive", { ids });
      },
      async getUsage(contractId) {
        return request("GET", `/contracts/${encodeURIComponent(contractId)}/usage`);
      },
      async getMetrics(contractId, filters = {}) {
        const params = new URLSearchParams();
        Object.entries(filters || {}).forEach(([key, value]) => {
          const normalized = value === undefined || value === null ? "" : String(value);
          if (!normalized) return;
          params.set(key, normalized);
        });
        const serialized = params.toString();
        return request("GET", `/contracts/${encodeURIComponent(contractId)}/metrics${serialized ? `?${serialized}` : ""}`);
      },
      async getDashboardSnapshot(filters = {}) {
        const params = new URLSearchParams();
        params.set("include_archived", filters.includeArchived ? "1" : "0");
        Object.entries(filters || {}).forEach(([key, value]) => {
          if (key === "includeArchived") return;
          const normalized = value === undefined || value === null ? "" : String(value);
          if (!normalized) return;
          params.set(key, normalized);
        });
        const serialized = params.toString();
        return request("GET", `/dashboard/contracts${serialized ? `?${serialized}` : ""}`);
      },
    };
  }

  global.ClodeContractApi = {
    create: createContractApi,
  };
  global.AgentContractApi = global.ClodeContractApi;
})(window);
