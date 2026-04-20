(function initLocalStorageAdapter(global) {
  const STORAGE_KEYS = global.ClodeStorageKeys || global.AgentStorageKeys || {};
  const LEGACY_STORAGE_KEYS = global.ClodeLegacyStorageKeys || global.AgentLegacyStorageKeys || {};

  function cloneValue(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function resolveFallback(fallbackValue) {
    return typeof fallbackValue === "function" ? fallbackValue() : cloneValue(fallbackValue);
  }

  function buildAliasPairs(currentObject, legacyObject, accumulator = []) {
    Object.keys(currentObject || {}).forEach((key) => {
      const currentValue = currentObject[key];
      const legacyValue = legacyObject ? legacyObject[key] : undefined;
      if (typeof currentValue === "string") {
        accumulator.push({
          current: currentValue,
          legacy: typeof legacyValue === "string" ? legacyValue : "",
        });
        return;
      }
      if (currentValue && typeof currentValue === "object") {
        buildAliasPairs(currentValue, legacyValue || {}, accumulator);
      }
    });
    return accumulator;
  }

  const aliasPairs = buildAliasPairs(STORAGE_KEYS, LEGACY_STORAGE_KEYS);
  const canonicalByAlias = aliasPairs.reduce((map, pair) => {
    if (pair.current) map[pair.current] = pair.current;
    if (pair.legacy) map[pair.legacy] = pair.current;
    return map;
  }, {});
  const legacyByCanonical = aliasPairs.reduce((map, pair) => {
    if (pair.current && pair.legacy) {
      map[pair.current] = pair.legacy;
    }
    return map;
  }, {});

  function resolveCanonicalKey(key) {
    return canonicalByAlias[String(key || "").trim()] || String(key || "").trim();
  }

  function createLocalStorageAdapter(storageObject) {
    const storage = storageObject || global.localStorage;

    function getRawValue(key) {
      const canonicalKey = resolveCanonicalKey(key);
      const legacyKey = legacyByCanonical[canonicalKey];
      const canonicalRaw = storage.getItem(canonicalKey);
      if (canonicalRaw !== null && canonicalRaw !== undefined && canonicalRaw !== "") {
        return canonicalRaw;
      }
      if (legacyKey) {
        const legacyRaw = storage.getItem(legacyKey);
        if (legacyRaw !== null && legacyRaw !== undefined && legacyRaw !== "") {
          storage.setItem(canonicalKey, legacyRaw);
          storage.removeItem(legacyKey);
          return legacyRaw;
        }
      }
      return null;
    }

    return {
      kind: "local",
      getParsedSync(key, fallbackValue) {
        try {
          const raw = getRawValue(key);
          if (raw === null || raw === undefined || raw === "") {
            return resolveFallback(fallbackValue);
          }
          return JSON.parse(raw);
        } catch {
          return resolveFallback(fallbackValue);
        }
      },
      setParsedSync(key, value) {
        const canonicalKey = resolveCanonicalKey(key);
        const legacyKey = legacyByCanonical[canonicalKey];
        storage.setItem(canonicalKey, JSON.stringify(value));
        if (legacyKey && legacyKey !== canonicalKey) {
          storage.removeItem(legacyKey);
        }
        return cloneValue(value);
      },
      removeSync(key) {
        const canonicalKey = resolveCanonicalKey(key);
        const legacyKey = legacyByCanonical[canonicalKey];
        storage.removeItem(canonicalKey);
        if (legacyKey && legacyKey !== canonicalKey) {
          storage.removeItem(legacyKey);
        }
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

  global.ClodeLocalStorageAdapter = {
    create: createLocalStorageAdapter,
  };
  global.AgentLocalStorageAdapter = global.ClodeLocalStorageAdapter;
})(window);
