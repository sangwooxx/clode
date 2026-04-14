const HOURS_STORAGE_KEY = "clodeHoursRegistryV2";
const HOURS_EMPLOYEE_STORAGE_KEY = "clodeEmployeeRegistryV1";
const HOURS_UNASSIGNED_KEY = "unassigned";
const HOURS_SORTS_STORAGE_KEY = "clodeHoursLiteSortV1";

const hoursMoneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const hoursNumberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});

const hoursState = window.__clodeHoursLiteState || {
  initialized: false,
  loading: false,
  loadedFromBackend: false,
  selectedMonthKey: "",
  employeeSearch: "",
  lastError: "",
  data: null,
  sorts: null,
  refreshToken: 0,
};

window.__clodeHoursLiteState = hoursState;

function hResolveApiBaseUrl() {
  return window.__CLODE_API_BASE_URL || window.__AGENT_API_BASE_URL || (window.location?.origin ? `${window.location.origin}/api/v1` : "/api/v1");
}

const HOURS_MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = String(index + 1).padStart(2, "0");
  const label = new Date(2026, index, 1).toLocaleDateString("pl-PL", { month: "long" });
  return { value, label };
});

function hNormalizeSort(value, fallback) {
  if (!value || typeof value !== "object") return { ...fallback };
  const key = String(value.key || fallback.key || "").trim();
  const direction = String(value.direction || fallback.direction || "asc").trim().toLowerCase();
  if (!key) return { ...fallback };
  if (direction !== "asc" && direction !== "desc") return { ...fallback };
  return { key, direction };
}

function hDefaultSorts() {
  return {
    workers: { key: "last_name", direction: "asc" },
    yearProjects: { key: "hours", direction: "desc" },
    yearEmployees: { key: "last_name", direction: "asc" },
  };
}

function hLoadSorts() {
  const defaults = hDefaultSorts();
  const parsed = hReadLegacyStore(HOURS_SORTS_STORAGE_KEY, null);
  if (!parsed || typeof parsed !== "object") return defaults;
  return {
    workers: hNormalizeSort(parsed.workers, defaults.workers),
    yearProjects: hNormalizeSort(parsed.yearProjects, defaults.yearProjects),
    yearEmployees: hNormalizeSort(parsed.yearEmployees, defaults.yearEmployees),
  };
}

function hSaveSorts() {
  hWriteLegacyStore(HOURS_SORTS_STORAGE_KEY, hoursState.sorts || hDefaultSorts());
}

function hEmptyFinance() {
  return {
    zus_company_1: 0,
    zus_company_2: 0,
    zus_company_3: 0,
    pit4_company_1: 0,
    pit4_company_2: 0,
    pit4_company_3: 0,
    payouts: 0,
  };
}

function hEmptyState() {
  return {
    meta: {},
    employees: [],
    months: {},
    excluded_employees: [],
  };
}

if (!hoursState.data) {
  hoursState.data = hEmptyState();
}

function hEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function hText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hNumber(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hMoney(value) {
  return hoursMoneyFormatter.format(hNumber(value));
}

function hValue(value) {
  return hoursNumberFormatter.format(hNumber(value));
}

function hSort(left, right) {
  return (window.EmployeeNameUtils?.compare?.(
    left?.name || left?.employee_name || left || "",
    right?.name || right?.employee_name || right || ""
  )) || 0;
}

function hRenderSortHeader(label, tableName, key, sortState) {
  if (window.ClodeTableUtils?.renderHeader) {
    return window.ClodeTableUtils.renderHeader(label, tableName, key, sortState);
  }
  return hEscape(label);
}

function hWorkerColumnMap(contractIds) {
  const columnMap = {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.lastName || "" },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.firstName || "" },
    employer_cost: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.employerCost || 0) },
    total_hours: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.totalHours || 0) },
  };

  (contractIds || []).forEach((contractId) => {
    const normalizedId = hText(contractId);
    if (!normalizedId) return;
    columnMap[normalizedId] = {
      type: "number",
      defaultDirection: "desc",
      getValue: (row) => Number(row.contractHours?.[normalizedId] || 0),
    };
  });

  return columnMap;
}

function hYearProjectColumnMap() {
  return {
    contract_code: { type: "string", defaultDirection: "asc", getValue: (row) => row.contract_code || "" },
    contract_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.contract_name || "" },
    hours: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.hours || 0) },
    employer_cost: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.employer_cost || 0) },
    months_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.months_count || 0) },
  };
}

function hYearEmployeeColumnMap() {
  return {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.last_name || "" },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.first_name || "" },
    hours: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.hours || 0) },
    employer_cost: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.employer_cost || 0) },
    months_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.months_count || 0) },
    contracts_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.contracts_count || 0) },
  };
}

function hNameParts(value) {
  return window.EmployeeNameUtils?.split?.(value) || {
    firstName: "",
    lastName: hText(value),
    registryName: hText(value),
    displayName: hText(value),
    searchText: hText(value).toLowerCase(),
  };
}

function hEmployeeSearchText(value) {
  return window.EmployeeNameUtils?.searchText?.(value) || hText(value).toLowerCase();
}

function hUnique(values) {
  const seen = new Set();
  const result = [];
  (values || []).forEach((value) => {
    const normalized = hText(value);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  });
  return result;
}

function hMonthKey(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : "";
}

function hMonthLabel(monthKey) {
  const [yearRaw, monthRaw] = String(monthKey || "").split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!year || !month) return String(monthKey || "");
  return new Date(year, month - 1, 1).toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
}

function hReadLegacyStore(storageKey, fallbackValue) {
  if (window.ClodeDataAccess?.legacy) {
    return window.ClodeDataAccess.legacy.read(storageKey, fallbackValue);
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? fallbackValue : JSON.parse(raw);
  } catch {
    return fallbackValue;
  }
}

function hWriteLegacyStore(storageKey, value, eventName = "") {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(storageKey, value, eventName ? { eventName } : {});
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName));
  }
}

function hEmployeeRegistry() {
  const parsed = hReadLegacyStore(HOURS_EMPLOYEE_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function hEmployeeRoster() {
  const source = typeof window.getEmployeeRegistrySnapshot === "function"
    ? window.getEmployeeRegistrySnapshot()
    : hEmployeeRegistry();
  const roster = Array.isArray(source) ? source : [];
  if (roster.length) {
    return roster
      .map((employee) => ({
        ...employee,
        name: hText(employee?.name),
        worker_code: hText(employee?.worker_code),
        status: String(employee?.status || "active"),
      }))
      .filter((employee) => employee.name);
  }
  return [];
}

function hEmployeeAliases(employee) {
  return hUnique([
    hText(employee?.name),
    hText([employee?.last_name, employee?.first_name].filter(Boolean).join(" ")),
    hText([employee?.first_name, employee?.last_name].filter(Boolean).join(" ")),
  ]);
}

function hEmployeeProfileByName(value, roster = null) {
  const normalized = hText(value).toLowerCase();
  if (!normalized) return null;

  const employees = roster || hEmployeeRoster();
  return employees.find((employee) =>
    hEmployeeAliases(employee).some((alias) => alias.toLowerCase() === normalized)
  ) || null;
}

function hCanonicalEmployeeName(value, roster = null) {
  return hEmployeeProfileByName(value, roster)?.name || hText(value);
}

function hEmployeeSearchLabel(value) {
  const employee = hEmployeeProfileByName(value);
  if (!employee) return hEmployeeSearchText(value);
  return hText([
    employee.last_name,
    employee.first_name,
    employee.name,
  ].filter(Boolean).join(" ")).toLowerCase();
}

function hContractRegistry() {
  if (typeof window.getContractRegistry === "function") {
    return window.getContractRegistry();
  }
  return [];
}

function hActiveContractRegistry() {
  if (typeof window.getActiveContractRegistry === "function") {
    return window.getActiveContractRegistry();
  }
  return hContractRegistry().filter((contract) => contract?.status !== "archived");
}

function hContractById(contractId) {
  const normalizedId = hText(contractId);
  if (!normalizedId) return null;
  if (typeof window.getContractById === "function") {
    return window.getContractById(normalizedId);
  }
  return hContractRegistry().find((contract) => hText(contract?.id) === normalizedId) || null;
}

function hContractName(contractId, fallback = "") {
  if (contractId === HOURS_UNASSIGNED_KEY || !contractId) return "Nieprzypisane";
  return hText(hContractById(contractId)?.name) || hText(fallback) || "Nieprzypisane";
}

function hContractCode(contractId) {
  if (contractId === HOURS_UNASSIGNED_KEY || !contractId) return "N/P";
  return hText(hContractById(contractId)?.contract_number) || "---";
}

function hSortContractIds(contractIds, contractNames = null) {
  return [...new Set(contractIds.filter(Boolean))]
    .sort((left, right) => {
      if (left === HOURS_UNASSIGNED_KEY) return 1;
      if (right === HOURS_UNASSIGNED_KEY) return -1;
      const leftContract = hContractById(left);
      const rightContract = hContractById(right);
      const leftCode = String(leftContract?.contract_number || "999");
      const rightCode = String(rightContract?.contract_number || "999");
      const byCode = leftCode.localeCompare(rightCode, "pl", { numeric: true });
      if (byCode !== 0) return byCode;
      return hContractName(left, contractNames?.[left] || left).localeCompare(
        hContractName(right, contractNames?.[right] || right),
        "pl",
        { sensitivity: "base", numeric: true }
      );
    });
}

function hTimeEntryApi() {
  if (!window.ClodeTimeEntryApi?.create) return null;
  return window.ClodeTimeEntryApi.create({
    baseUrl: hResolveApiBaseUrl(),
  });
}

function hBuildMonth(monthKey, monthLabel = "") {
  return {
    month_key: monthKey,
    month_label: monthLabel || hMonthLabel(monthKey),
    visible_investments: [],
    finance: hEmptyFinance(),
    workers: [],
  };
}

function hMergeMonthState(payload, fallbackMonthKey = "") {
  const monthKey = hMonthKey(payload?.month_key || fallbackMonthKey);
  if (!monthKey) return null;
  return {
    month_key: monthKey,
    month_label: hText(payload?.month_label) || hMonthLabel(monthKey),
    visible_investments: Array.isArray(payload?.visible_investments)
      ? payload.visible_investments.map((value) => hText(value)).filter(Boolean)
      : [],
    finance: {
      ...hEmptyFinance(),
      ...(payload?.finance || {}),
    },
    workers: Array.isArray(payload?.workers) ? payload.workers : [],
  };
}

function hEnsureWorker(month, employeeName, employeeCode = "") {
  const normalized = hCanonicalEmployeeName(employeeName);
  let worker = (month.workers || []).find((item) => hCanonicalEmployeeName(item.employee_name) === normalized) || null;
  if (worker) return worker;
  worker = {
    employee_name: normalized,
    worker_code: hText(employeeCode),
    project_hours: {},
    entry_ids: {},
    contract_names: {},
  };
  month.workers.push(worker);
  month.workers.sort(hSort);
  return worker;
}

function hBuildStateFromBackend(payload) {
  const months = {};
  const monthRows = Array.isArray(payload?.months) ? payload.months : [];
  const entryRows = Array.isArray(payload?.entries) ? payload.entries : [];

  monthRows.forEach((month) => {
    const monthKey = hMonthKey(month?.month_key);
    if (!monthKey) return;
    months[monthKey] = {
      month_key: monthKey,
      month_label: hText(month?.month_label) || hMonthLabel(monthKey),
      visible_investments: Array.isArray(month?.visible_investments)
        ? month.visible_investments.map((value) => hText(value)).filter(Boolean)
        : [],
      finance: {
        ...hEmptyFinance(),
        ...(month?.finance || {}),
      },
      workers: [],
    };
  });

  entryRows.forEach((entry) => {
    const monthKey = hMonthKey(entry?.month_key);
    if (!monthKey) return;
    const month = months[monthKey] || hBuildMonth(monthKey, entry?.month_label);
    months[monthKey] = month;
    const worker = hEnsureWorker(
      month,
      hText(entry?.employee_name),
      hText(hEmployeeProfileByName(entry?.employee_name)?.worker_code)
    );
    const contractId = hText(entry?.contract_id) || HOURS_UNASSIGNED_KEY;
    const value = hNumber(entry?.hours);
    if (value > 0) {
      worker.project_hours[contractId] = value;
      worker.entry_ids[contractId] = hText(entry?.id);
      worker.contract_names[contractId] = hText(entry?.contract_name);
    }
  });

  return {
    meta: {},
    employees: [],
    months,
    excluded_employees: [],
  };
}

function hSerializeState() {
  return {
    meta: hoursState.data.meta || {},
    employees: [...(hoursState.data.employees || [])].sort(hSort),
    months: Object.fromEntries(
      Object.entries(hoursState.data.months || {})
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey, "pl"))
        .map(([monthKey, month]) => [
          monthKey,
          {
            month_key: month.month_key,
            month_label: month.month_label,
            visible_investments: [...(month.visible_investments || [])],
            finance: { ...hEmptyFinance(), ...(month.finance || {}) },
            workers: [...(month.workers || [])].sort(hSort).map((worker) => ({
              employee_name: worker.employee_name,
              worker_code: worker.worker_code || "",
              project_hours: { ...(worker.project_hours || {}) },
            })),
          },
        ])
    ),
    excluded_employees: [],
  };
}

function hMirrorStateToLegacyStore() {
  hWriteLegacyStore(HOURS_STORAGE_KEY, hSerializeState(), "hours-registry-updated");
}

function hEnsureEmployees() {
  const roster = hEmployeeRoster();
  const activeEmployees = roster.filter((employee) => employee.status !== "inactive");
  const visibleEmployees = new Map();

  activeEmployees.forEach((employee) => {
    const canonicalName = hCanonicalEmployeeName(employee?.name, roster);
    if (!canonicalName) return;
    visibleEmployees.set(canonicalName.toLowerCase(), {
      name: canonicalName,
      worker_code: hText(employee?.worker_code),
    });
  });

  Object.values(hoursState.data.months || {}).forEach((month) => {
    const mergedWorkers = new Map();
    (month.workers || []).forEach((worker) => {
      const canonicalName = hCanonicalEmployeeName(worker?.employee_name, roster);
      if (!canonicalName) return;
      const key = canonicalName.toLowerCase();
      const existing = mergedWorkers.get(key) || {
        employee_name: canonicalName,
        worker_code: hText(worker?.worker_code),
        project_hours: {},
        entry_ids: {},
        contract_names: {},
      };
      Object.entries(worker?.project_hours || {}).forEach(([contractId, value]) => {
        const normalizedContractId = hText(contractId);
        if (!normalizedContractId) return;
        existing.project_hours[normalizedContractId] = hNumber(value);
      });
      Object.assign(existing.entry_ids, worker?.entry_ids || {});
      Object.assign(existing.contract_names, worker?.contract_names || {});
      const rosterEmployee = hEmployeeProfileByName(canonicalName, roster);
      existing.worker_code = hText(rosterEmployee?.worker_code) || existing.worker_code;
      mergedWorkers.set(key, existing);
      if (!visibleEmployees.has(key)) {
        visibleEmployees.set(key, {
          name: canonicalName,
          worker_code: existing.worker_code,
        });
      }
    });
    month.workers = [...mergedWorkers.values()].sort(hSort);
  });

  hoursState.data.employees = [...visibleEmployees.values()].sort(hSort);
}

function hMonthKeys() {
  return Object.keys(hoursState.data.months || {}).sort((left, right) => right.localeCompare(left, "pl"));
}

function hEnsureSelectedMonth() {
  const monthKeys = hMonthKeys();
  if (!monthKeys.length) {
    const today = new Date();
    const fallbackKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    hoursState.data.months[fallbackKey] = hBuildMonth(fallbackKey);
  }
  if (!hoursState.selectedMonthKey || !hoursState.data.months[hoursState.selectedMonthKey]) {
    hoursState.selectedMonthKey = hMonthKeys()[0];
  }
}

function hSelectedMonth() {
  hEnsureSelectedMonth();
  return hoursState.data.months[hoursState.selectedMonthKey];
}

function hVisibleEmployees() {
  return (hoursState.data.employees || [])
    .map((employee) => hText(employee?.name))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "pl", { sensitivity: "base", numeric: true }));
}

function hSelectedOperationalContractIds(month) {
  const activeIds = new Set(hActiveContractRegistry().map((contract) => hText(contract?.id)).filter(Boolean));
  return hSortContractIds((month?.visible_investments || []).filter((contractId) => activeIds.has(hText(contractId))));
}

function hHistoricalContractIds(month) {
  const ids = new Set();
  (month?.workers || []).forEach((worker) => {
    Object.entries(worker?.project_hours || {}).forEach(([contractId, value]) => {
      const normalizedId = hText(contractId);
      if (!normalizedId || !hNumber(value)) return;
      ids.add(normalizedId);
    });
  });
  return [...ids];
}

function hDisplayedContractIds(month) {
  return hSortContractIds([
    ...hSelectedOperationalContractIds(month),
    ...hHistoricalContractIds(month),
  ]);
}

function hWorkerTotal(worker, contractIds = null) {
  const ids = contractIds || Object.keys(worker?.project_hours || {});
  return ids.reduce((sum, contractId) => sum + hNumber(worker?.project_hours?.[contractId]), 0);
}

function hMonthHours(month) {
  return (month?.workers || []).reduce((sum, worker) => sum + hWorkerTotal(worker), 0);
}

function hMonthCosts(month) {
  const finance = month?.finance || hEmptyFinance();
  return (
    hNumber(finance.zus_company_1) +
    hNumber(finance.zus_company_2) +
    hNumber(finance.zus_company_3) +
    hNumber(finance.pit4_company_1) +
    hNumber(finance.pit4_company_2) +
    hNumber(finance.pit4_company_3)
  );
}

function hMonthRh(month) {
  const totalHours = hMonthHours(month);
  if (!totalHours) return 0;
  return (hNumber(month?.finance?.payouts) + hMonthCosts(month)) / totalHours;
}

function hMonthPayoutPlusCosts(month) {
  return hNumber(month?.finance?.payouts) + hMonthCosts(month);
}

function hProjectSummaryRows() {
  const totals = new Map();
  Object.values(hoursState.data.months || {}).forEach((month) => {
    const rh = hMonthRh(month);
    hDisplayedContractIds(month).forEach((contractId) => {
      const bucket = totals.get(contractId) || {
        contract_id: contractId === HOURS_UNASSIGNED_KEY ? "" : contractId,
        contract_name: hContractName(contractId),
        hours: 0,
        employer_cost: 0,
        months: new Set(),
      };
      (month.workers || []).forEach((worker) => {
        const value = hNumber(worker.project_hours?.[contractId]);
        if (!value) return;
        bucket.hours += value;
        bucket.employer_cost += value * rh;
        bucket.months.add(month.month_key);
      });
      totals.set(contractId, bucket);
    });
  });
  return [...totals.values()]
    .map((row) => ({ ...row, months_count: row.months.size }))
    .sort((left, right) => right.hours - left.hours);
}

function hEmployeeSummaryRows() {
  const totals = new Map();
  Object.values(hoursState.data.months || {}).forEach((month) => {
    const rh = hMonthRh(month);
    (month.workers || []).forEach((worker) => {
      const totalHours = hWorkerTotal(worker);
      const current = totals.get(worker.employee_name) || {
        employee_name: worker.employee_name,
        hours: 0,
        employer_cost: 0,
        months: new Set(),
        contracts: new Set(),
      };
      current.hours += totalHours;
      current.employer_cost += totalHours * rh;
      current.months.add(month.month_key);
      Object.entries(worker.project_hours || {}).forEach(([contractId, value]) => {
        if (hNumber(value) > 0) current.contracts.add(contractId);
      });
      totals.set(worker.employee_name, current);
    });
  });
  (hoursState.data.employees || []).forEach((employee) => {
    if (totals.has(employee.name)) return;
    totals.set(employee.name, {
      employee_name: employee.name,
      hours: 0,
      employer_cost: 0,
      months: new Set(),
      contracts: new Set(),
    });
  });
  return [...totals.values()]
    .map((row) => ({
      ...row,
      months_count: row.months.size,
      contracts_count: row.contracts.size,
    }))
    .sort((left, right) => hSort(left.employee_name, right.employee_name));
}

function hRenderMonthSelect() {
  const select = document.getElementById("monthSelect");
  const deleteSelect = document.getElementById("monthDeleteSelect");
  if (!select) return;

  hEnsureSelectedMonth();
  const options = hMonthKeys().map((monthKey) => {
    const month = hoursState.data.months[monthKey];
    return {
      key: monthKey,
      label: month?.month_label || hMonthLabel(monthKey),
    };
  });

  select.innerHTML = options
    .map((month) => `<option value="${hEscape(month.key)}"${month.key === hoursState.selectedMonthKey ? " selected" : ""}>${hEscape(month.label)}</option>`)
    .join("");

  if (deleteSelect) {
    deleteSelect.innerHTML = [
      `<option value="">Wybierz miesiąc</option>`,
      ...options.map((month) => `<option value="${hEscape(month.key)}"${month.key === hoursState.selectedMonthKey ? " selected" : ""}>${hEscape(month.label)}</option>`),
    ].join("");
  }

  hRenderNewMonthControls();
}

function hRenderNewMonthControls() {
  const monthSelect = document.getElementById("newMonthMonthSelect");
  const yearInput = document.getElementById("newMonthYearInput");
  if (!monthSelect || !yearInput) return;

  if (!monthSelect.options.length) {
    monthSelect.innerHTML = HOURS_MONTH_OPTIONS
      .map((option) => `<option value="${option.value}">${hEscape(option.label)}</option>`)
      .join("");
  }

  const selectedMonth = hSelectedMonth();
  const fallbackDate = selectedMonth?.month_key ? new Date(`${selectedMonth.month_key}-01T00:00:00`) : new Date();
  const nextMonth = new Date(fallbackDate.getFullYear(), fallbackDate.getMonth() + 1, 1);
  monthSelect.value = String(nextMonth.getMonth() + 1).padStart(2, "0");
  yearInput.value = String(nextMonth.getFullYear());
}

function hRenderCurrentContracts() {
  const target = document.getElementById("currentInvestmentsPills");
  const month = hSelectedMonth();
  if (!target || !month) return;

  const contractIds = hSelectedOperationalContractIds(month);
  if (!contractIds.length) {
    target.innerHTML = '<span class="pill">Brak aktywnych kontraktów</span>';
    return;
  }

  target.innerHTML = contractIds
    .map((contractId) => `<span class="pill" title="${hEscape(hContractName(contractId))}">${hEscape(hContractCode(contractId))}</span>`)
    .join("");
}

function hRenderContractSelector() {
  const target = document.getElementById("monthlyContractsSelector");
  const month = hSelectedMonth();
  if (!target || !month) return;

  const active = new Set(month.visible_investments || []);
  const contracts = hActiveContractRegistry().sort((left, right) => {
    const leftCode = String(left?.contract_number || "999");
    const rightCode = String(right?.contract_number || "999");
    const byCode = leftCode.localeCompare(rightCode, "pl", { numeric: true });
    if (byCode !== 0) return byCode;
    return String(left?.name || "").localeCompare(String(right?.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });

  if (!contracts.length) {
    target.innerHTML = "<p>Dodaj najpierw aktywne kontrakty w rejestrze kontraktów.</p>";
    return;
  }

  target.innerHTML = `
    <div class="contracts-selector-grid">
      ${contracts.map((contract) => `
        <label class="contract-chip${active.has(contract.id) ? " is-active" : ""}" title="${hEscape(contract.name)}">
          <input type="checkbox" data-contract-toggle="${hEscape(contract.id)}" ${active.has(contract.id) ? "checked" : ""}>
          <span class="contract-chip-code">${hEscape(contract.contract_number || "---")}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function hRenderFinancePanel() {
  const target = document.getElementById("monthFinancePanel");
  const month = hSelectedMonth();
  if (!target || !month) return;
  const finance = { ...hEmptyFinance(), ...(month.finance || {}) };
  const totalHours = hMonthHours(month);
  const rhValue = hMonthRh(month);

  target.innerHTML = `
    <div class="finance-grid finance-grid--hours">
      <label class="finance-field"><span>ZUS firma 1</span><input type="number" step="0.01" min="0" data-finance-key="zus_company_1" value="${hEscape(finance.zus_company_1 || "")}"></label>
      <label class="finance-field"><span>ZUS firma 2</span><input type="number" step="0.01" min="0" data-finance-key="zus_company_2" value="${hEscape(finance.zus_company_2 || "")}"></label>
      <label class="finance-field"><span>ZUS firma 3</span><input type="number" step="0.01" min="0" data-finance-key="zus_company_3" value="${hEscape(finance.zus_company_3 || "")}"></label>
      <label class="finance-field finance-field-emphasis"><span>Wypłaty</span><input type="number" step="0.01" min="0" data-finance-key="payouts" value="${hEscape(finance.payouts || "")}"></label>
      <div class="finance-field finance-field-summary"><span>Godziny</span><strong>${hEscape(hValue(totalHours))}</strong></div>
      <label class="finance-field"><span>PIT-4 firma 1</span><input type="number" step="0.01" min="0" data-finance-key="pit4_company_1" value="${hEscape(finance.pit4_company_1 || "")}"></label>
      <label class="finance-field"><span>PIT-4 firma 2</span><input type="number" step="0.01" min="0" data-finance-key="pit4_company_2" value="${hEscape(finance.pit4_company_2 || "")}"></label>
      <label class="finance-field"><span>PIT-4 firma 3</span><input type="number" step="0.01" min="0" data-finance-key="pit4_company_3" value="${hEscape(finance.pit4_company_3 || "")}"></label>
      <div class="finance-field finance-field-summary"><span>Wypłata + koszty</span><strong>${hEscape(hMoney(hMonthPayoutPlusCosts(month)))}</strong></div>
      <div class="finance-field finance-field-summary"><span>Roboczogodzina</span><strong>${hEscape(hMoney(rhValue))}</strong></div>
    </div>
  `;
}

function hRenderTable() {
  const target = document.getElementById("hoursFormTable");
  const month = hSelectedMonth();
  if (!target || !month) return;

  if (hoursState.loading && !hoursState.loadedFromBackend) {
    target.innerHTML = "<p>Ładowanie ewidencji czasu pracy...</p>";
    return;
  }

  const contractIds = hDisplayedContractIds(month);
  const rhValue = hMonthRh(month);
  const employees = hVisibleEmployees().filter((employeeName) => {
    if (!hoursState.employeeSearch) return true;
    return hEmployeeSearchLabel(employeeName).includes(hoursState.employeeSearch.toLowerCase());
  });

  if (!contractIds.length) {
    target.innerHTML = "<p>Wybierz aktywne kontrakty dla miesiąca albo sprawdź wpisy historyczne.</p>";
    return;
  }

  if (!employees.length) {
    target.innerHTML = "<p>Brak pracowników do wyświetlenia dla tego filtra.</p>";
    return;
  }

  const footerTotals = contractIds.reduce((accumulator, contractId) => {
    accumulator[contractId] = 0;
    return accumulator;
  }, {});

  const workerRows = employees.map((employeeName) => {
    const worker = hEnsureWorker(month, employeeName, hText(hEmployeeProfileByName(employeeName)?.worker_code));
    const employeeProfile = hEmployeeProfileByName(employeeName);
    const nameParts = hNameParts(employeeName);
    const lastName = hText(employeeProfile?.last_name) || nameParts.lastName || "-";
    const firstName = hText(employeeProfile?.first_name) || nameParts.firstName || "-";
    const contractHours = {};
    const totalHours = contractIds.reduce((sum, contractId) => {
      const value = hNumber(worker.project_hours?.[contractId]);
      contractHours[contractId] = value;
      footerTotals[contractId] += value;
      return sum + value;
    }, 0);
    const employerCost = totalHours * rhValue;

    return {
      employeeName,
      lastName,
      firstName,
      totalHours,
      employerCost,
      contractHours,
      worker,
    };
  });

  const workerColumnMap = hWorkerColumnMap(contractIds);
  const workerSort = hoursState.sorts?.workers || hDefaultSorts().workers;
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(workerRows, workerSort, workerColumnMap)
    : workerRows;

  const body = sortedRows.map((row, index) => {
    const employeeName = row.employeeName;
    const worker = row.worker;
    const totalHours = row.totalHours;
    const employerCost = row.employerCost;
    return `
      <tr>
        <td class="table-emphasis">${index + 1}</td>
        <td class="table-emphasis" title="${hEscape(employeeName)}">${hEscape(row.lastName)}</td>
        <td class="table-emphasis" title="${hEscape(employeeName)}">${hEscape(row.firstName)}</td>
        <td class="table-emphasis" title="${hEscape(`${hValue(totalHours)} x ${hMoney(rhValue)}`)}">${hEscape(hMoney(employerCost))}</td>
        ${contractIds.map((contractId) => `
          <td>
            <input
              class="cell-input hours-input"
              type="number"
              step="0.5"
              min="0"
              data-hours-employee="${hEscape(employeeName)}"
              data-hours-contract="${hEscape(contractId)}"
              value="${hEscape(worker.project_hours?.[contractId] || "")}">
          </td>
        `).join("")}
        <td class="table-emphasis">${hEscape(hValue(totalHours))}</td>
        <td class="action-cell">
          <button class="table-action-button" type="button" data-remove-hours-employee="${hEscape(employeeName)}">Usuń</button>
        </td>
      </tr>
    `;
  }).join("");

  const totalHours = Object.values(footerTotals).reduce((sum, value) => sum + value, 0);
  const totalEmployerCost = totalHours * rhValue;

  target.innerHTML = `
    <table class="hours-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${hRenderSortHeader("Nazwisko", "hoursWorkers", "last_name", workerSort)}</th>
          <th>${hRenderSortHeader("Imię", "hoursWorkers", "first_name", workerSort)}</th>
          <th>${hRenderSortHeader("Koszt wynagrodzeń", "hoursWorkers", "employer_cost", workerSort)}</th>
          ${contractIds.map((contractId) => `
            <th title="${hEscape(hContractName(contractId))}">
              ${hRenderSortHeader(hContractCode(contractId), "hoursWorkers", hText(contractId), workerSort)}
            </th>
          `).join("")}
          <th>${hRenderSortHeader("Godziny", "hoursWorkers", "total_hours", workerSort)}</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr>
          <td colspan="3" class="table-emphasis">Suma</td>
          <td class="table-emphasis">${hEscape(hMoney(totalEmployerCost))}</td>
          ${contractIds.map((contractId) => `<td class="table-emphasis">${hEscape(hValue(footerTotals[contractId]))}</td>`).join("")}
          <td class="table-emphasis">${hEscape(hValue(totalHours))}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function hRenderProjectSummary(force = false) {
  const panel = document.getElementById("yearProjectSummaryPanel");
  const target = document.getElementById("yearProjectSummary");
  if (!panel || !target) return;
  if (!force && panel.hidden) return;
  const rows = hProjectSummaryRows().map((row) => {
    const normalizedId = hText(row.contract_id) || HOURS_UNASSIGNED_KEY;
    return {
      ...row,
      contract_key: normalizedId,
      contract_code: hContractCode(normalizedId),
      contract_name: hContractName(normalizedId, row.contract_name),
    };
  });

  const projectSort = hoursState.sorts?.yearProjects || hDefaultSorts().yearProjects;
  const projectColumnMap = hYearProjectColumnMap();
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, projectSort, projectColumnMap)
    : rows;

  target.innerHTML = sortedRows.length
    ? `
      <table class="entity-table compact-summary-table">
        <thead>
          <tr>
            <th>Lp.</th>
            <th>${hRenderSortHeader("ID", "yearProjects", "contract_code", projectSort)}</th>
            <th>${hRenderSortHeader("Kontrakt", "yearProjects", "contract_name", projectSort)}</th>
            <th>${hRenderSortHeader("Godziny", "yearProjects", "hours", projectSort)}</th>
            <th>${hRenderSortHeader("Koszt wynagrodzeń", "yearProjects", "employer_cost", projectSort)}</th>
            <th>${hRenderSortHeader("Miesiące", "yearProjects", "months_count", projectSort)}</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${hEscape(row.contract_code)}</td>
              <td>${hEscape(row.contract_name)}</td>
              <td>${hEscape(hValue(row.hours))}</td>
              <td>${hEscape(hMoney(row.employer_cost))}</td>
              <td>${hEscape(String(row.months_count))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Brak danych rocznych dla kontraktów.</p>";
}

function hRenderEmployeeSummary(force = false) {
  const panel = document.getElementById("yearEmployeeSummaryPanel");
  const target = document.getElementById("yearEmployeeSummary");
  if (!panel || !target) return;
  if (!force && panel.hidden) return;
  const rows = hEmployeeSummaryRows().map((row) => {
    const employeeProfile = hEmployeeProfileByName(row.employee_name);
    const nameParts = hNameParts(row.employee_name);
    return {
      ...row,
      last_name: hText(employeeProfile?.last_name) || nameParts.lastName || "-",
      first_name: hText(employeeProfile?.first_name) || nameParts.firstName || "-",
    };
  });

  const employeeSort = hoursState.sorts?.yearEmployees || hDefaultSorts().yearEmployees;
  const employeeColumnMap = hYearEmployeeColumnMap();
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, employeeSort, employeeColumnMap)
    : rows;

  target.innerHTML = sortedRows.length
    ? `
      <table class="entity-table compact-summary-table">
        <thead>
          <tr>
            <th>Lp.</th>
            <th>${hRenderSortHeader("Nazwisko", "yearEmployees", "last_name", employeeSort)}</th>
            <th>${hRenderSortHeader("Imię", "yearEmployees", "first_name", employeeSort)}</th>
            <th>${hRenderSortHeader("Godziny", "yearEmployees", "hours", employeeSort)}</th>
            <th>${hRenderSortHeader("Koszt wynagrodzeń", "yearEmployees", "employer_cost", employeeSort)}</th>
            <th>${hRenderSortHeader("Miesiące", "yearEmployees", "months_count", employeeSort)}</th>
            <th>${hRenderSortHeader("Kontrakty", "yearEmployees", "contracts_count", employeeSort)}</th>
          </tr>
        </thead>
        <tbody>
          ${sortedRows.map((row, index) => {
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${hEscape(row.last_name)}</td>
                <td>${hEscape(row.first_name)}</td>
                <td>${hEscape(hValue(row.hours))}</td>
                <td>${hEscape(hMoney(row.employer_cost))}</td>
                <td>${hEscape(String(row.months_count))}</td>
                <td>${hEscape(String(row.contracts_count))}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `
    : "<p>Brak danych rocznych dla pracowników.</p>";
}

function hRenderEmployeeSuggestions() {
  const target = document.getElementById("hoursEmployeeSuggestions");
  if (!target) return;
  const employees = hEmployeeRoster()
    .filter((employee) => employee?.status !== "inactive" && hText(employee?.name))
    .sort(hSort);
  target.innerHTML = employees
    .map((employee) => `<option value="${hEscape(hText(employee.name))}"></option>`)
    .join("");
}

function hRenderModule() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("hoursView")) return;
  hEnsureEmployees();
  hEnsureSelectedMonth();
  hRenderMonthSelect();
  hRenderCurrentContracts();
  hRenderContractSelector();
  hRenderFinancePanel();
  hRenderTable();
  hRenderProjectSummary();
  hRenderEmployeeSummary();
  hRenderEmployeeSuggestions();
}

function hDownload(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function hExcelXml() {
  const rowsToXml = (cells) =>
    `<Row>${cells.map((cell) => `<Cell><Data ss:Type="${typeof cell === "number" ? "Number" : "String"}">${hEscape(cell)}</Data></Cell>`).join("")}</Row>`;
  const sheets = hMonthKeys().reverse().map((monthKey) => {
    const month = hoursState.data.months[monthKey];
    const contractIds = hDisplayedContractIds(month);
    const workers = hVisibleEmployees();
    const header = ["Pracownik", ...contractIds.map((contractId) => hContractCode(contractId)), "Suma godzin"];
    const body = workers.map((employeeName) => {
      const worker = hEnsureWorker(month, employeeName);
      const values = contractIds.map((contractId) => hNumber(worker.project_hours?.[contractId]));
      return [employeeName, ...values, values.reduce((sum, value) => sum + value, 0)];
    });
    return `
      <Worksheet ss:Name="${hEscape(month.month_label || month.month_key)}">
        <Table>
          ${rowsToXml([month.month_label || month.month_key])}
          ${rowsToXml(header)}
          ${body.map(rowsToXml).join("")}
        </Table>
      </Worksheet>
    `;
  }).join("");
  return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets}</Workbook>`;
}

function hOpenPrint(title, htmlContent) {
  const popup = window.open("", "_blank", "width=1100,height=800");
  if (!popup) return;
  popup.document.write(`<!DOCTYPE html><html lang="pl"><head><meta charset="utf-8"><title>${hEscape(title)}</title><style>body{font-family:Segoe UI,Arial,sans-serif;margin:24px;color:#111}h1{margin:0 0 20px;font-size:24px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #cfcfcf;padding:8px 10px;text-align:left}th{background:#f0f0f0;font-size:12px;text-transform:uppercase}</style></head><body><h1>${hEscape(title)}</h1>${htmlContent}</body></html>`);
  popup.document.close();
  popup.focus();
  popup.print();
}

async function hRefreshFromBackend(options = {}) {
  const refreshToken = (hoursState.refreshToken || 0) + 1;
  hoursState.refreshToken = refreshToken;
  const api = hTimeEntryApi();
  if (!api || (typeof window.isAuthenticated === "function" && !window.isAuthenticated())) {
    if (refreshToken !== hoursState.refreshToken) return;
    hoursState.data = hEmptyState();
    hoursState.loadedFromBackend = false;
    hoursState.lastError = "";
    hMirrorStateToLegacyStore();
    hRenderModule();
    return;
  }

  hoursState.loading = true;
  if (!options.silent) {
    hRenderModule();
  }

  try {
    const payload = await api.list({});
    if (refreshToken !== hoursState.refreshToken) return;
    const previousMonthKey = options.selectedMonthKey || hoursState.selectedMonthKey;
    hoursState.data = hBuildStateFromBackend(payload);
    hoursState.loadedFromBackend = true;
    hoursState.lastError = "";
    hEnsureEmployees();
    const monthKeys = hMonthKeys();
    hoursState.selectedMonthKey = monthKeys.includes(previousMonthKey)
      ? previousMonthKey
      : (monthKeys[0] || "");
    hMirrorStateToLegacyStore();
  } catch (error) {
    if (refreshToken !== hoursState.refreshToken) return;
    hoursState.lastError = error?.message || "Nie udało się pobrać ewidencji czasu pracy z backendu.";
    console.warn(hoursState.lastError, error);
  } finally {
    if (refreshToken !== hoursState.refreshToken) return;
    hoursState.loading = false;
  }

  hRenderModule();
}

async function hPersistMonth(monthKey) {
  const api = hTimeEntryApi();
  const month = hoursState.data.months?.[monthKey];
  if (!api || !month) return;
  await api.updateMonth(monthKey, {
    month_label: month.month_label,
    visible_investments: month.visible_investments || [],
    finance: month.finance || hEmptyFinance(),
    selected: hoursState.selectedMonthKey === monthKey,
  });
}

function hEmployeeId(employeeName) {
  return hText(hEmployeeProfileByName(employeeName)?.id) || "";
}

async function hUpsertTimeEntry(monthKey, employeeName, contractId, hoursValue, fallbackContractName = "") {
  const api = hTimeEntryApi();
  if (!api) return;
  const month = hoursState.data.months?.[monthKey];
  if (!month) return;
  const worker = hEnsureWorker(month, employeeName, hText(hEmployeeProfileByName(employeeName)?.worker_code));
  const normalizedContractId = hText(contractId) || HOURS_UNASSIGNED_KEY;
  const existingEntryId = hText(worker.entry_ids?.[normalizedContractId]);
  const payload = {
    month_key: monthKey,
    employee_id: hEmployeeId(employeeName),
    employee_name: hCanonicalEmployeeName(employeeName),
    contract_id: normalizedContractId === HOURS_UNASSIGNED_KEY ? "" : normalizedContractId,
    contract_name: fallbackContractName || worker.contract_names?.[normalizedContractId] || hContractName(normalizedContractId),
    hours: hNumber(hoursValue),
  };

  if (payload.hours > 0) {
    if (existingEntryId) {
      await api.update(existingEntryId, payload);
    } else {
      await api.create(payload);
    }
  } else if (existingEntryId) {
    await api.remove(existingEntryId);
  }
}

async function hRemoveEmployee(employeeName) {
  const month = hSelectedMonth();
  if (!month) return;
  const worker = (month.workers || []).find((item) => hCanonicalEmployeeName(item.employee_name) === hCanonicalEmployeeName(employeeName));
  if (!worker) return;
  const api = hTimeEntryApi();
  if (!api) return;
  const entryIds = Object.values(worker.entry_ids || {}).map((value) => hText(value)).filter(Boolean);
  for (const entryId of entryIds) {
    await api.remove(entryId);
  }
  await hRefreshFromBackend({ selectedMonthKey: month.month_key });
}

async function hRemoveContract(contractId) {
  const normalizedId = hText(contractId);
  if (!normalizedId) return;
  const api = hTimeEntryApi();
  if (!api) return;

  for (const month of Object.values(hoursState.data.months || {})) {
    month.visible_investments = (month.visible_investments || []).filter((id) => id !== normalizedId);
    await hPersistMonth(month.month_key);
    for (const worker of month.workers || []) {
      const entryId = hText(worker.entry_ids?.[normalizedId]);
      if (entryId) {
        await api.remove(entryId);
      }
    }
  }
  await hRefreshFromBackend({ selectedMonthKey: hoursState.selectedMonthKey });
}

window.removeEmployeeFromHoursData = function removeEmployeeFromHoursData(employeeName) {
  return hRemoveEmployee(employeeName);
};

window.removeContractFromHoursData = function removeContractFromHoursData(contractId) {
  return hRemoveContract(contractId);
};

window.renderHoursLite = function renderHoursLite() {
  void hRefreshFromBackend({ silent: false });
};

async function hWaitForClodeDataReady() {
  if (window.ClodeDataAccess?.repositories?.hours?.load) {
    await window.ClodeDataAccess.repositories.hours.load({ months: {}, selected_month_key: "" });
    return;
  }
  await window.whenClodeDataReady?.();
}

function hNewMonthKeyFromControls() {
  const monthValue = String(document.getElementById("newMonthMonthSelect")?.value || "").trim();
  const yearValue = String(document.getElementById("newMonthYearInput")?.value || "").trim();
  if (!/^\d{4}$/.test(yearValue)) return "";
  if (!/^(0[1-9]|1[0-2])$/.test(monthValue)) return "";
  return `${yearValue}-${monthValue}`;
}

function initHoursLite() {
  if (hoursState.initialized || !document.getElementById("hoursView")) return;

  if (!hoursState.sorts) {
    hoursState.sorts = hLoadSorts();
  }

  document.getElementById("monthSelect")?.addEventListener("change", (event) => {
    const monthKey = hMonthKey(event.target.value);
    if (!monthKey || !hoursState.data.months[monthKey]) return;
    hoursState.selectedMonthKey = monthKey;
    hRenderModule();
  });

  document.getElementById("addMonthButton")?.addEventListener("click", async () => {
    const monthKey = hNewMonthKeyFromControls();
    if (!monthKey) return;
    const api = hTimeEntryApi();
    if (!api) return;
    const addButton = document.getElementById("addMonthButton");
    const previousLabel = addButton?.textContent || "Dodaj";
    if (addButton) {
      addButton.disabled = true;
      addButton.textContent = "Dodawanie...";
    }
    try {
      await hWaitForClodeDataReady();
      const response = await api.createMonth({
        month_key: monthKey,
        month_label: hMonthLabel(monthKey),
        visible_investments: [],
        finance: hEmptyFinance(),
        selected: false,
      });
      hoursState.data.months[monthKey] = hMergeMonthState(response?.month, monthKey) || hBuildMonth(monthKey);
      hoursState.selectedMonthKey = monthKey;
      hEnsureEmployees();
      hMirrorStateToLegacyStore();
      hRenderModule();
      await hRefreshFromBackend({ selectedMonthKey: monthKey });
    } catch (error) {
      console.warn("Nie udało się dodać miesiąca.", error);
      window.alert("Nie udało się dodać miesiąca. Odśwież widok i spróbuj ponownie.");
    } finally {
      if (addButton) {
        addButton.disabled = false;
        addButton.textContent = previousLabel;
      }
    }
  });

  document.getElementById("deleteSelectedMonthsButton")?.addEventListener("click", async () => {
    const deleteSelect = document.getElementById("monthDeleteSelect");
    const selectedMonthKey = hMonthKey(deleteSelect?.value);
    if (!selectedMonthKey) return;
    const monthLabel = hoursState.data.months?.[selectedMonthKey]?.month_label || hMonthLabel(selectedMonthKey);
    if (!window.confirm(`Czy na pewno chcesz usunąć miesiąc ${monthLabel}?`)) return;
    const api = hTimeEntryApi();
    if (!api) return;
    await api.removeMonth(selectedMonthKey);
    await hRefreshFromBackend();
  });

  document.getElementById("deleteMonthButton")?.addEventListener("click", async () => {
    const month = hSelectedMonth();
    if (!month || !window.confirm(`Czy na pewno chcesz usunąć miesiąc ${month.month_label || month.month_key}?`)) return;
    const api = hTimeEntryApi();
    if (!api) return;
    await api.removeMonth(month.month_key);
    await hRefreshFromBackend();
  });

  document.getElementById("employeeSearchInput")?.addEventListener("input", (event) => {
    hoursState.employeeSearch = String(event.target.value || "");
    hRenderTable();
  });

  document.getElementById("hoursEmployeeNameInput")?.addEventListener("input", (event) => {
    event.target.setCustomValidity("");
  });

  document.getElementById("addHoursEmployeeButton")?.addEventListener("click", () => {
    const employeeInput = document.getElementById("hoursEmployeeNameInput");
    const employeeName = hText(employeeInput?.value);
    if (!employeeName) return;
    const matchedEmployee = hEmployeeProfileByName(employeeName);
    if (matchedEmployee?.status === "inactive") {
      employeeInput?.setCustomValidity("Możesz dodać tylko aktywnego pracownika.");
      employeeInput?.reportValidity();
      return;
    }
    if (!matchedEmployee) {
      employeeInput?.setCustomValidity("Wybierz pracownika z kartoteki.");
      employeeInput?.reportValidity();
      return;
    }
    employeeInput.value = "";
    hRenderModule();
  });

  document.getElementById("monthlyContractsSelector")?.addEventListener("change", async (event) => {
    const checkbox = event.target.closest("input[data-contract-toggle]");
    if (!checkbox) return;
    const month = hSelectedMonth();
    const contracts = new Set(month.visible_investments || []);
    if (checkbox.checked) contracts.add(hText(checkbox.dataset.contractToggle));
    else contracts.delete(hText(checkbox.dataset.contractToggle));
    month.visible_investments = hSortContractIds([...contracts]);
    await hPersistMonth(month.month_key);
    await hRefreshFromBackend({ selectedMonthKey: month.month_key });
  });

  document.getElementById("monthFinancePanel")?.addEventListener("change", async (event) => {
    const input = event.target.closest("input[data-finance-key]");
    if (!input) return;
    const month = hSelectedMonth();
    month.finance[input.dataset.financeKey] = hNumber(input.value);
    await hPersistMonth(month.month_key);
    await hRefreshFromBackend({ selectedMonthKey: month.month_key });
  });

  document.getElementById("hoursFormTable")?.addEventListener("change", async (event) => {
    const input = event.target.closest("input[data-hours-employee][data-hours-contract]");
    if (!input) return;
    const month = hSelectedMonth();
    const employeeName = hText(input.dataset.hoursEmployee);
    const contractId = hText(input.dataset.hoursContract) || HOURS_UNASSIGNED_KEY;
    await hUpsertTimeEntry(
      month.month_key,
      employeeName,
      contractId,
      input.value,
      hContractName(contractId)
    );
    await hRefreshFromBackend({ selectedMonthKey: month.month_key });
  });

  document.getElementById("hoursFormTable")?.addEventListener("click", async (event) => {
    const sortButton = event.target.closest("button[data-sort-table='hoursWorkers']");
    if (sortButton) {
      const month = hSelectedMonth();
      if (!month || !window.ClodeTableUtils?.nextSort) return;
      const contractIds = hDisplayedContractIds(month);
      const next = window.ClodeTableUtils.nextSort(
        hoursState.sorts?.workers || hDefaultSorts().workers,
        sortButton.dataset.sortKey,
        hWorkerColumnMap(contractIds)
      );
      hoursState.sorts = hoursState.sorts || hDefaultSorts();
      hoursState.sorts.workers = next;
      hSaveSorts();
      hRenderTable();
      return;
    }
    const button = event.target.closest("button[data-remove-hours-employee]");
    if (!button) return;
    if (!window.confirm(`Czy na pewno chcesz usunąć pracownika ${button.dataset.removeHoursEmployee} z zestawienia godzin?`)) return;
    await hRemoveEmployee(button.dataset.removeHoursEmployee);
  });

  document.getElementById("yearProjectSummary")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='yearProjects']");
    if (!sortButton || !window.ClodeTableUtils?.nextSort) return;
    const next = window.ClodeTableUtils.nextSort(
      hoursState.sorts?.yearProjects || hDefaultSorts().yearProjects,
      sortButton.dataset.sortKey,
      hYearProjectColumnMap()
    );
    hoursState.sorts = hoursState.sorts || hDefaultSorts();
    hoursState.sorts.yearProjects = next;
    hSaveSorts();
    hRenderProjectSummary(true);
  });

  document.getElementById("yearEmployeeSummary")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='yearEmployees']");
    if (!sortButton || !window.ClodeTableUtils?.nextSort) return;
    const next = window.ClodeTableUtils.nextSort(
      hoursState.sorts?.yearEmployees || hDefaultSorts().yearEmployees,
      sortButton.dataset.sortKey,
      hYearEmployeeColumnMap()
    );
    hoursState.sorts = hoursState.sorts || hDefaultSorts();
    hoursState.sorts.yearEmployees = next;
    hSaveSorts();
    hRenderEmployeeSummary(true);
  });

  document.getElementById("exportJsonButton")?.addEventListener("click", () => {
    hDownload("zestawienie-godzin.json", JSON.stringify(hSerializeState(), null, 2), "application/json;charset=utf-8");
  });

  document.getElementById("exportExcelButton")?.addEventListener("click", () => {
    hDownload("zestawienie-godzin.xml", hExcelXml(), "application/xml;charset=utf-8");
  });

  document.querySelectorAll("[data-collapse-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.collapseTarget;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      panel.hidden = !panel.hidden;
      button.textContent = panel.hidden ? "Rozwiń" : "Zwiń";
      if (targetId === "yearProjectSummaryPanel" && !panel.hidden) hRenderProjectSummary(true);
      if (targetId === "yearEmployeeSummaryPanel" && !panel.hidden) hRenderEmployeeSummary(true);
    });
  });

  document.querySelectorAll("[data-pdf-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.getElementById(button.dataset.pdfTarget);
      if (!target) return;
      const title = button.dataset.pdfTarget === "yearProjectSummary" ? "Roczne podsumowanie kontraktów" : "Roczne podsumowanie pracowników";
      hOpenPrint(title, target.innerHTML || "<p>Brak danych.</p>");
    });
  });

  window.addEventListener("contract-registry-updated", () => {
    void hRefreshFromBackend({ selectedMonthKey: hoursState.selectedMonthKey, silent: true });
  });

  window.addEventListener("employee-registry-updated", () => {
    hEnsureEmployees();
    hRenderEmployeeSuggestions();
    hMirrorStateToLegacyStore();
    hRenderModule();
  });

  window.addEventListener("clode-data-ready", () => {
    void hRefreshFromBackend({ selectedMonthKey: hoursState.selectedMonthKey, silent: true });
  });

  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "hoursView") {
      void hRefreshFromBackend({ selectedMonthKey: hoursState.selectedMonthKey, silent: true });
    }
  });

  window.addEventListener("current-user-changed", () => {
    void hRefreshFromBackend({ selectedMonthKey: "", silent: true });
  });

  hoursState.initialized = true;
  void hRefreshFromBackend({ silent: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHoursLite);
} else {
  initHoursLite();
}
