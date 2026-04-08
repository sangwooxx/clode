(function initAgentDataAccess(global) {
  const storageKeys = global.AgentStorageKeys || {};
  const localAdapter = global.AgentLocalStorageAdapter.create(global.localStorage);
  const apiAdapter = global.AgentApiAdapter.create({
    baseUrl: global.__AGENT_API_BASE_URL || "http://127.0.0.1:8787/api/v1",
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
    },
    deletedContracts: {
      storeName: "contracts_deleted",
      storageKey: storageKeys.deletedContracts,
      fallback: [],
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
      fallback: null,
      eventName: "workwear-catalog-updated",
    },
    legacySeedVersion: {
      storeName: "legacy_seed_version",
      storageKey: storageKeys.legacySeedVersion,
      fallback: "",
    },
  });

  const definitionByStorageKey = Object.values(repositoryDefinitions).reduce((accumulator, definition) => {
    if (definition.storageKey) accumulator[definition.storageKey] = definition;
    return accumulator;
  }, {});

  const managerState = {
    mode: global.__AGENT_DATA_MODE || "local",
  };

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

  function dispatchStoreEvent(eventName) {
    if (!eventName) return;
    global.dispatchEvent(new CustomEvent(eventName));
  }

  function loadSync(repositoryNameOrStorageKey, fallbackValue) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, fallbackValue);
    return cloneValue(localAdapter.getParsedSync(definition.storageKey, definition.fallback));
  }

  function saveSync(repositoryNameOrStorageKey, value, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    const payload = cloneValue(value);
    localAdapter.setParsedSync(definition.storageKey, payload);
    dispatchStoreEvent(options?.eventName || definition.eventName);
    return payload;
  }

  function removeSync(repositoryNameOrStorageKey, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    localAdapter.removeSync(definition.storageKey);
    dispatchStoreEvent(options?.eventName || definition.eventName);
  }

  async function load(repositoryNameOrStorageKey, fallbackValue) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, fallbackValue);
    if (managerState.mode === "api") {
      const value = await apiAdapter.getParsed(definition.storeName, definition.fallback);
      if (value !== undefined) {
        localAdapter.setParsedSync(definition.storageKey, value);
        return cloneValue(value);
      }
    }
    return loadSync(repositoryNameOrStorageKey, fallbackValue);
  }

  async function save(repositoryNameOrStorageKey, value, options) {
    const definition = resolveDefinition(repositoryNameOrStorageKey, options?.fallback);
    const payload = saveSync(repositoryNameOrStorageKey, value, options);
    if (managerState.mode === "api" || options?.forceApi) {
      await apiAdapter.setParsed(definition.storeName, payload);
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

  global.AgentDataAccess = {
    repositoryDefinitions,
    repositories,
    getMode() {
      return managerState.mode;
    },
    setMode(mode) {
      managerState.mode = mode === "api" ? "api" : "local";
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
      const snapshot = {};
      Object.entries(repositoryDefinitions).forEach(([repositoryName, definition]) => {
        snapshot[repositoryName] = loadSync(definition.storageKey, definition.fallback);
      });
      return snapshot;
    },
    getStorageKey(repositoryName) {
      return repositoryDefinitions[repositoryName]?.storageKey || "";
    },
  };
})(window);
