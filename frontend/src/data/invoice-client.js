(function initClodeInvoiceApi(global) {
  const SESSION_STORAGE_KEY = "clode_backend_session_token";
  const LEGACY_SESSION_STORAGE_KEY = "agent_backend_session_token";

  function createInvoiceApi(options) {
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
      async listContracts(options = {}) {
        const params = new URLSearchParams();
        params.set("include_archived", options.includeArchived ? "1" : "0");
        const serialized = params.toString();
        return request("GET", `/contracts${serialized ? `?${serialized}` : ""}`);
      },
      async list(filters) {
        return request("GET", `/invoices${queryString(filters)}`);
      },
      async get(invoiceId) {
        return request("GET", `/invoices/${encodeURIComponent(invoiceId)}`);
      },
      async create(payload) {
        return request("POST", "/invoices", payload);
      },
      async update(invoiceId, payload) {
        return request("PUT", `/invoices/${encodeURIComponent(invoiceId)}`, payload);
      },
      async remove(invoiceId) {
        return request("DELETE", `/invoices/${encodeURIComponent(invoiceId)}`);
      },
      async bulkDelete(ids) {
        return request("POST", "/invoices/bulk-delete", { ids });
      },
      async importLegacy(entries) {
        return request("POST", "/invoices/import-legacy", { entries });
      },
    };
  }

  global.ClodeInvoiceApi = {
    create: createInvoiceApi,
  };
  global.AgentInvoiceApi = global.ClodeInvoiceApi;
})(window);
