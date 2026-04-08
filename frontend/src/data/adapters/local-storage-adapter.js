(function initLocalStorageAdapter(global) {
  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function resolveFallback(fallbackValue) {
    return typeof fallbackValue === "function" ? fallbackValue() : cloneValue(fallbackValue);
  }

  function createLocalStorageAdapter(storageObject) {
    const storage = storageObject || global.localStorage;

    return {
      kind: "local",
      getParsedSync(key, fallbackValue) {
        try {
          const raw = storage.getItem(key);
          if (raw === null || raw === undefined || raw === "") {
            return resolveFallback(fallbackValue);
          }
          return JSON.parse(raw);
        } catch {
          return resolveFallback(fallbackValue);
        }
      },
      setParsedSync(key, value) {
        storage.setItem(key, JSON.stringify(value));
        return cloneValue(value);
      },
      removeSync(key) {
        storage.removeItem(key);
      },
      async getParsed(key, fallbackValue) {
        return this.getParsedSync(key, fallbackValue);
      },
      async setParsed(key, value) {
        return this.setParsedSync(key, value);
      },
      async remove(key) {
        this.removeSync(key);
      },
    };
  }

  global.AgentLocalStorageAdapter = {
    create: createLocalStorageAdapter,
  };
})(window);
