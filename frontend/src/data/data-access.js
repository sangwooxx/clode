(function initClodeDataAccess(global) {
  function resolveApiBaseUrl() {
    return global.__CLODE_API_BASE_URL || global.__AGENT_API_BASE_URL || (global.location?.origin ? `${global.location.origin}/api/v1` : "/api/v1");
  }

  const storageKeys = global.ClodeStorageKeys || global.AgentStorageKeys || {};
  const localStorageAdapterFactory = global.ClodeLocalStorageAdapter || global.AgentLocalStorageAdapter;
  const apiAdapterFactory = global.ClodeApiAdapter || global.AgentApiAdapter;
  const localAdapter = localStorageAdapterFactory.create(global.localStorage);
  const apiAdapter = apiAdapterFactory.create({
    baseUrl: resolveApiBaseUrl(),
  });

  const repositoryDefinitions = Object.freeze({
    uiState: {
      storeName: "ui_state",
      storageKey: storageKeys.ui?.activeView,
      fallback: "",
    },
    contracts: {
      storeName: "contracts",
      storageKey: storageKeys.contracts,
      fallback: [],
      eventName: "contract-registry-updated",
      preloadInApi: false,
    },
    deletedContracts: {
      storeName: "contracts_deleted",
      storageKey: storageKeys.deletedContracts,
      fallback: [],
      preloadInApi: false,
    },
    settings: {
      storeName: "settings",
      storageKey: storageKeys.settings,
      fallback: null,
      eventName: "settings-updated",
    },
    authSession: {
      storeName: "auth_session",
      storageKey: storageKeys.authSession,
      fallback: { user_id: "", logged_in_at: "" },
      eventName: "current-user-changed",
    },
    auditLogs: {
      storeName: "audit_logs",
      storageKey: storageKeys.auditLogs,
      fallback: [],
      eventName: "audit-log-updated",
    },
    notifications: {
      storeName: "notifications",
      storageKey: storageKeys.notifications,
      fallback: [],
      eventName: "notifications-updated",
    },
    employees: {
      storeName: "employees",
      storageKey: storageKeys.employees,
      fallback: [],
      eventName: "employee-registry-updated",
    },
    hours: {
      storeName: "hours",
      storageKey: storageKeys.hours,
      fallback: { months: {}, selected_month_key: "" },
      eventName: "hours-registry-updated",
    },
    invoices: {
      storeName: "invoices",
      storageKey: storageKeys.invoices,
      fallback: { entries: [] },
      eventName: "invoice-registry-updated",
      preloadInApi: false,
    },
    vacations: {
      storeName: "vacations",
      storageKey: storageKeys.vacations,
      fallback: { balances: {}, requests: [] },
      eventName: "vacation-registry-updated",
    },
    planning: {
      storeName: "planning",
      storageKey: storageKeys.planning,
      fallback: { assignments: {} },
      eventName: "planning-registry-updated",
    },
    workwearIssues: {
      storeName: "workwear_issues",
      storageKey: storageKeys.workwearIssues,
      fallback: [],
      eventName: "workwear-registry-updated",
    },
    workwearCatalog: {
      storeName: "workwear_catalog",
      storageKey: storageKeys.workwearCatalog,
      fallback: [],
      eventName: "workwear-catalog-updated",
    },
    legacySeedVersion: {
      storeName: "legacy_seed_version",
      storageKey: storageKeys.legacySeedVersion,
      fallback: "",
      preloadInApi: false,
    },
  });

  const definitionByStorageKey = Object.values(repositoryDefinitions).reduce((accumulator, definition) => {
    if (definition.storageKey) accumulator[definition.storageKey] = definition;
    return accumulator;
  }, {});

  const managerState = {
    mode: global.__CLODE_DATA_MODE || global.__AGENT_DATA_MODE || "api",
    initialized: false,
    pendingWrites: new Map(),
    remoteCache: Object.create(null),
  };

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function resolveFallback(fallbackValue) {
    return typeof fallbackValue === "function" ? fallbackValue() : cloneValue(fallbackValue);
  }

  function resolveDefinition(repositoryNameOrStorageKey, fallbackValue) {
    if (repositoryDefinitions[repositoryNameOrStorageKey]) {
      return repositoryDefinitions[repositoryNameOrStorageKey];
    }

    if (definitionByStorageKey[repositoryNameOrStorageKey]) {
      return definitionByStorageKey[repositoryNameOrStorageKey];
    }

    return {
      storeName: repositoryNameOrStorageKey,
      storageKey: repositoryNameOrStorageKey,
      fallback: fallbackValue,
    };
  }

  function getCacheKey(definition) {
    return definition.storeName || definition.storageKey || "";
  }

  function getCachedValue(definition, fallbackValue) {
    const cacheKey = getCacheKey(definition);
    if (cacheKey && Object.prototype.hasOwnProperty.call(managerState.remoteCache, cacheKey)) {
      return cloneValue(managerState.remoteCache[cacheKey]);
    }
    return resolveFallback(fallbackValue !== undefined ? fallbackValue : definition.fallback);
  }

  function setCachedValue(definition, value) {
    const cacheKey = getCacheKey(definition);
    if (!cacheKey) return cloneValue(value);
    managerState.remoteCache[cacheKey] = cloneValue(value);
    return cloneValue(value);
  }

  function clearCachedValues() {
    managerState.remoteCache = Object.create(null);
    Object.values(repositoryDefinitions).forEach((definition) => {
      const cacheKey = getCacheKey(definition);
      if (!cacheKey) return;
      managerState.remoteCache[cacheKey] = resolveFallback(definition.fallback);
    });
  }

  function dispatchStoreEvent(eventName) {
    if (!eventName) return;
    global.dispatchEvent(new CustomEvent(eventName));
  }

  function persistRemoteValue(definition, payload) {
    if (managerState.mode !== "api") return Promise.resolve(payload);
    const cacheKey = getCacheKey(definition);
    const pending = apiAdapter.setParsed(definition.storeName, payload)
      .catch((error) => {
        console.warn(`[ClodeDataAccess] Failed to persist store "${definition.storeName}".`, error);
        throw error;
      })
      .finally(() => {
        managerState.pendingWrites.delete(cacheKey);
      });
    managerState.pendingWrites.set(cacheKey, pending);
    return pending;
  }

  function loadSync(repositoryNameOrStorageKey, fallbackValue) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, fallbackValue);
    if (managerState.mode === "api") {
      return getCachedValue(definition, fallbackValue);
    }
    return cloneValue(localAdapter.getParsedSync(definition.storageKey, definition.fallback));
  }

  function saveSync(repositoryNameOrStorageKey, value, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    const payload = cloneValue(value);
    if (managerState.mode === "api") {
      setCachedValue(definition, payload);
      dispatchStoreEvent(options?.eventName || definition.eventName);
      if (!options?.skipRemote && definition.storeName) {
        void persistRemoteValue(definition, payload);
      }
      return payload;
    }
    localAdapter.setParsedSync(definition.storageKey, payload);
    dispatchStoreEvent(options?.eventName || definition.eventName);
    return payload;
  }

  function removeSync(repositoryNameOrStorageKey, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    if (managerState.mode === "api") {
      setCachedValue(definition, resolveFallback(definition.fallback));
      dispatchStoreEvent(options?.eventName || definition.eventName);
      if (!options?.skipRemote && definition.storeName) {
        const cacheKey = getCacheKey(definition);
        const pending = apiAdapter.remove(definition.storeName)
          .catch((error) => {
            console.warn(`[ClodeDataAccess] Failed to remove store "${definition.storeName}".`, error);
            throw error;
          })
          .finally(() => {
            managerState.pendingWrites.delete(cacheKey);
          });
        managerState.pendingWrites.set(cacheKey, pending);
      }
      return;
    }
    localAdapter.removeSync(definition.storageKey);
    dispatchStoreEvent(options?.eventName || definition.eventName);
  }

  async function load(repositoryNameOrStorageKey, fallbackValue) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, fallbackValue);
    if (managerState.mode === "api") {
      try {
        const value = await apiAdapter.getParsed(definition.storeName, definition.fallback);
        setCachedValue(definition, value);
        return cloneValue(value);
      } catch {
        return getCachedValue(definition, fallbackValue);
      }
    }
    return loadSync(repositoryNameOrStorageKey, fallbackValue);
  }

  async function save(repositoryNameOrStorageKey, value, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    const payload = saveSync(repositoryNameOrStorageKey, value, options);
    if (managerState.mode === "api" && definition.storeName) {
      await persistRemoteValue(definition, payload);
    }
    return payload;
  }

  function createRepository(repositoryName) {
    return {
      name: repositoryName,
      loadSync(fallbackValue) {
        return loadSync(repositoryName, fallbackValue);
      },
      saveSync(value, options) {
        return saveSync(repositoryName, value, options);
      },
      removeSync(options) {
        return removeSync(repositoryName, options);
      },
      async load(fallbackValue) {
        return load(repositoryName, fallbackValue);
      },
      async save(value, options) {
        return save(repositoryName, value, options);
      },
    };
  }

  const repositories = Object.keys(repositoryDefinitions).reduce((accumulator, repositoryName) => {
    accumulator[repositoryName] = createRepository(repositoryName);
    return accumulator;
  }, {});

  function purgeLocalRepositorySnapshots() {
    Object.values(repositoryDefinitions).forEach((definition) => {
      if (!definition.storageKey) return;
      localAdapter.removeSync(definition.storageKey);
    });
  }

  async function initialize(options = {}) {
    if (managerState.mode !== "api") {
      managerState.initialized = true;
      return exportSnapshot();
    }

    if (options.reset !== false) {
      clearCachedValues();
    }
    if (options.purgeLocal) {
      purgeLocalRepositorySnapshots();
    }

    const repositoriesToLoad = Array.isArray(options.repositories) && options.repositories.length
      ? options.repositories
      : Object.entries(repositoryDefinitions)
        .filter(([repositoryName, definition]) => repositoryName !== "uiState"
          && repositoryName !== "authSession"
          && definition.preloadInApi !== false)
        .map(([repositoryName]) => repositoryName);

    await Promise.all(repositoriesToLoad.map((repositoryName) => load(repositoryName)));
    managerState.initialized = true;
    return exportSnapshot();
  }

  async function flushPendingWrites() {
    const pending = [...managerState.pendingWrites.values()];
    if (!pending.length) return;
    await Promise.allSettled(pending);
  }

  function exportSnapshot() {
    const snapshot = {};
    Object.entries(repositoryDefinitions).forEach(([repositoryName, definition]) => {
      snapshot[repositoryName] = loadSync(definition.storageKey, definition.fallback);
    });
    return snapshot;
  }

  clearCachedValues();

  global.ClodeDataAccess = {
    repositoryDefinitions,
    repositories,
    getMode() {
      return managerState.mode;
    },
    setMode(mode) {
      managerState.mode = mode === "api" ? "api" : "local";
      if (managerState.mode === "api") {
        clearCachedValues();
      }
    },
    async initialize(options) {
      return initialize(options);
    },
    async flushPendingWrites() {
      return flushPendingWrites();
    },
    purgeLocalRepositorySnapshots() {
      purgeLocalRepositorySnapshots();
    },
    async pingApi() {
      return apiAdapter.health();
    },
    loadSync,
    saveSync,
    removeSync,
    load,
    save,
    legacy: {
      read(storageKey, fallbackValue) {
        return loadSync(storageKey, fallbackValue);
      },
      write(storageKey, value, options) {
        return saveSync(storageKey, value, options);
      },
      remove(storageKey, options) {
        return removeSync(storageKey, options);
      },
      async readRemote(storageKey, fallbackValue) {
        return load(storageKey, fallbackValue);
      },
      async writeRemote(storageKey, value, options) {
        return save(storageKey, value, options);
      },
    },
    exportSnapshot() {
      return exportSnapshot();
    },
    getStorageKey(repositoryName) {
      return repositoryDefinitions[repositoryName]?.storageKey || "";
    },
  };
  global.AgentDataAccess = global.ClodeDataAccess;
})(window);
