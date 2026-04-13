const VACATION_STORAGE_KEY = "clodeVacationRegistryV1";
const VACATION_PLANNING_STORAGE_KEY = "clodePlanningRegistryV1";
const VACATION_TABLE_SORT_KEY = "clodeVacationsTableSortV1";
const VACATION_EMPLOYEE_STORAGE_KEY = "clodeEmployeeRegistryV1";
const VACATION_HOURS_STORAGE_KEY = "clodeHoursRegistryV2";

const vacationState = window.__clodeVacationState || {
  initialized: false,
  selectedEmployee: "",
  search: "",
  editingRequestId: "",
  sorts: null,
};

window.__clodeVacationState = vacationState;

function vacationDefaultSorts() {
  return {
    employees: { key: "last_name", direction: "asc" },
    approvals: { key: "start_date", direction: "desc" },
  };
}

function vacationReadStore(storageKey, fallbackValue) {
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

function vacationWriteStore(storageKey, value) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(storageKey, value);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function vacationNormalizeName(value) {
  return vacationText(value).trim().replace(/\s+/g, " ");
}

function vacationEmployeeParts(name) {
  const normalized = vacationNormalizeName(name);
  const parts = window.EmployeeNameUtils?.split?.(normalized);
  if (parts) {
    return { first_name: parts.firstName, last_name: parts.lastName };
  }
  if (!normalized) return { first_name: "", last_name: "" };
  const items = normalized.split(" ");
  if (items.length === 1) return { first_name: "", last_name: items[0] };
  // Legacy fallback: "Nazwisko Imie"
  return { first_name: items.slice(1).join(" "), last_name: items[0] };
}

function vacationCompareEmployees(left, right) {
  const leftLabel = window.EmployeeNameUtils?.searchText?.(left) || vacationNormalizeName(left?.name || "");
  const rightLabel = window.EmployeeNameUtils?.searchText?.(right) || vacationNormalizeName(right?.name || "");
  return leftLabel.localeCompare(rightLabel, "pl", { sensitivity: "base", numeric: true });
}

function vacationEmployeesFromStores() {
  const registry = vacationReadStore(VACATION_EMPLOYEE_STORAGE_KEY, []);
  const hoursSnapshot = vacationReadStore(VACATION_HOURS_STORAGE_KEY, null);
  const snapshotEmployees =
    hoursSnapshot && typeof hoursSnapshot === "object" ? (hoursSnapshot.employees || []) : [];

  const merged = new Map();

  [...(Array.isArray(snapshotEmployees) ? snapshotEmployees : [])].forEach((emp) => {
    const name = vacationNormalizeName(emp?.name);
    if (!name) return;
    const key = name.toLowerCase();
    const parts = vacationEmployeeParts(name);
    merged.set(key, {
      name,
      worker_code: vacationNormalizeName(emp?.worker_code),
      first_name: parts.first_name,
      last_name: parts.last_name,
      position: "",
      status: "active",
    });
  });

  // Registry overrides (Kartoteka pracowników)
  (Array.isArray(registry) ? registry : []).forEach((emp) => {
    const name = vacationNormalizeName(emp?.name);
    if (!name) return;
    const key = name.toLowerCase();
    const existing = merged.get(key) || { name, worker_code: "" };
    const parts = vacationEmployeeParts(name);
    merged.set(key, {
      ...existing,
      ...emp,
      name,
      worker_code: vacationNormalizeName(emp?.worker_code || existing.worker_code),
      first_name: vacationNormalizeName(emp?.first_name) || parts.first_name,
      last_name: vacationNormalizeName(emp?.last_name) || parts.last_name,
      status: String(emp?.status || existing.status || "active") === "inactive" ? "inactive" : "active",
    });
  });

  return [...merged.values()].sort(vacationCompareEmployees);
}

function vacationLoadSorts() {
  const defaults = vacationDefaultSorts();
  const parsed = vacationReadStore(VACATION_TABLE_SORT_KEY, null);
  if (!parsed || typeof parsed !== "object") return defaults;
  const normalize = (value, fallback) => {
    if (!value || typeof value !== "object") return { ...fallback };
    const key = String(value.key || fallback.key || "").trim();
    const direction = String(value.direction || fallback.direction || "asc").trim().toLowerCase();
    if (!key) return { ...fallback };
    if (direction !== "asc" && direction !== "desc") return { ...fallback };
    return { key, direction };
  };
  return {
    employees: normalize(parsed.employees, defaults.employees),
    approvals: normalize(parsed.approvals, defaults.approvals),
  };
}

function vacationSaveSorts() {
  vacationWriteStore(VACATION_TABLE_SORT_KEY, vacationState.sorts || vacationDefaultSorts());
}

function vacationRenderHeader(label, tableName, key, sortState) {
  if (!window.ClodeTableUtils?.renderHeader) return vacationEscape(label);
  return window.ClodeTableUtils.renderHeader(label, tableName, key, sortState);
}

function vacationEmployeeColumnMap() {
  return {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.last_name || "" },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.first_name || "" },
    total_pool: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.total_pool || 0) },
    used_days: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.used_days || 0) },
    pending_days: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.pending_days || 0) },
    remaining_days: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.remaining_days || 0) },
  };
}

function vacationApprovalsColumnMap() {
  return {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.last_name || "" },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.first_name || "" },
    type: { type: "string", defaultDirection: "asc", getValue: (row) => row.type || "" },
    start_date: { type: "date", defaultDirection: "desc", getValue: (row) => row.start_date || "" },
    end_date: { type: "date", defaultDirection: "desc", getValue: (row) => row.end_date || "" },
    days: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.days || 0) },
    status: { type: "string", defaultDirection: "asc", getValue: (row) => row.status || "" },
    requested_by: { type: "string", defaultDirection: "asc", getValue: (row) => row.requested_by || "" },
  };
}

function vacationEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function vacationText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function vacationNumber(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function vacationValue(value) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(vacationNumber(value));
}

function loadVacationStore() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(VACATION_STORAGE_KEY, null)
    : null;
  if (parsed && typeof parsed === "object") {
    return {
      balances: parsed.balances && typeof parsed.balances === "object" ? parsed.balances : {},
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
    };
  }
  return { balances: {}, requests: [] };
}

function saveVacationStore(store) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(VACATION_STORAGE_KEY, store, { eventName: "vacation-registry-updated" });
    return;
  }
  window.localStorage.setItem(VACATION_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("vacation-registry-updated"));
}

function getVacationEmployees() {
  if (typeof window.getEmployeeRoster === "function") {
    const roster = window.getEmployeeRoster();
    if (Array.isArray(roster) && roster.length) return roster;
  }
  if (typeof window.getEmployeeRegistrySnapshot === "function") {
    const snapshot = window.getEmployeeRegistrySnapshot();
    if (Array.isArray(snapshot) && snapshot.length) return snapshot;
  }
  return vacationEmployeesFromStores();
}

function ensureSelectedVacationEmployee() {
  const employees = getVacationEmployees();
  if (!employees.length) {
    vacationState.selectedEmployee = "";
    return;
  }
  if (!employees.some((employee) => employee.name === vacationState.selectedEmployee)) {
    vacationState.selectedEmployee = employees[0].name;
  }
}

function getVacationBalance(employeeName) {
  const balance = loadVacationStore().balances?.[employeeName] || {};
  return {
    base_days: vacationNumber(balance.base_days),
    carryover_days: vacationNumber(balance.carryover_days),
    extra_days: vacationNumber(balance.extra_days),
  };
}

function getVacationRequests(employeeName = "") {
  return loadVacationStore().requests
    .filter((request) => !employeeName || request.employee_name === employeeName)
    .sort((left, right) => String(right.start_date || "").localeCompare(String(left.start_date || ""), "pl"));
}

function getVacationRequestById(requestId) {
  return getVacationRequests().find((request) => request.id === requestId) || null;
}

function vacationTypeLabel(type) {
  return {
    vacation: "Urlop wypoczynkowy",
    on_demand: "Urlop na \u017C\u0105danie",
    l4: "L4",
    other: "Inna nieobecno\u015B\u0107",
  }[type] || "Nieobecno\u015B\u0107";
}

function vacationStatusLabel(status) {
  return {
    pending: "Oczekuje",
    approved: "Zatwierdzony",
    rejected: "Odrzucony",
  }[status] || "Oczekuje";
}

function vacationNameParts(value) {
  return window.EmployeeNameUtils?.split?.(value) || {
    firstName: "",
    lastName: vacationText(value),
    displayName: vacationText(value),
    searchText: vacationText(value).toLowerCase(),
  };
}

function vacationDisplayName(value) {
  return window.EmployeeNameUtils?.display?.(value) || vacationText(value);
}

function vacationSearchText(value) {
  return window.EmployeeNameUtils?.searchText?.(value) || vacationText(value).toLowerCase();
}

function isVacationPoolType(type) {
  return type === "vacation" || type === "on_demand";
}

function calculateRequestDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const diffDays = Math.floor((end.getTime() - start.getTime()) / 86400000);
  return diffDays >= 0 ? diffDays + 1 : 0;
}

function getVacationUsedDays(employeeName) {
  return getVacationRequests(employeeName)
    .filter((request) => request.status === "approved" && isVacationPoolType(request.type))
    .reduce((sum, request) => sum + vacationNumber(request.days), 0);
}

function getVacationPendingDays(employeeName) {
  return getVacationRequests(employeeName)
    .filter((request) => request.status === "pending" && isVacationPoolType(request.type))
    .reduce((sum, request) => sum + vacationNumber(request.days), 0);
}

function getVacationStatsForEmployee(employeeName) {
  const balance = getVacationBalance(employeeName);
  const totalPool = balance.base_days + balance.carryover_days + balance.extra_days;
  const usedDays = getVacationUsedDays(employeeName);
  const pendingDays = getVacationPendingDays(employeeName);
  return {
    balance,
    total_pool: totalPool,
    used_days: usedDays,
    pending_days: pendingDays,
    remaining_days: totalPool - usedDays,
    requests: getVacationRequests(employeeName),
  };
}

function isDateWithinRange(dateValue, startDate, endDate) {
  const date = new Date(dateValue);
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  if ([date, start, end].some((item) => Number.isNaN(item.getTime()))) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function vacationRangesOverlap(startA, endA, startB, endB) {
  const rangeAStart = new Date(startA);
  const rangeAEnd = new Date(endA || startA);
  const rangeBStart = new Date(startB);
  const rangeBEnd = new Date(endB || startB);
  if ([rangeAStart, rangeAEnd, rangeBStart, rangeBEnd].some((item) => Number.isNaN(item.getTime()))) return false;
  return rangeAStart.getTime() <= rangeBEnd.getTime() && rangeBStart.getTime() <= rangeAEnd.getTime();
}

function findVacationConflicts(employeeName, startDate, endDate, excludeRequestId = "") {
  return getVacationRequests(employeeName).filter((request) => {
    if (!request || request.id === excludeRequestId || request.status === "rejected") return false;
    return vacationRangesOverlap(startDate, endDate, request.start_date, request.end_date);
  });
}

function getApprovedVacationDaysExcluding(employeeName, excludeRequestId = "") {
  return getVacationRequests(employeeName)
    .filter((request) => {
      return request.id !== excludeRequestId && request.status === "approved" && isVacationPoolType(request.type);
    })
    .reduce((sum, request) => sum + vacationNumber(request.days), 0);
}

function getPlanningConflictsForRange(employeeName, startDate, endDate) {
  try {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(VACATION_PLANNING_STORAGE_KEY, null)
    : JSON.parse(window.localStorage.getItem(VACATION_PLANNING_STORAGE_KEY) || "null");
    const assignments = parsed?.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {};
    return Object.entries(assignments).flatMap(([dateValue, employees]) => {
      if (!vacationRangesOverlap(startDate, endDate, dateValue, dateValue)) return [];
      const assignment = employees?.[employeeName];
      if (!vacationText(assignment?.contract_name)) return [];
      return [{
        date: dateValue,
        contract_name: vacationText(assignment.contract_name),
      }];
    });
  } catch {
    return [];
  }
}

function getEmployeeAbsenceForDate(employeeName, dateValue) {
  const request = getVacationRequests(employeeName).find((item) => {
    return item.status === "approved" && isDateWithinRange(dateValue, item.start_date, item.end_date);
  });
  if (!request) return null;
  return {
    label: vacationTypeLabel(request.type),
    request,
    type: request.type,
  };
}

function resetVacationRequestForm() {
  vacationState.editingRequestId = "";
  document.getElementById("vacationRequestFormHeading").textContent = "Nowy wniosek / nieobecno\u015B\u0107";
  document.getElementById("saveVacationRequestButton").textContent = "Dodaj wniosek";
  if (vacationState.selectedEmployee) {
    document.getElementById("vacationRequestEmployeeSelect").value = vacationState.selectedEmployee;
  }
  document.getElementById("vacationTypeInput").value = "vacation";
  document.getElementById("vacationStartInput").value = "";
  document.getElementById("vacationEndInput").value = "";
  document.getElementById("vacationDaysInput").value = "";
  document.getElementById("vacationRequestedByInput").value = typeof window.getCurrentUser === "function"
    ? window.getCurrentUser()?.name || ""
    : "";
  document.getElementById("vacationNotesInput").value = "";
}

function fillVacationRequestForm(requestId) {
  const request = getVacationRequestById(requestId);
  if (!request) {
    resetVacationRequestForm();
    return;
  }

  vacationState.editingRequestId = request.id;
  vacationState.selectedEmployee = request.employee_name;
  document.getElementById("vacationRequestFormHeading").textContent = `Edycja wpisu: ${request.employee_name}`;
  document.getElementById("saveVacationRequestButton").textContent = "Zapisz zmiany";
  document.getElementById("vacationRequestEmployeeSelect").value = request.employee_name;
  document.getElementById("vacationTypeInput").value = request.type || "vacation";
  document.getElementById("vacationStartInput").value = request.start_date || "";
  document.getElementById("vacationEndInput").value = request.end_date || "";
  document.getElementById("vacationDaysInput").value = request.days || "";
  document.getElementById("vacationRequestedByInput").value = request.requested_by || "";
  document.getElementById("vacationNotesInput").value = request.notes || "";
}

function renderVacationSummary() {
  const target = document.getElementById("vacationSummaryStats");
  if (!target) return;

  const employees = getVacationEmployees();
  const requests = getVacationRequests();
  const totalRemaining = employees.reduce((sum, employee) => sum + getVacationStatsForEmployee(employee.name).remaining_days, 0);
  const pendingCount = requests.filter((request) => request.status === "pending").length;
  const approvedDays = requests
    .filter((request) => request.status === "approved" && isVacationPoolType(request.type))
    .reduce((sum, request) => sum + vacationNumber(request.days), 0);

  target.innerHTML = `
    <article class="stat"><span>Pracownicy</span><strong>${vacationEscape(String(employees.length))}</strong></article>
    <article class="stat"><span>Wnioski oczekuj\u0105ce</span><strong>${vacationEscape(String(pendingCount))}</strong></article>
    <article class="stat"><span>Dni zatwierdzone</span><strong>${vacationEscape(vacationValue(approvedDays))}</strong></article>
    <article class="stat"><span>Pozosta\u0142a pula</span><strong>${vacationEscape(vacationValue(totalRemaining))}</strong></article>
  `;
}

function renderVacationEmployeeSelect() {
  const select = document.getElementById("vacationRequestEmployeeSelect");
  if (!select) return;
  const employees = getVacationEmployees();
  select.innerHTML = employees.map((employee) => `
    <option value="${vacationEscape(employee.name)}"${employee.name === vacationState.selectedEmployee ? " selected" : ""}>
      ${vacationEscape(vacationDisplayName(employee))}
    </option>
  `).join("");
}

function renderVacationEmployeeTable() {
  const target = document.getElementById("vacationEmployeeTable");
  if (!target) return;

  const rows = getVacationEmployees()
    .filter((employee) => {
      if (!vacationState.search) return true;
      return vacationSearchText(employee).includes(vacationState.search.toLowerCase());
    })
    .map((employee) => {
      const stats = getVacationStatsForEmployee(employee.name);
      return {
        employee,
        stats,
        last_name: employee.last_name || "-",
        first_name: employee.first_name || "-",
        total_pool: stats.total_pool,
        used_days: stats.used_days,
        pending_days: stats.pending_days,
        remaining_days: stats.remaining_days,
      };
    });

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracownik\u00F3w dla podanego filtra.</p>";
    return;
  }

  ensureSelectedVacationEmployee();
  const sortState = vacationState.sorts?.employees || vacationDefaultSorts().employees;
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, vacationEmployeeColumnMap())
    : rows;
  target.innerHTML = `
    <table class="data-table invoice-module-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${vacationRenderHeader("Nazwisko", "vacationEmployees", "last_name", sortState)}</th>
          <th>${vacationRenderHeader("Imi\u0119", "vacationEmployees", "first_name", sortState)}</th>
          <th>${vacationRenderHeader("Pula", "vacationEmployees", "total_pool", sortState)}</th>
          <th>${vacationRenderHeader("Wykorzystane", "vacationEmployees", "used_days", sortState)}</th>
          <th>${vacationRenderHeader("Oczekuj\u0105ce", "vacationEmployees", "pending_days", sortState)}</th>
          <th>${vacationRenderHeader("Pozosta\u0142o", "vacationEmployees", "remaining_days", sortState)}</th>
          <th class="control-col">Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((row, index) => `
          <tr class="clickable-row${row.employee.name === vacationState.selectedEmployee ? " is-selected" : ""}" data-vacation-employee="${vacationEscape(row.employee.name)}">
            <td>${index + 1}</td>
            <td>${vacationEscape(row.last_name)}</td>
            <td>${vacationEscape(row.first_name)}</td>
            <td>${vacationEscape(vacationValue(row.total_pool))}</td>
            <td>${vacationEscape(vacationValue(row.used_days))}</td>
            <td>${vacationEscape(vacationValue(row.pending_days))}</td>
            <td>${vacationEscape(vacationValue(row.remaining_days))}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-vacation-open="${vacationEscape(row.employee.name)}">Edytuj</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderVacationEmployeeCard() {
  const heading = document.getElementById("vacationEmployeeHeading");
  const subline = document.getElementById("vacationEmployeeSubline");
  const statsTarget = document.getElementById("vacationBalanceStats");
  const historyTarget = document.getElementById("vacationEmployeeHistory");
  const employee = getVacationEmployees().find((item) => item.name === vacationState.selectedEmployee);

  if (!employee || !heading || !subline || !statsTarget || !historyTarget) {
    if (heading) heading.textContent = "Wybierz pracownika";
    if (subline) subline.textContent = "";
    if (statsTarget) statsTarget.innerHTML = "";
    if (historyTarget) historyTarget.innerHTML = "<p>Brak danych do wy\u015Bwietlenia.</p>";
    return;
  }

  const stats = getVacationStatsForEmployee(employee.name);
  heading.textContent = vacationDisplayName(employee);
  subline.textContent = `${employee.position || "Bez stanowiska"} | ${employee.status === "inactive" ? "Zako\u0144czone zatrudnienie" : "Aktywny"}`;

  document.getElementById("vacationBaseInput").value = stats.balance.base_days || "";
  document.getElementById("vacationCarryInput").value = stats.balance.carryover_days || "";
  document.getElementById("vacationExtraInput").value = stats.balance.extra_days || "";

  statsTarget.innerHTML = `
    <article class="stat"><span>Limit roczny</span><strong>${vacationEscape(vacationValue(stats.balance.base_days))}</strong></article>
    <article class="stat"><span>Urlop zaleg\u0142y</span><strong>${vacationEscape(vacationValue(stats.balance.carryover_days))}</strong></article>
    <article class="stat"><span>Dodatkowa pula</span><strong>${vacationEscape(vacationValue(stats.balance.extra_days))}</strong></article>
    <article class="stat"><span>Wykorzystane</span><strong>${vacationEscape(vacationValue(stats.used_days))}</strong></article>
    <article class="stat"><span>Oczekuj\u0105ce</span><strong>${vacationEscape(vacationValue(stats.pending_days))}</strong></article>
    <article class="stat"><span>Pozosta\u0142o</span><strong>${vacationEscape(vacationValue(stats.remaining_days))}</strong></article>
  `;

  historyTarget.innerHTML = stats.requests.length
    ? `
      <table class="entity-table module-table">
        <thead>
          <tr>
            <th>Lp.</th>
            <th>Rodzaj</th>
            <th>Od</th>
            <th>Do</th>
            <th>Dni</th>
            <th>Status</th>
            <th>Wprowadza</th>
            <th>Uwagi</th>
            <th>Akcje</th>
          </tr>
        </thead>
        <tbody>
          ${stats.requests.map((request, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${vacationEscape(vacationTypeLabel(request.type))}</td>
              <td>${vacationEscape(request.start_date || "-")}</td>
              <td>${vacationEscape(request.end_date || "-")}</td>
              <td>${vacationEscape(vacationValue(request.days))}</td>
              <td>${vacationEscape(vacationStatusLabel(request.status))}</td>
              <td>${vacationEscape(request.requested_by || "-")}</td>
              <td>${vacationEscape(request.notes || "-")}</td>
              <td class="action-cell">
                <button class="table-action-button" type="button" data-vacation-edit="${vacationEscape(request.id)}">Edytuj</button>
                <button class="table-action-button danger-button" type="button" data-vacation-delete="${vacationEscape(request.id)}">Usu\u0144</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Ten pracownik nie ma jeszcze wpis\u00F3w urlopowych.</p>";
}

function renderVacationApprovals() {
  const target = document.getElementById("vacationApprovalTable");
  if (!target) return;

  const canApprove = typeof window.canApproveVacationRequests === "function" ? window.canApproveVacationRequests() : true;
  const rows = getVacationRequests().map((request) => {
    const nameParts = vacationNameParts(request.employee_name);
    return {
      request,
      last_name: nameParts.lastName || "-",
      first_name: nameParts.firstName || "-",
      type: request.type || "",
      start_date: request.start_date || "",
      end_date: request.end_date || "",
      days: vacationNumber(request.days),
      status: request.status || "pending",
      requested_by: request.requested_by || "-",
    };
  });

  if (!rows.length) {
    target.innerHTML = "<p>Brak wniosk\u00f3w do wy\u015bwietlenia.</p>";
    return;
  }

  const sortState = vacationState.sorts?.approvals || vacationDefaultSorts().approvals;
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, vacationApprovalsColumnMap())
    : rows;

  target.innerHTML = `
    <table class="data-table invoice-module-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${vacationRenderHeader("Nazwisko", "vacationApprovals", "last_name", sortState)}</th>
          <th>${vacationRenderHeader("Imi\u0119", "vacationEmployees", "first_name", sortState)}</th>
          <th>${vacationRenderHeader("Rodzaj", "vacationApprovals", "type", sortState)}</th>
          <th>${vacationRenderHeader("Od", "vacationApprovals", "start_date", sortState)}</th>
          <th>${vacationRenderHeader("Do", "vacationApprovals", "end_date", sortState)}</th>
          <th>${vacationRenderHeader("Dni", "vacationApprovals", "days", sortState)}</th>
          <th>${vacationRenderHeader("Status", "vacationApprovals", "status", sortState)}</th>
          <th>${vacationRenderHeader("Wprowadza", "vacationApprovals", "requested_by", sortState)}</th>
          <th class="control-col">Akcje</th>
          <th class="control-col">Akceptacja</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((row, index) => {
          const request = row.request;
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${vacationEscape(row.last_name)}</td>
              <td>${vacationEscape(row.first_name)}</td>
              <td>${vacationEscape(vacationTypeLabel(request.type))}</td>
              <td>${vacationEscape(request.start_date || "-")}</td>
              <td>${vacationEscape(request.end_date || "-")}</td>
              <td>${vacationEscape(vacationValue(request.days))}</td>
              <td>${vacationEscape(vacationStatusLabel(request.status))}</td>
              <td>${vacationEscape(request.requested_by || "-")}</td>
              <td class="action-cell control-col">
                <button class="table-action-button" type="button" data-vacation-edit="${vacationEscape(request.id)}">Edytuj</button>
                <button class="table-action-button danger-button" type="button" data-vacation-delete="${vacationEscape(request.id)}">Usu\u0144</button>
              </td>
              <td class="action-cell control-col">
                ${canApprove && request.status === "pending" ? `
                  <button class="table-action-button success-button" type="button" data-vacation-action="approve" data-vacation-id="${vacationEscape(request.id)}">Zatwierd\u017a</button>
                  <button class="table-action-button danger-button" type="button" data-vacation-action="reject" data-vacation-id="${vacationEscape(request.id)}">Odrzu\u0107</button>
                ` : `<span class="table-muted">-</span>`}
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderVacationModule() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("vacationsView")) return;

  // Dev diagnostic: critical integration path (Kartoteka -> Urlopy).
  // If roster is empty, log raw sources to pinpoint runtime root cause quickly.
  try {
    const employees = getVacationEmployees();
    if (!employees.length) {
      const registry = vacationReadStore(VACATION_EMPLOYEE_STORAGE_KEY, []);
      const hours = vacationReadStore(VACATION_HOURS_STORAGE_KEY, null);
      console.warn("[Vacations] Empty employee roster", {
        hasGetEmployeeRoster: typeof window.getEmployeeRoster === "function",
        registryCount: Array.isArray(registry) ? registry.length : null,
        hoursEmployeesCount: hours && typeof hours === "object" && Array.isArray(hours.employees) ? hours.employees.length : null,
        storageKeyEmployees: VACATION_EMPLOYEE_STORAGE_KEY,
        storageKeyHours: VACATION_HOURS_STORAGE_KEY,
      });
    }
  } catch (error) {
    console.warn("[Vacations] Failed to evaluate employee sources", error);
  }

  ensureSelectedVacationEmployee();
  renderVacationSummary();
  renderVacationEmployeeSelect();
  renderVacationEmployeeTable();
  renderVacationEmployeeCard();
  renderVacationApprovals();
  if (vacationState.editingRequestId) {
    fillVacationRequestForm(vacationState.editingRequestId);
  } else {
    resetVacationRequestForm();
  }
}

function saveVacationBalance() {
  if (!vacationState.selectedEmployee) return;
  const store = loadVacationStore();
  store.balances[vacationState.selectedEmployee] = {
    base_days: vacationNumber(document.getElementById("vacationBaseInput").value),
    carryover_days: vacationNumber(document.getElementById("vacationCarryInput").value),
    extra_days: vacationNumber(document.getElementById("vacationExtraInput").value),
  };
  saveVacationStore(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Urlopy", "Zaktualizowano pul\u0119 urlopow\u0105.", vacationState.selectedEmployee, "");
  }
}

function saveVacationRequest() {
  const employeeName = vacationText(document.getElementById("vacationRequestEmployeeSelect").value);
  if (!employeeName) {
    window.alert("Wybierz pracownika.");
    return;
  }

  const startDate = vacationText(document.getElementById("vacationStartInput").value);
  const endDate = vacationText(document.getElementById("vacationEndInput").value || startDate);
  const inputDays = vacationNumber(document.getElementById("vacationDaysInput").value);
  const requestedBy = vacationText(document.getElementById("vacationRequestedByInput").value);
  const requestType = String(document.getElementById("vacationTypeInput").value || "vacation");

  if (!startDate) {
    window.alert("Podaj dat\u0119 rozpocz\u0119cia nieobecno\u015Bci.");
    return;
  }

  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    window.alert("Data ko\u0144cowa nie mo\u017Ce by\u0107 wcze\u015Bniejsza ni\u017C data pocz\u0105tkowa.");
    return;
  }

  const calculatedDays = inputDays || calculateRequestDays(startDate, endDate);
  if (calculatedDays <= 0) {
    window.alert("Liczba dni musi by\u0107 wi\u0119ksza od zera.");
    return;
  }

  const store = loadVacationStore();
  const existing = store.requests.find((request) => request.id === vacationState.editingRequestId);
  const conflicts = findVacationConflicts(employeeName, startDate, endDate, existing?.id || "");
  if (conflicts.length) {
    const conflictLabel = conflicts
      .slice(0, 3)
      .map((request) => `${request.start_date} - ${request.end_date} (${vacationTypeLabel(request.type)} / ${vacationStatusLabel(request.status)})`)
      .join("\n- ");
    window.alert(`Ten zakres koliduje ju\u017C z innym wpisem dla pracownika:\n- ${conflictLabel}`);
    return;
  }

  if (isVacationPoolType(requestType)) {
    const balance = getVacationBalance(employeeName);
    const totalPool = balance.base_days + balance.carryover_days + balance.extra_days;
    if (calculatedDays > totalPool) {
      window.alert("Wniosek przekracza \u0142\u0105czn\u0105 pul\u0119 urlopow\u0105 pracownika.");
      return;
    }
  }

  const payload = {
    employee_name: employeeName,
    type: requestType,
    start_date: startDate,
    end_date: endDate,
    days: calculatedDays,
    status: existing?.status || "pending",
    requested_by: requestedBy || (typeof window.getCurrentUser === "function" ? window.getCurrentUser()?.name || "" : ""),
    notes: vacationText(document.getElementById("vacationNotesInput").value),
    created_at: existing?.created_at || new Date().toISOString(),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    store.requests.push({ id: `vac-${Date.now()}`, ...payload });
  }

  saveVacationStore(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Urlopy",
      existing ? "Zaktualizowano wniosek" : "Dodano wniosek",
      `${employeeName} / ${vacationTypeLabel(payload.type)}`,
      `${payload.start_date} - ${payload.end_date}`
    );
  }
  if (!existing && typeof window.pushNotification === "function") {
    window.pushNotification(
      "vacation",
      "Nowy wniosek urlopowy",
      `${requestedBy || "U\u017Cytkownik"} doda\u0142 wniosek dla ${employeeName}.`,
      { viewId: "vacationsView", employeeName }
    );
  }

  vacationState.selectedEmployee = employeeName;
  resetVacationRequestForm();
  renderVacationModule();
}

function updateVacationRequestStatus(requestId, status) {
  const request = getVacationRequestById(requestId);
  if (!request) return;
  const canApprove = typeof window.canApproveVacationRequests === "function" ? window.canApproveVacationRequests() : true;
  if (!canApprove) {
    window.alert("To konto nie ma uprawnie\u0144 do akceptacji urlop\u00F3w.");
    return;
  }

  const store = loadVacationStore();
  const entry = store.requests.find((item) => item.id === requestId);
  if (!entry) return;

  if (status === "approved") {
    const conflicts = findVacationConflicts(entry.employee_name, entry.start_date, entry.end_date, entry.id);
    if (conflicts.length) {
      window.alert("Nie mo\u017Cna zatwierdzi\u0107 wniosku, bo termin koliduje z innym wpisem pracownika.");
      return;
    }

    if (isVacationPoolType(entry.type)) {
      const balance = getVacationBalance(entry.employee_name);
      const totalPool = balance.base_days + balance.carryover_days + balance.extra_days;
      const approvedDays = getApprovedVacationDaysExcluding(entry.employee_name, entry.id);
      if (approvedDays + vacationNumber(entry.days) > totalPool) {
        window.alert("Nie mo\u017Cna zatwierdzi\u0107 wniosku, bo przekroczy dost\u0119pn\u0105 pul\u0119 urlopow\u0105.");
        return;
      }
    }

    const planningConflicts = getPlanningConflictsForRange(entry.employee_name, entry.start_date, entry.end_date);
    if (planningConflicts.length) {
      const datesLabel = planningConflicts
        .slice(0, 3)
        .map((item) => `${item.date} (${item.contract_name})`)
        .join("\n- ");
      window.alert(`Usu\u0144 najpierw przypisania z planowania dla tego pracownika:\n- ${datesLabel}`);
      return;
    }
  }

  entry.status = status;
  saveVacationStore(store);

  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Urlopy",
      status === "approved" ? "Zatwierdzono wniosek" : "Odrzucono wniosek",
      `${entry.employee_name} / ${vacationTypeLabel(entry.type)}`,
      `${entry.start_date} - ${entry.end_date}`
    );
  }

  if (typeof window.pushNotification === "function") {
    window.pushNotification(
      "vacation",
      status === "approved" ? "Wniosek zatwierdzony" : "Wniosek odrzucony",
      `${entry.employee_name}: ${vacationTypeLabel(entry.type)} (${entry.start_date} - ${entry.end_date}).`,
      { viewId: "vacationsView", employeeName: entry.employee_name }
    );
  }
}

function deleteVacationRequest(requestId) {
  const request = getVacationRequestById(requestId);
  if (!request) return;
  if (!window.confirm(`Czy na pewno chcesz usun\u0105\u0107 wpis urlopowy pracownika ${request.employee_name}?`)) return;

  const store = loadVacationStore();
  store.requests = store.requests.filter((item) => item.id !== requestId);
  saveVacationStore(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Urlopy", "Usuni\u0119to wpis urlopowy", `${request.employee_name} / ${vacationTypeLabel(request.type)}`, "");
  }
  if (vacationState.editingRequestId === requestId) {
    resetVacationRequestForm();
  }
  renderVacationModule();
}

function initVacationsView() {
  if (vacationState.initialized || !document.getElementById("vacationsView")) return;

  ensureSelectedVacationEmployee();
  if (!vacationState.sorts) {
    vacationState.sorts = vacationLoadSorts();
  }
  document.getElementById("newVacationRequestButton")?.addEventListener("click", resetVacationRequestForm);
  document.getElementById("vacationEmployeeSearchInput")?.addEventListener("input", (event) => {
    vacationState.search = String(event.target.value || "");
    renderVacationEmployeeTable();
  });
  document.getElementById("vacationEmployeeTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='vacationEmployees']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      vacationState.sorts = vacationState.sorts || vacationDefaultSorts();
      vacationState.sorts.employees = window.ClodeTableUtils.nextSort(
        vacationState.sorts.employees || vacationDefaultSorts().employees,
        sortButton.dataset.sortKey,
        vacationEmployeeColumnMap()
      );
      vacationSaveSorts();
      renderVacationEmployeeTable();
      return;
    }

    const openButton = event.target.closest("[data-vacation-open]");
    if (openButton) {
      vacationState.selectedEmployee = openButton.dataset.vacationOpen;
      renderVacationModule();
      return;
    }
    const row = event.target.closest("[data-vacation-employee]");
    if (!row) return;
    vacationState.selectedEmployee = row.dataset.vacationEmployee;
    renderVacationModule();
  });
  document.getElementById("saveVacationBalanceButton")?.addEventListener("click", saveVacationBalance);
  document.getElementById("saveVacationRequestButton")?.addEventListener("click", saveVacationRequest);
  document.getElementById("vacationApprovalTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='vacationApprovals']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      vacationState.sorts = vacationState.sorts || vacationDefaultSorts();
      vacationState.sorts.approvals = window.ClodeTableUtils.nextSort(
        vacationState.sorts.approvals || vacationDefaultSorts().approvals,
        sortButton.dataset.sortKey,
        vacationApprovalsColumnMap()
      );
      vacationSaveSorts();
      renderVacationApprovals();
      return;
    }

    const editButton = event.target.closest("[data-vacation-edit]");
    if (editButton) {
      fillVacationRequestForm(editButton.dataset.vacationEdit);
      renderVacationModule();
      return;
    }
    const actionButton = event.target.closest("[data-vacation-action][data-vacation-id]");
    if (!actionButton) return;
    if (actionButton.dataset.vacationAction === "approve") updateVacationRequestStatus(actionButton.dataset.vacationId, "approved");
    if (actionButton.dataset.vacationAction === "reject") updateVacationRequestStatus(actionButton.dataset.vacationId, "rejected");
    if (actionButton.dataset.vacationAction === "delete") deleteVacationRequest(actionButton.dataset.vacationId);
  });
  document.getElementById("vacationEmployeeHistory")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-vacation-edit]");
    if (editButton) {
      fillVacationRequestForm(editButton.dataset.vacationEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-vacation-delete]");
    if (deleteButton) {
      deleteVacationRequest(deleteButton.dataset.vacationDelete);
    }
  });

  window.addEventListener("employee-registry-updated", renderVacationModule);
  window.addEventListener("vacation-registry-updated", renderVacationModule);
  window.addEventListener("settings-updated", renderVacationModule);
  window.addEventListener("current-user-changed", renderVacationModule);
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "vacationsView") renderVacationModule();
  });

  vacationState.initialized = true;
  renderVacationModule();
}

window.getEmployeeAbsenceForDate = getEmployeeAbsenceForDate;
window.getVacationStatsForEmployee = getVacationStatsForEmployee;
window.getVacationRequestsByEmployee = getVacationRequests;
window.renderVacationsModule = renderVacationModule;
window.getVacationEmployees = getVacationEmployees;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVacationsView);
} else {
  initVacationsView();
}
