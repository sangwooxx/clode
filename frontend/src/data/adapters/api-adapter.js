(function initApiAdapter(global) {
  function createApiAdapter(options) {
    const config = {
      baseUrl: options?.baseUrl || "http://127.0.0.1:8787/api/v1",
      timeoutMs: Number(options?.timeoutMs || 5000),
    };

    async function request(method, path, body) {
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
      } finally {
        global.clearTimeout(timer);
      }
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

  global.AgentApiAdapter = {
    create: createApiAdapter,
  };
})(window);
