(function initClodeStorageKeys(global) {
  const STORAGE_KEYS = Object.freeze({
    ui: {
      activeView: "clodeActiveViewV1",
    },
    contracts: "clodeContractsV1",
    deletedContracts: "clodeDeletedContractsV1",
    settings: "clodeSettingsV1",
    auditLogs: "clodeAuditLogV1",
    notifications: "clodeNotificationCenterV1",
    authSession: "clodeAuthSessionV1",
    employees: "clodeEmployeeRegistryV1",
    hours: "clodeHoursRegistryV2",
    invoices: "clodeInvoiceRegistryV1",
    vacations: "clodeVacationRegistryV1",
    planning: "clodePlanningRegistryV1",
    workwearIssues: "clodeWorkwearRegistryV1",
    workwearCatalog: "clodeWorkwearCatalogV1",
    legacySeedVersion: "clodeLegacySeedVersion",
  });

  const LEGACY_STORAGE_KEYS = Object.freeze({
    ui: {
      activeView: "agentFirmowyActiveView",
    },
    contracts: "agentInvestmentCatalogV1",
    deletedContracts: "agentInvestmentCatalogDeletedV1",
    settings: "agentAppSettingsV1",
    auditLogs: "agentAuditLogV1",
    notifications: "agentNotificationCenterV1",
    authSession: "agentAuthSessionV1",
    employees: "agentEmployeeRegistryV1",
    hours: "agentHoursFormV2",
    invoices: "agentManualInvoicesV1",
    vacations: "agentVacationRegistryV1",
    planning: "agentPlanningRegistryV1",
    workwearIssues: "agentWorkwearRegistryV1",
    workwearCatalog: "agentWorkwearCatalogV1",
    legacySeedVersion: "agentProjectFinisherSeedVersion",
  });

  global.ClodeStorageKeys = STORAGE_KEYS;
  global.ClodeLegacyStorageKeys = LEGACY_STORAGE_KEYS;
  global.AgentStorageKeys = STORAGE_KEYS;
  global.AgentLegacyStorageKeys = LEGACY_STORAGE_KEYS;
})(window);
