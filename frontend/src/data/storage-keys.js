(function initAgentStorageKeys(global) {
  const STORAGE_KEYS = Object.freeze({
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

  global.AgentStorageKeys = STORAGE_KEYS;
})(window);
