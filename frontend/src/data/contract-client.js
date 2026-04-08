(function initAgentContractApi(global) {
  const SESSION_STORAGE_KEY = "agent_backend_session_token";

  function createContractApi(options) {
    const config = {
      baseUrl: options?.baseUrl || "http://127.0.0.1:8787/api/v1",
      timeoutMs: Number(options?.timeoutMs || 7000),
    };

    function getSessionToken() {
      try {
        return String(global.sessionStorage?.getItem(SESSION_STORAGE_KEY) || "").trim();
      } catch {
        return "";
      }
    }

    async function request(method, path, body) {
      const controller = new AbortController();
      const timer = global.setTimeout(() => controller.abort(), config.timeoutMs);
      try {
        const headers = {
          "Content-Type": "application/json",
        };
        const token = getSessionToken();
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
        if (filters.includeArchived) {
          params.set("include_archived", "1");
        } else {
          params.set("include_archived", "0");
        }
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

  global.AgentContractApi = {
    create: createContractApi,
  };
})(window);
