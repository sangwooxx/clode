(function initApiAdapter(global) {
  function resolveApiBaseUrl() {
    return global.__CLODE_API_BASE_URL || global.__AGENT_API_BASE_URL || (global.location?.origin ? `${global.location.origin}/api/v1` : "/api/v1");
  }

  function createApiAdapter(options) {
    const config = {
      baseUrl: options?.baseUrl || resolveApiBaseUrl(),
      timeoutMs: Number(options?.timeoutMs || 20000),
      retryCount: Number(options?.retryCount || 1),
    };

    async function request(method, path, body) {
      let lastError = null;
      for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
        const controller = new AbortController();
        const timer = global.setTimeout(() => controller.abort(), config.timeoutMs);
        try {
          const response = await global.fetch(`${config.baseUrl}${path}`, {
            method,
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error(`API ${method} ${path} failed with status ${response.status}`);
          }
          if (response.status === 204) return null;
          return await response.json();
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

    return {
      kind: "api",
      async getParsed(storeName, fallbackValue) {
        try {
          const payload = await request("GET", `/stores/${encodeURIComponent(storeName)}`);
          return payload?.payload ?? (typeof fallbackValue === "function" ? fallbackValue() : fallbackValue);
        } catch {
          return typeof fallbackValue === "function" ? fallbackValue() : fallbackValue;
        }
      },
      async setParsed(storeName, value) {
        await request("PUT", `/stores/${encodeURIComponent(storeName)}`, { payload: value });
        return value;
      },
      async remove(storeName) {
        await request("DELETE", `/stores/${encodeURIComponent(storeName)}`);
      },
      async health() {
        return request("GET", "/health");
      },
    };
  }

  global.ClodeApiAdapter = {
    create: createApiAdapter,
  };
  global.AgentApiAdapter = global.ClodeApiAdapter;
})(window);
