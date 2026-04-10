(function initMigrationTools(global) {
  function toIsoTimestamp() {
    return new Date().toISOString();
  }

  function buildLegacySnapshot() {
    const dataAccess = global.ClodeDataAccess || global.AgentDataAccess;
    const snapshot = dataAccess.exportSnapshot();
    return {
      exported_at: toIsoTimestamp(),
      app_version: global.__APP_MODULE_VERSION__ || "legacy-ui",
      source: "localStorage",
      stores: snapshot,
    };
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = global.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.URL.revokeObjectURL(url);
  }

  global.ClodeMigrationTools = {
    exportLegacySnapshot() {
      return buildLegacySnapshot();
    },
    downloadLegacySnapshot(filename) {
      const safeName = filename || `clode-legacy-export-${toIsoTimestamp().slice(0, 10)}.json`;
      const snapshot = buildLegacySnapshot();
      downloadJson(safeName, snapshot);
      return snapshot;
    },
  };
  global.AgentMigrationTools = global.ClodeMigrationTools;
})(window);
