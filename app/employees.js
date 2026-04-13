const EMPLOYEE_STORAGE_KEY = "clodeEmployeeRegistryV1";
const EMPLOYEE_HOURS_STORAGE_KEY = "clodeHoursRegistryV2";
const EMPLOYEE_WORKWEAR_STORAGE_KEY = "clodeWorkwearRegistryV1";
const EMPLOYEE_VACATION_STORAGE_KEY = "clodeVacationRegistryV1";
const EMPLOYEE_PLANNING_STORAGE_KEY = "clodePlanningRegistryV1";
const EMPLOYEE_TABLE_SORT_KEY = "clodeEmployeesTableSortV1";

const employeeViewState = window.__clodeEmployeeViewState || {
  selectedName: "",
  search: "",
  editingName: "",
  initialized: false,
  sort: null,
};

window.__clodeEmployeeViewState = employeeViewState;
employeeViewState.pdfOptions = employeeViewState.pdfOptions || {
  identity: true,
  contact: true,
  summary: true,
  medical: true,
  history: true,
};

function clodePrintBaseCss() {
  return `
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0; font-size: 26px; }
    h2 { margin: 0 0 12px; font-size: 16px; }
    .header { margin-bottom: 24px; }
    .header p { margin: 10px 0 0; color: #555; font-size: 12px; }
    .print-section { margin-top: 20px; }
    .meta-grid, .stats-grid, .meta { display: grid; gap: 10px; }
    .meta-grid, .stats-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .meta { grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 18px 0 22px; }
    .meta-grid div, .stats-grid div, .meta div { padding: 10px 12px; border: 1px solid #d9d9d9; border-radius: 10px; }
    span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 6px; }
    strong { font-size: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #d8d8d8; text-align: left; vertical-align: top; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; white-space: nowrap; }
  `.trim();
}

window.ClodePrintUtils = window.ClodePrintUtils || {};
window.ClodePrintUtils.baseCss = window.ClodePrintUtils.baseCss || clodePrintBaseCss;

const employeeMoneyFormatter = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const employeeNumberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});

function employeeEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function employeeNormalize(value) {
  return employeeRepairMojibake(String(value || "")).trim().replace(/\s+/g, " ");
}

function employeeRepairMojibake(value) {
  const text = String(value || "");
  if (!/[ÅÄÃâ]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function employeeSplitName(value) {
  const parts = window.EmployeeNameUtils?.split?.(value);
  if (parts) {
    return { first_name: parts.firstName, last_name: parts.lastName };
  }
  const normalized = employeeNormalize(value);
  if (!normalized) return { first_name: "", last_name: "" };
  const [last_name, ...firstNameParts] = normalized.split(" ");
  return {
    first_name: firstNameParts.join(" "),
    last_name,
  };
}

function employeeComposeName(firstName, lastName) {
  return window.EmployeeNameUtils?.compose?.(firstName, lastName) || employeeNormalize([lastName, firstName].filter(Boolean).join(" "));
}

function employeeDisplayName(employee) {
  return window.EmployeeNameUtils?.display?.(employee) || employeeComposeName(employee?.first_name, employee?.last_name) || employee?.name || "";
}

function employeeSearchText(employee) {
  return window.EmployeeNameUtils?.searchText?.(employee) || employeeNormalize(employee?.name || "").toLowerCase();
}

function employeeCompare(left, right) {
  return window.EmployeeNameUtils?.compare?.(left, right) || String(left?.name || "").localeCompare(String(right?.name || ""), "pl", {
    sensitivity: "base",
    numeric: true,
  });
}

function employeeNumber(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function employeeReadStore(storageKey, fallbackValue) {
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

function employeeWriteStore(storageKey, value, eventName = "") {
  if (window.ClodeDataAccess?.legacy) {
    return window.ClodeDataAccess.legacy.write(storageKey, value, eventName ? { eventName } : {});
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
  if (eventName) {
    window.dispatchEvent(new CustomEvent(eventName));
  }
  return value;
}

function employeeMoney(value) {
  return employeeMoneyFormatter.format(employeeNumber(value));
}

function employeeValue(value) {
  return employeeNumberFormatter.format(employeeNumber(value));
}

function employeeDefaultSort() {
  return { key: "last_name", direction: "asc" };
}

function employeeLoadSort() {
  const fallback = employeeDefaultSort();
  const parsed = employeeReadStore(EMPLOYEE_TABLE_SORT_KEY, null);
  if (!parsed || typeof parsed !== "object") return fallback;
  const key = String(parsed.key || "").trim();
  const direction = String(parsed.direction || "").trim().toLowerCase();
  if (!key) return fallback;
  if (direction !== "asc" && direction !== "desc") return fallback;
  return { key, direction };
}

function employeeSaveSort() {
  employeeWriteStore(EMPLOYEE_TABLE_SORT_KEY, employeeViewState.sort || employeeDefaultSort());
}

function employeeRegistryColumnMap() {
  return {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.last_name || "" },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.first_name || "" },
    status: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.status || "") },
    position: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.position || "") },
    medical_exam_valid_until: { type: "date", defaultDirection: "asc", getValue: (row) => row.medical_exam_valid_until || "" },
    medical_days_remaining: { type: "number", defaultDirection: "asc", getValue: (row) => Number(row.medical_days_remaining ?? 999999) },
    worker_code: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.worker_code || "") },
    employment_date: { type: "date", defaultDirection: "asc", getValue: (row) => row.employment_date || "" },
    months_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.months_count || 0) },
    projects_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.projects_count || 0) },
    total_cost: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.total_cost || 0) },
  };
}

function employeeRenderHeader(label, key, sortState) {
  if (!window.ClodeTableUtils?.renderHeader) return employeeEscape(label);
  return window.ClodeTableUtils.renderHeader(label, "employeeRegistry", key, sortState);
}

function legacyEmployeeStatusLabel(status) {
  return status === "inactive" ? "Zakończone zatrudnienie" : "Aktywny";
}

function legacyEmployeeDefaultFinance() {
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

function employeeDateText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "-";
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return new Intl.DateTimeFormat("pl-PL").format(parsed);
}

function employeeMedicalStatus(validUntil) {
  const normalized = String(validUntil || "").trim();
  if (!normalized) {
    return { daysRemaining: null, daysText: "-", label: "Brak terminu" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return { daysRemaining: null, daysText: "-", label: "Brak terminu" };
  }

  const daysRemaining = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (daysRemaining < 0) {
    return { daysRemaining, daysText: `${Math.abs(daysRemaining)} dni po terminie`, label: "Po terminie" };
  }
  if (daysRemaining === 0) {
    return { daysRemaining, daysText: "Dzisiaj", label: "Badanie dzisiaj" };
  }
  return {
    daysRemaining,
    daysText: `${daysRemaining} dni`,
    label: daysRemaining <= 30 ? "Termin blisko" : "Aktualne",
  };
}

function employeeDefaultFinance() {
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

function loadEmployeeRegistry() {
  const parsed = employeeReadStore(EMPLOYEE_STORAGE_KEY, []);
  return Array.isArray(parsed) ? parsed : [];
}

function saveEmployeeRegistry(registry) {
  employeeWriteStore(EMPLOYEE_STORAGE_KEY, registry, "employee-registry-updated");
}

async function persistEmployeeRegistry(registry) {
  if (window.ClodeDataAccess?.repositories?.employees?.save) {
    await window.ClodeDataAccess.repositories.employees.save(registry, {
      eventName: "employee-registry-updated",
    });
    return;
  }
  saveEmployeeRegistry(registry);
}

async function reloadEmployeeRegistryFromBackend() {
  if (!window.ClodeDataAccess?.repositories?.employees?.load) {
    return loadEmployeeRegistry();
  }
  const refreshed = await window.ClodeDataAccess.repositories.employees.load([]);
  return Array.isArray(refreshed) ? refreshed : [];
}

function loadEmployeeHoursSnapshot() {
  const parsed = employeeReadStore(EMPLOYEE_HOURS_STORAGE_KEY, null);
  if (parsed && typeof parsed === "object" && parsed.months) {
    return parsed;
  }
  return {
    employees: [],
    months: {},
  };
}

function getEmployeeRoster() {
  const registry = loadEmployeeRegistry();
  const snapshot = loadEmployeeHoursSnapshot();
  const employees = new Map();

  (snapshot.employees || []).forEach((employee) => {
    const name = employeeNormalize(employee?.name);
    if (!name) return;
    employees.set(name, {
      name,
      ...employeeSplitName(name),
      worker_code: employeeNormalize(employee?.worker_code),
      position: "",
      status: "active",
      employment_date: "",
      employment_end_date: "",
      street: "",
      city: "",
      phone: "",
      medical_exam_date: "",
      medical_exam_valid_until: "",
    });
  });

  registry.forEach((employee) => {
    const name = employeeNormalize(employee?.name);
    if (!name) return;
    employees.set(name, {
      ...(employees.get(name) || { name, worker_code: "" }),
      first_name: employeeNormalize(employee?.first_name) || employeeSplitName(name).first_name,
      last_name: employeeNormalize(employee?.last_name) || employeeSplitName(name).last_name,
      position: employeeNormalize(employee?.position),
      status: String(employee?.status || "active") === "inactive" ? "inactive" : "active",
      employment_date: String(employee?.employment_date || "").trim(),
      employment_end_date: String(employee?.employment_end_date || "").trim(),
      street: employeeNormalize(employee?.street),
      city: employeeNormalize(employee?.city),
      phone: employeeNormalize(employee?.phone),
      medical_exam_date: String(employee?.medical_exam_date || "").trim(),
      medical_exam_valid_until: String(employee?.medical_exam_valid_until || "").trim(),
    });
  });

  return [...employees.values()].sort(employeeCompare);
}

function getActiveEmployeeRoster() {
  return getEmployeeRoster().filter((employee) => employee.status !== "inactive");
}

function getEmployeeProfileByName(name) {
  return getEmployeeRoster().find((employee) => employee.name === name) || null;
}

function getEmployeeRegistrySnapshot() {
  return getEmployeeRoster();
}

function calculateMonthRh(month) {
  const workers = month?.workers || [];
  const totalHours = workers.reduce((sum, worker) => {
    return sum + Object.values(worker.project_hours || {}).reduce((innerSum, value) => innerSum + employeeNumber(value), 0);
  }, 0);

  if (!totalHours) return 0;

  const finance = { ...employeeDefaultFinance(), ...(month?.finance || {}) };
  const totalCosts =
    employeeNumber(finance.zus_company_1) +
    employeeNumber(finance.zus_company_2) +
    employeeNumber(finance.zus_company_3) +
    employeeNumber(finance.pit4_company_1) +
    employeeNumber(finance.pit4_company_2) +
    employeeNumber(finance.pit4_company_3);

  return (employeeNumber(finance.payouts) / totalHours) + (totalCosts / totalHours);
}

function buildEmployeeMonthlyRows(employeeName) {
  const snapshot = loadEmployeeHoursSnapshot();
  return Object.values(snapshot.months || {})
    .map((month) => {
      const worker = (month.workers || []).find((item) => item.employee_name === employeeName);
      const hours = Object.values(worker?.project_hours || {}).reduce((sum, value) => sum + employeeNumber(value), 0);
      const contracts = Object.entries(worker?.project_hours || {})
        .filter(([, value]) => employeeNumber(value) > 0)
        .map(([contractName]) => (
          typeof window.getContractReportLabelByName === "function"
            ? window.getContractReportLabelByName(contractName)
            : contractName
        ));
      const rh = hours ? calculateMonthRh(month) : 0;
      return {
        month_key: month.month_key,
        month_label: month.month_label || month.month_key,
        hours,
        rh,
        employer_cost: hours * rh,
        contracts,
      };
    })
    .filter((row) => row.hours > 0)
    .sort((left, right) => left.month_key.localeCompare(right.month_key, "pl", { numeric: true }));
}

function legacyResetEmployeeFormV1() {
  employeeViewState.editingName = "";
  document.getElementById("employeeFormHeading").textContent = "Dane pracownika";
  document.getElementById("saveEmployeeButton").textContent = "Zapisz pracownika";
  document.getElementById("employeeFirstNameInput").value = "";
  document.getElementById("employeeLastNameInput").value = "";
  document.getElementById("employeePositionInput").value = "";
  document.getElementById("employeeStartDateInput").value = "";
  document.getElementById("employeeStatusInput").value = "active";
  document.getElementById("employeeEndDateInput").value = "";
  document.getElementById("employeeStreetInput").value = "";
  document.getElementById("employeeCityInput").value = "";
  document.getElementById("employeePhoneInput").value = "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = "";
}

function legacyFillEmployeeFormV1(employeeName) {
  const employee = getEmployeeProfileByName(employeeName);
  if (!employee) {
    resetEmployeeForm();
    return;
  }

  employeeViewState.editingName = employee.name;
  document.getElementById("employeeFormHeading").textContent = `Edycja pracownika: ${employee.name}`;
  document.getElementById("saveEmployeeButton").textContent = "Zapisz zmiany";
  document.getElementById("employeeFirstNameInput").value = employee.first_name || "";
  document.getElementById("employeeLastNameInput").value = employee.last_name || "";
  document.getElementById("employeePositionInput").value = employee.position || "";
  document.getElementById("employeeStartDateInput").value = employee.employment_date || "";
  document.getElementById("employeeStatusInput").value = employee.status || "active";
  document.getElementById("employeeEndDateInput").value = employee.employment_end_date || "";
  document.getElementById("employeeStreetInput").value = employee.street || "";
  document.getElementById("employeeCityInput").value = employee.city || "";
  document.getElementById("employeePhoneInput").value = employee.phone || "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = employee.medical_exam_valid_until || "";
}

function renameEmployeeReferences(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;

  const hours = employeeReadStore(EMPLOYEE_HOURS_STORAGE_KEY, null);
  if (hours?.employees) {
    (hours.employees || []).forEach((employee) => {
      if (employee.name === oldName) employee.name = newName;
    });
    Object.values(hours.months || {}).forEach((month) => {
      (month.workers || []).forEach((worker) => {
        if (worker.employee_name === oldName) worker.employee_name = newName;
      });
    });
    hours.excluded_employees = (hours.excluded_employees || []).map((name) => (name === oldName ? newName : name));
    employeeWriteStore(EMPLOYEE_HOURS_STORAGE_KEY, hours, "hours-registry-updated");
  }

  const workwear = employeeReadStore(EMPLOYEE_WORKWEAR_STORAGE_KEY, []);
  workwear.forEach((entry) => {
    if (entry.employee_name === oldName) entry.employee_name = newName;
  });
  employeeWriteStore(EMPLOYEE_WORKWEAR_STORAGE_KEY, workwear, "workwear-registry-updated");

  const vacation = employeeReadStore(EMPLOYEE_VACATION_STORAGE_KEY, null);
  if (vacation && typeof vacation === "object") {
    if (vacation.balances?.[oldName]) {
      vacation.balances[newName] = vacation.balances[oldName];
      delete vacation.balances[oldName];
    }
    (vacation.requests || []).forEach((entry) => {
      if (entry.employee_name === oldName) entry.employee_name = newName;
    });
    employeeWriteStore(EMPLOYEE_VACATION_STORAGE_KEY, vacation, "vacation-registry-updated");
  }

  const planning = employeeReadStore(EMPLOYEE_PLANNING_STORAGE_KEY, null);
  if (planning?.assignments) {
    Object.keys(planning.assignments).forEach((dateKey) => {
      if (planning.assignments[dateKey]?.[oldName]) {
        planning.assignments[dateKey][newName] = planning.assignments[dateKey][oldName];
        delete planning.assignments[dateKey][oldName];
      }
    });
    employeeWriteStore(EMPLOYEE_PLANNING_STORAGE_KEY, planning, "planning-registry-updated");
  }
}

function removeEmployeeReferences(name) {
  if (!name) return;

  if (typeof window.removeEmployeeFromHoursData === "function") {
    window.removeEmployeeFromHoursData(name);
  }

  const workwear = employeeReadStore(EMPLOYEE_WORKWEAR_STORAGE_KEY, []);
  employeeWriteStore(
    EMPLOYEE_WORKWEAR_STORAGE_KEY,
    workwear.filter((entry) => entry.employee_name !== name),
    "workwear-registry-updated"
  );

  const vacation = employeeReadStore(EMPLOYEE_VACATION_STORAGE_KEY, null);
  if (vacation && typeof vacation === "object") {
    delete vacation.balances?.[name];
    vacation.requests = (vacation.requests || []).filter((entry) => entry.employee_name !== name);
    employeeWriteStore(EMPLOYEE_VACATION_STORAGE_KEY, vacation, "vacation-registry-updated");
  }

  const planning = employeeReadStore(EMPLOYEE_PLANNING_STORAGE_KEY, null);
  if (planning?.assignments) {
    Object.keys(planning.assignments).forEach((dateKey) => {
      delete planning.assignments[dateKey]?.[name];
    });
    employeeWriteStore(EMPLOYEE_PLANNING_STORAGE_KEY, planning, "planning-registry-updated");
  }
}

function legacyRenderEmployeeRegistryTableV1() {
  const target = document.getElementById("employeeRegistryTable");
  if (!target) return;

  const query = employeeViewState.search.toLowerCase();
  const rows = getEmployeeRoster()
    .map((employee) => {
      const months = buildEmployeeMonthlyRows(employee.name);
      return {
        ...employee,
        months_count: months.length,
        total_cost: months.reduce((sum, month) => sum + month.employer_cost, 0),
        projects_count: new Set(months.flatMap((month) => month.contracts)).size,
      };
    })
    .filter((employee) => employeeSearchText(employee).includes(query));

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracowników dla podanego filtra.</p>";
    return;
  }

  if (!rows.some((employee) => employee.name === employeeViewState.selectedName)) {
    employeeViewState.selectedName = rows[0].name;
  }

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Nazwisko</th>
          <th>Imię</th>
          <th>Status</th>
          <th>Stanowisko</th>
          <th>Kod</th>
          <th>Zatrudniony od</th>
          <th>Miesiące</th>
          <th>Inwestycje</th>
          <th>Koszt łączny</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((employee, index) => `
          <tr class="clickable-row${employee.name === employeeViewState.selectedName ? " is-selected" : ""}" data-employee-name="${employeeEscape(employee.name)}">
            <td>${index + 1}</td>
            <td>${employeeEscape(employee.last_name || "-")}</td>
            <td>${employeeEscape(employee.first_name || "-")}</td>
            <td>${employeeEscape(employeeStatusLabel(employee.status))}</td>
            <td>${employeeEscape(employee.position || "-")}</td>
            <td>${employeeEscape(employee.worker_code || "-")}</td>
            <td>${employeeEscape(employee.employment_date || "-")}</td>
            <td>${employeeEscape(String(employee.months_count))}</td>
            <td>${employeeEscape(String(employee.projects_count))}</td>
            <td>${employeeEscape(employeeMoney(employee.total_cost))}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-employee-edit="${employeeEscape(employee.name)}">Edytuj</button>
              <button class="table-action-button danger-button" type="button" data-employee-delete="${employeeEscape(employee.name)}">Usuń</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function legacyRenderEmployeeCardV1() {
  const target = document.getElementById("employeeCardView");
  if (!target) return;

  const employee = getEmployeeProfileByName(employeeViewState.selectedName);
  if (!employee) {
    target.innerHTML = "<p>Wybierz pracownika ze spisu.</p>";
    return;
  }

  const months = buildEmployeeMonthlyRows(employee.name);
  const totalCost = months.reduce((sum, month) => sum + month.employer_cost, 0);
  const totalProjects = new Set(months.flatMap((month) => month.contracts)).size;

  target.innerHTML = `
    <div class="record-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Karta pracownika</p>
          <h2>${employeeEscape(employeeDisplayName(employee) || employee.name)}</h2>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div><span>Status</span><strong>${employeeEscape(employeeStatusLabel(employee.status))}</strong></div>
        <div><span>Stanowisko</span><strong>${employeeEscape(employee.position || "-")}</strong></div>
        <div><span>Zatrudniony od</span><strong>${employeeEscape(employee.employment_date || "-")}</strong></div>
        <div><span>Zakończenie pracy</span><strong>${employeeEscape(employee.employment_end_date || "-")}</strong></div>
        <div><span>Adres</span><strong>${employeeEscape(employee.street || "-")}</strong></div>
        <div><span>Kod i miejscowość</span><strong>${employeeEscape(employee.city || "-")}</strong></div>
        <div><span>Telefon</span><strong>${employeeEscape(employee.phone || "-")}</strong></div>
      </div>
      <div class="stats-grid compact-stats-grid section-grid metrics-grid--3 employee-summary-stats">
        <article class="stat"><span>Przepracowane miesiące</span><strong>${employeeEscape(String(months.length))}</strong></article>
        <article class="stat"><span>Suma inwestycji</span><strong>${employeeEscape(String(totalProjects))}</strong></article>
        <article class="stat"><span>Łączny koszt wynagrodzeń</span><strong>${employeeEscape(employeeMoney(totalCost))}</strong></article>
      </div>
      <div class="form-table-shell">
        <table class="compact-summary-table">
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Godziny</th>
              <th>Roboczogodzina</th>
              <th>Koszt wynagrodzeń</th>
              <th>Kontrakty</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((month) => `
              <tr>
                <td>${employeeEscape(month.month_label)}</td>
                <td>${employeeEscape(employeeValue(month.hours))}</td>
                <td>${employeeEscape(employeeMoney(month.rh))}</td>
                <td>${employeeEscape(employeeMoney(month.employer_cost))}</td>
                <td>${employeeEscape(month.contracts.join(", ") || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderEmployeeModule() {
  renderEmployeeRegistryTable();
  renderEmployeeCard();
  if (employeeViewState.editingName) {
    fillEmployeeForm(employeeViewState.editingName);
  } else {
    resetEmployeeForm();
  }
}

function renderEmployeeModuleIfActive() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("employeesView")) return;
  renderEmployeeModule();
}

function legacySaveEmployeeFromFormV1() {
  const firstName = employeeNormalize(document.getElementById("employeeFirstNameInput").value);
  const lastName = employeeNormalize(document.getElementById("employeeLastNameInput").value);
  const name = employeeComposeName(firstName, lastName);
  if (!firstName || !lastName) {
    window.alert("Podaj imię i nazwisko pracownika.");
    return;
  }

  const registry = loadEmployeeRegistry();
  const originalName = employeeViewState.editingName || name;
  const existing = registry.find((employee) => employee.name === originalName);
  const conflict = registry.find((employee) => employee.name === name && employee.name !== originalName);
  if (conflict) {
    window.alert("Pracownik o tej nazwie już istnieje.");
    return;
  }

  const status = String(document.getElementById("employeeStatusInput").value || "active");
  const providedEndDate = String(document.getElementById("employeeEndDateInput").value || "");
  const payload = {
    name,
    first_name: firstName,
    last_name: lastName,
    position: employeeNormalize(document.getElementById("employeePositionInput").value),
    status,
    employment_date: String(document.getElementById("employeeStartDateInput").value || ""),
    employment_end_date: status === "inactive"
      ? (providedEndDate || new Date().toISOString().slice(0, 10))
      : providedEndDate,
    street: employeeNormalize(document.getElementById("employeeStreetInput").value),
    city: employeeNormalize(document.getElementById("employeeCityInput").value),
    phone: employeeNormalize(document.getElementById("employeePhoneInput").value),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    registry.push(payload);
  }

  if (originalName !== name) {
    renameEmployeeReferences(originalName, name);
  }

  saveEmployeeRegistry(registry);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Kadry",
      existing ? "Zaktualizowano pracownika" : "Dodano pracownika",
      name,
      payload.position ? `Stanowisko: ${payload.position}` : ""
    );
  }

  employeeViewState.selectedName = name;
  employeeViewState.editingName = name;
  renderEmployeeModuleIfActive();
}

function legacyDeleteEmployeeFromRegistryV1(employeeNameArg = "") {
  const formName = employeeComposeName(
    document.getElementById("employeeFirstNameInput")?.value,
    document.getElementById("employeeLastNameInput")?.value
  );
  const name = employeeNormalize(employeeNameArg || formName || employeeViewState.selectedName);
  if (!name) return;
  if (!window.confirm(`Czy na pewno chcesz usunąć pracownika ${name}?`)) return;

  removeEmployeeReferences(name);
  saveEmployeeRegistry(loadEmployeeRegistry().filter((employee) => employee.name !== name));
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Kadry", "Usunięto pracownika", name, "");
  }

  const roster = getEmployeeRoster().filter((employee) => employee.name !== name);
  employeeViewState.selectedName = roster[0]?.name || "";
  employeeViewState.editingName = "";
  renderEmployeeModuleIfActive();
}

function legacyResetEmployeeFormV2() {
  employeeViewState.editingName = "";
  document.getElementById("employeeFormHeading").textContent = "Dane pracownika";
  document.getElementById("saveEmployeeButton").textContent = "Zapisz pracownika";
  document.getElementById("employeeFirstNameInput").value = "";
  document.getElementById("employeeLastNameInput").value = "";
  document.getElementById("employeePositionInput").value = "";
  document.getElementById("employeeStartDateInput").value = "";
  document.getElementById("employeeStatusInput").value = "active";
  document.getElementById("employeeEndDateInput").value = "";
  document.getElementById("employeeStreetInput").value = "";
  document.getElementById("employeeCityInput").value = "";
  document.getElementById("employeePhoneInput").value = "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = "";
}

function legacyFillEmployeeFormV2(employeeName) {
  const employee = getEmployeeProfileByName(employeeName);
  if (!employee) {
    resetEmployeeForm();
    return;
  }

  employeeViewState.editingName = employee.name;
  document.getElementById("employeeFormHeading").textContent = `Edycja pracownika: ${employee.name}`;
  document.getElementById("saveEmployeeButton").textContent = "Zapisz zmiany";
  document.getElementById("employeeFirstNameInput").value = employee.first_name || "";
  document.getElementById("employeeLastNameInput").value = employee.last_name || "";
  document.getElementById("employeePositionInput").value = employee.position || "";
  document.getElementById("employeeStartDateInput").value = employee.employment_date || "";
  document.getElementById("employeeStatusInput").value = employee.status || "active";
  document.getElementById("employeeEndDateInput").value = employee.employment_end_date || "";
  document.getElementById("employeeStreetInput").value = employee.street || "";
  document.getElementById("employeeCityInput").value = employee.city || "";
  document.getElementById("employeePhoneInput").value = employee.phone || "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = employee.medical_exam_valid_until || "";
}

function legacyRenderEmployeeRegistryTableV2() {
  const target = document.getElementById("employeeRegistryTable");
  if (!target) return;

  const query = employeeViewState.search.toLowerCase();
  const rows = getEmployeeRoster()
    .map((employee) => {
      const months = buildEmployeeMonthlyRows(employee.name);
      return {
        ...employee,
        months_count: months.length,
        total_cost: months.reduce((sum, month) => sum + month.employer_cost, 0),
        projects_count: new Set(months.flatMap((month) => month.contracts)).size,
      };
    })
    .filter((employee) => employeeSearchText(employee).includes(query));

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracowników dla podanego filtra.</p>";
    return;
  }

  if (!rows.some((employee) => employee.name === employeeViewState.selectedName)) {
    employeeViewState.selectedName = rows[0].name;
  }

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Nazwisko</th>
          <th>Imię</th>
          <th>Status</th>
          <th>Stanowisko</th>
          <th>Badania ważne do</th>
          <th>Dni do badania</th>
          <th>Kod</th>
          <th>Zatrudniony od</th>
          <th>Miesiące</th>
          <th>Inwestycje</th>
          <th>Koszt łączny</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((employee, index) => {
          const medical = employeeMedicalStatus(employee.medical_exam_valid_until);
          return `
            <tr class="clickable-row${employee.name === employeeViewState.selectedName ? " is-selected" : ""}" data-employee-name="${employeeEscape(employee.name)}">
              <td>${index + 1}</td>
              <td>${employeeEscape(employee.last_name || "-")}</td>
              <td>${employeeEscape(employee.first_name || "-")}</td>
              <td>${employeeEscape(employeeStatusLabel(employee.status))}</td>
              <td>${employeeEscape(employee.position || "-")}</td>
              <td>${employeeEscape(employeeDateText(employee.medical_exam_valid_until))}</td>
              <td>${employeeEscape(medical.daysText)}</td>
              <td>${employeeEscape(employee.worker_code || "-")}</td>
              <td>${employeeEscape(employee.employment_date || "-")}</td>
              <td>${employeeEscape(String(employee.months_count))}</td>
              <td>${employeeEscape(String(employee.projects_count))}</td>
              <td>${employeeEscape(employeeMoney(employee.total_cost))}</td>
              <td class="action-cell">
                <button class="table-action-button" type="button" data-employee-edit="${employeeEscape(employee.name)}">Edytuj</button>
                <button class="table-action-button danger-button" type="button" data-employee-delete="${employeeEscape(employee.name)}">Usuń</button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function legacyRenderEmployeeCardV2() {
  const target = document.getElementById("employeeCardView");
  if (!target) return;

  const employee = getEmployeeProfileByName(employeeViewState.selectedName);
  if (!employee) {
    target.innerHTML = "<p>Wybierz pracownika ze spisu.</p>";
    return;
  }

  const months = buildEmployeeMonthlyRows(employee.name);
  const totalCost = months.reduce((sum, month) => sum + month.employer_cost, 0);
  const totalProjects = new Set(months.flatMap((month) => month.contracts)).size;
  const medical = employeeMedicalStatus(employee.medical_exam_valid_until);

  target.innerHTML = `
    <div class="record-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Karta pracownika</p>
          <h2>${employeeEscape(employeeDisplayName(employee) || employee.name)}</h2>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div><span>Status</span><strong>${employeeEscape(employeeStatusLabel(employee.status))}</strong></div>
        <div><span>Stanowisko</span><strong>${employeeEscape(employee.position || "-")}</strong></div>
        <div><span>Zatrudniony od</span><strong>${employeeEscape(employee.employment_date || "-")}</strong></div>
        <div><span>Zakończenie pracy</span><strong>${employeeEscape(employee.employment_end_date || "-")}</strong></div>
        <div><span>Adres</span><strong>${employeeEscape(employee.street || "-")}</strong></div>
        <div><span>Kod i miejscowość</span><strong>${employeeEscape(employee.city || "-")}</strong></div>
        <div><span>Telefon</span><strong>${employeeEscape(employee.phone || "-")}</strong></div>
      </div>
      <div class="stats-grid compact-stats-grid section-grid metrics-grid--3 employee-summary-stats">
        <article class="stat"><span>Przepracowane miesiące</span><strong>${employeeEscape(String(months.length))}</strong></article>
        <article class="stat"><span>Suma inwestycji</span><strong>${employeeEscape(String(totalProjects))}</strong></article>
        <article class="stat"><span>Łączny koszt wynagrodzeń</span><strong>${employeeEscape(employeeMoney(totalCost))}</strong></article>
      </div>
      <section class="subsection-block">
        <div class="section-head">
          <h3>Badania lekarskie</h3>
        </div>
        <div class="detail-meta-grid">
          <div><span>Badania ważne do</span><strong>${employeeEscape(employeeDateText(employee.medical_exam_valid_until))}</strong></div>
          <div><span>Dni do najbliższego badania</span><strong>${employeeEscape(medical.daysText)}</strong></div>
          <div><span>Status badań</span><strong>${employeeEscape(medical.label)}</strong></div>
        </div>
      </section>
      <div class="form-table-shell">
        <table class="compact-summary-table">
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Godziny</th>
              <th>Roboczogodzina</th>
              <th>Koszt wynagrodzeń</th>
              <th>Kontrakty</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((month) => `
              <tr>
                <td>${employeeEscape(month.month_label)}</td>
                <td>${employeeEscape(employeeValue(month.hours))}</td>
                <td>${employeeEscape(employeeMoney(month.rh))}</td>
                <td>${employeeEscape(employeeMoney(month.employer_cost))}</td>
                <td>${employeeEscape(month.contracts.join(", ") || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function legacySaveEmployeeFromFormV2() {
  const firstName = employeeNormalize(document.getElementById("employeeFirstNameInput").value);
  const lastName = employeeNormalize(document.getElementById("employeeLastNameInput").value);
  const name = employeeComposeName(firstName, lastName);
  if (!firstName || !lastName) {
    window.alert("Podaj imię i nazwisko pracownika.");
    return;
  }

  const registry = loadEmployeeRegistry();
  const originalName = employeeViewState.editingName || name;
  const existing = registry.find((employee) => employee.name === originalName);
  const conflict = registry.find((employee) => employee.name === name && employee.name !== originalName);
  if (conflict) {
    window.alert("Pracownik o tej nazwie już istnieje.");
    return;
  }

  const status = String(document.getElementById("employeeStatusInput").value || "active");
  const providedEndDate = String(document.getElementById("employeeEndDateInput").value || "");
  const payload = {
    name,
    first_name: firstName,
    last_name: lastName,
    position: employeeNormalize(document.getElementById("employeePositionInput").value),
    status,
    employment_date: String(document.getElementById("employeeStartDateInput").value || ""),
    employment_end_date: status === "inactive"
      ? (providedEndDate || new Date().toISOString().slice(0, 10))
      : providedEndDate,
    street: employeeNormalize(document.getElementById("employeeStreetInput").value),
    city: employeeNormalize(document.getElementById("employeeCityInput").value),
    phone: employeeNormalize(document.getElementById("employeePhoneInput").value),
    medical_exam_valid_until: String(document.getElementById("employeeMedicalExamValidUntilInput").value || ""),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    registry.push(payload);
  }

  if (originalName !== name) {
    renameEmployeeReferences(originalName, name);
  }

  saveEmployeeRegistry(registry);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Kadry",
      existing ? "Zaktualizowano pracownika" : "Dodano pracownika",
      name,
      payload.position ? `Stanowisko: ${payload.position}` : ""
    );
  }

  employeeViewState.selectedName = name;
  employeeViewState.editingName = name;
  renderEmployeeModuleIfActive();
}

function employeeStatusLabel(status) {
  return status === "inactive" ? "Zako\u0144czone zatrudnienie" : "Aktywny";
}

function resetEmployeeForm() {
  employeeViewState.editingName = "";
  document.getElementById("employeeFormHeading").textContent = "Dane pracownika";
  document.getElementById("saveEmployeeButton").textContent = "Zapisz pracownika";
  document.getElementById("employeeFirstNameInput").value = "";
  document.getElementById("employeeLastNameInput").value = "";
  document.getElementById("employeePositionInput").value = "";
  document.getElementById("employeeStartDateInput").value = "";
  document.getElementById("employeeStatusInput").value = "active";
  document.getElementById("employeeEndDateInput").value = "";
  document.getElementById("employeeStreetInput").value = "";
  document.getElementById("employeeCityInput").value = "";
  document.getElementById("employeePhoneInput").value = "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = "";
}

function fillEmployeeForm(employeeName) {
  const employee = getEmployeeProfileByName(employeeName);
  if (!employee) {
    resetEmployeeForm();
    return;
  }

  employeeViewState.editingName = employee.name;
  document.getElementById("employeeFormHeading").textContent = `Edycja pracownika: ${employeeDisplayName(employee) || employee.name}`;
  document.getElementById("saveEmployeeButton").textContent = "Zapisz zmiany";
  document.getElementById("employeeFirstNameInput").value = employee.first_name || "";
  document.getElementById("employeeLastNameInput").value = employee.last_name || "";
  document.getElementById("employeePositionInput").value = employee.position || "";
  document.getElementById("employeeStartDateInput").value = employee.employment_date || "";
  document.getElementById("employeeStatusInput").value = employee.status || "active";
  document.getElementById("employeeEndDateInput").value = employee.employment_end_date || "";
  document.getElementById("employeeStreetInput").value = employee.street || "";
  document.getElementById("employeeCityInput").value = employee.city || "";
  document.getElementById("employeePhoneInput").value = employee.phone || "";
  document.getElementById("employeeMedicalExamValidUntilInput").value = employee.medical_exam_valid_until || "";
}

function renderEmployeeRegistryTable() {
  const target = document.getElementById("employeeRegistryTable");
  if (!target) return;

  const query = employeeViewState.search.toLowerCase();
  const rows = getEmployeeRoster()
    .map((employee) => {
      const months = buildEmployeeMonthlyRows(employee.name);
      const medical = employeeMedicalStatus(employee.medical_exam_valid_until);
      return {
        ...employee,
        months_count: months.length,
        total_cost: months.reduce((sum, month) => sum + month.employer_cost, 0),
        projects_count: new Set(months.flatMap((month) => month.contracts)).size,
        medical_days_remaining: medical.daysRemaining,
        medical_days_text: medical.daysText,
      };
    })
    .filter((employee) => employeeSearchText(employee).includes(query));

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracownik\u00f3w dla podanego filtra.</p>";
    return;
  }

  const sortState = employeeViewState.sort || employeeDefaultSort();
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, employeeRegistryColumnMap())
    : rows;

  if (!sortedRows.some((employee) => employee.name === employeeViewState.selectedName)) {
    employeeViewState.selectedName = sortedRows[0].name;
  }

  target.innerHTML = `
    <table class="data-table invoice-module-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${employeeRenderHeader("Nazwisko", "last_name", sortState)}</th>
          <th>${employeeRenderHeader("Imi\u0119", "first_name", sortState)}</th>
          <th>${employeeRenderHeader("Status", "status", sortState)}</th>
          <th>${employeeRenderHeader("Stanowisko", "position", sortState)}</th>
          <th>${employeeRenderHeader("Badania wa\u017cne do", "medical_exam_valid_until", sortState)}</th>
          <th>${employeeRenderHeader("Dni do badania", "medical_days_remaining", sortState)}</th>
          <th>${employeeRenderHeader("Kod", "worker_code", sortState)}</th>
          <th>${employeeRenderHeader("Zatrudniony od", "employment_date", sortState)}</th>
          <th>${employeeRenderHeader("Miesi\u0105ce", "months_count", sortState)}</th>
          <th>${employeeRenderHeader("Inwestycje", "projects_count", sortState)}</th>
          <th class="text-right">${employeeRenderHeader("Koszt \u0142\u0105czny", "total_cost", sortState)}</th>
          <th class="control-col">Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((employee, index) => {
          return `
            <tr class="clickable-row${employee.name === employeeViewState.selectedName ? " is-selected" : ""}" data-employee-name="${employeeEscape(employee.name)}">
              <td>${index + 1}</td>
              <td>${employeeEscape(employee.last_name || "-")}</td>
              <td>${employeeEscape(employee.first_name || "-")}</td>
              <td>${employeeEscape(employeeStatusLabel(employee.status))}</td>
              <td>${employeeEscape(employee.position || "-")}</td>
              <td>${employeeEscape(employeeDateText(employee.medical_exam_valid_until))}</td>
              <td>${employeeEscape(employee.medical_days_text || "-")}</td>
              <td>${employeeEscape(employee.worker_code || "-")}</td>
              <td>${employeeEscape(employeeDateText(employee.employment_date))}</td>
              <td>${employeeEscape(String(employee.months_count))}</td>
              <td>${employeeEscape(String(employee.projects_count))}</td>
              <td class="text-right">${employeeEscape(employeeMoney(employee.total_cost))}</td>
              <td class="action-cell">
                <button class="table-action-button" type="button" data-employee-edit="${employeeEscape(employee.name)}">Edytuj</button>
                <button class="table-action-button danger-button" type="button" data-employee-delete="${employeeEscape(employee.name)}">Usu\u0144</button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderEmployeeCard() {
  const target = document.getElementById("employeeCardView");
  if (!target) return;

  const employee = getEmployeeProfileByName(employeeViewState.selectedName);
  if (!employee) {
    target.innerHTML = "<p>Wybierz pracownika ze spisu.</p>";
    return;
  }

  const months = buildEmployeeMonthlyRows(employee.name);
  const totalCost = months.reduce((sum, month) => sum + month.employer_cost, 0);
  const totalProjects = new Set(months.flatMap((month) => month.contracts)).size;
  const medical = employeeMedicalStatus(employee.medical_exam_valid_until);

  target.innerHTML = `
    <div class="record-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Karta pracownika</p>
          <h2>${employeeEscape(employeeDisplayName(employee) || employee.name)}</h2>
        </div>
        <div class="detail-actions">
          <button id="printEmployeeCardButton" class="clicker-button" type="button">PDF karty</button>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div><span>Status</span><strong>${employeeEscape(employeeStatusLabel(employee.status))}</strong></div>
        <div><span>Stanowisko</span><strong>${employeeEscape(employee.position || "-")}</strong></div>
        <div><span>Zatrudniony od</span><strong>${employeeEscape(employeeDateText(employee.employment_date))}</strong></div>
        <div><span>Zako\u0144czenie pracy</span><strong>${employeeEscape(employeeDateText(employee.employment_end_date))}</strong></div>
        <div><span>Adres</span><strong>${employeeEscape(employee.street || "-")}</strong></div>
        <div><span>Kod i miejscowo\u015b\u0107</span><strong>${employeeEscape(employee.city || "-")}</strong></div>
        <div><span>Telefon</span><strong>${employeeEscape(employee.phone || "-")}</strong></div>
      </div>
      <div class="stats-grid compact-stats-grid section-grid metrics-grid--3 employee-summary-stats">
        <article class="stat"><span>Przepracowane miesi\u0105ce</span><strong>${employeeEscape(String(months.length))}</strong></article>
        <article class="stat"><span>Suma inwestycji</span><strong>${employeeEscape(String(totalProjects))}</strong></article>
        <article class="stat"><span>\u0141\u0105czny koszt wynagrodzeń</span><strong>${employeeEscape(employeeMoney(totalCost))}</strong></article>
      </div>
      <section class="subsection-block">
        <div class="section-head">
          <h3>Badania lekarskie</h3>
        </div>
        <div class="stats-grid compact-stats-grid section-grid metrics-grid--3 employee-medical-stats">
          <article class="stat"><span>Badania wa\u017cne do</span><strong>${employeeEscape(employeeDateText(employee.medical_exam_valid_until))}</strong></article>
          <article class="stat"><span>Dni do najbli\u017cszego badania</span><strong>${employeeEscape(medical.daysText)}</strong></article>
          <article class="stat"><span>Status bada\u0144</span><strong>${employeeEscape(medical.label)}</strong></article>
        </div>
      </section>
      ${employeeRenderPdfOptions()}
      <div class="form-table-shell">
        <table class="compact-summary-table">
          <thead>
            <tr>
              <th>Miesi\u0105c</th>
              <th>Godziny</th>
              <th>Roboczogodzina</th>
              <th>Koszt wynagrodzeń</th>
              <th>Kontrakty</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((month) => `
              <tr>
                <td>${employeeEscape(month.month_label)}</td>
                <td>${employeeEscape(employeeValue(month.hours))}</td>
                <td>${employeeEscape(employeeMoney(month.rh))}</td>
                <td>${employeeEscape(employeeMoney(month.employer_cost))}</td>
                <td>${employeeEscape(month.contracts.join(", ") || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

async function saveEmployeeFromForm() {
  const firstName = employeeNormalize(document.getElementById("employeeFirstNameInput").value);
  const lastName = employeeNormalize(document.getElementById("employeeLastNameInput").value);
  const name = employeeComposeName(firstName, lastName);
  if (!firstName || !lastName) {
    window.alert("Podaj imi\u0119 i nazwisko pracownika.");
    return;
  }

  const saveButton = document.getElementById("saveEmployeeButton");
  const previousLabel = saveButton?.textContent || "Zapisz pracownika";
  if (saveButton) {
    saveButton.disabled = true;
    saveButton.textContent = "Zapisywanie...";
  }

  try {
    await window.whenClodeDataReady?.();
    const registry = loadEmployeeRegistry();
    const originalName = employeeViewState.editingName || name;
    const existing = registry.find((employee) => employee.name === originalName);
    const conflict = registry.find((employee) => employee.name === name && employee.name !== originalName);
    if (conflict) {
      window.alert("Pracownik o tej nazwie ju\u017c istnieje.");
      return;
    }

    const status = String(document.getElementById("employeeStatusInput").value || "active");
    const providedEndDate = String(document.getElementById("employeeEndDateInput").value || "");
    const payload = {
      name,
      first_name: firstName,
      last_name: lastName,
      position: employeeNormalize(document.getElementById("employeePositionInput").value),
      status,
      employment_date: String(document.getElementById("employeeStartDateInput").value || ""),
      employment_end_date: status === "inactive"
        ? (providedEndDate || new Date().toISOString().slice(0, 10))
        : providedEndDate,
      street: employeeNormalize(document.getElementById("employeeStreetInput").value),
      city: employeeNormalize(document.getElementById("employeeCityInput").value),
      phone: employeeNormalize(document.getElementById("employeePhoneInput").value),
      medical_exam_valid_until: String(document.getElementById("employeeMedicalExamValidUntilInput").value || ""),
    };

    if (existing) {
      Object.assign(existing, payload);
    } else {
      registry.push(payload);
    }

    if (originalName !== name) {
      renameEmployeeReferences(originalName, name);
    }

    await persistEmployeeRegistry(registry);
    const refreshedRegistry = await reloadEmployeeRegistryFromBackend();
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog(
        "Kadry",
        existing ? "Zaktualizowano pracownika" : "Dodano pracownika",
        name,
        payload.position ? `Stanowisko: ${payload.position}` : ""
      );
    }

    const savedEmployee = refreshedRegistry.find((employee) => employeeNormalize(employee?.name) === name);
    employeeViewState.search = "";
    const searchInput = document.getElementById("employeeRegistrySearchInput");
    if (searchInput) {
      searchInput.value = "";
    }
    employeeViewState.selectedName = savedEmployee?.name || name;
    employeeViewState.editingName = savedEmployee?.name || name;
    renderEmployeeModuleIfActive();
  } catch (error) {
    console.warn("Nie udało się zapisać pracownika.", error);
    window.alert("Nie udało się zapisać pracownika. Odśwież widok i spróbuj ponownie.");
  } finally {
    if (saveButton) {
      saveButton.disabled = false;
      saveButton.textContent = previousLabel;
    }
  }
}

async function deleteEmployeeFromRegistry(employeeNameArg = "") {
  const formName = employeeComposeName(
    document.getElementById("employeeFirstNameInput")?.value,
    document.getElementById("employeeLastNameInput")?.value
  );
  const name = employeeNormalize(employeeNameArg || formName || employeeViewState.selectedName);
  if (!name) return;
  if (!window.confirm(`Czy na pewno chcesz usun\u0105\u0107 pracownika ${name}?`)) return;

  try {
    await window.whenClodeDataReady?.();
    removeEmployeeReferences(name);
    await persistEmployeeRegistry(loadEmployeeRegistry().filter((employee) => employee.name !== name));
    await reloadEmployeeRegistryFromBackend();
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog("Kadry", "Usuni\u0119to pracownika", name, "");
    }
  } catch (error) {
    console.warn("Nie udało się usunąć pracownika.", error);
    window.alert("Nie udało się usunąć pracownika. Odśwież widok i spróbuj ponownie.");
    return;
  }

  const roster = getEmployeeRoster().filter((employee) => employee.name !== name);
  employeeViewState.selectedName = roster[0]?.name || "";
  employeeViewState.editingName = "";
  renderEmployeeModuleIfActive();
}

function employeePdfOptionList() {
  return [
    {
      key: "identity",
      title: "Dane podstawowe",
      description: "Status, stanowisko i daty zatrudnienia",
    },
    {
      key: "contact",
      title: "Dane kontaktowe",
      description: "Adres, kod, miejscowość i telefon",
    },
    {
      key: "summary",
      title: "Podsumowanie",
      description: "Miesiące pracy, inwestycje i koszt wynagrodzeń",
    },
    {
      key: "medical",
      title: "Badania lekarskie",
      description: "Termin ważności i licznik dni",
    },
    {
      key: "history",
      title: "Historia miesięczna",
      description: "Godziny, roboczogodzina i kontrakty",
    },
  ];
}

function employeeRenderPdfOptions() {
  return `
    <section class="subsection-block">
      <div class="section-head">
        <h3>Zakres karty PDF</h3>
      </div>
      <div class="permission-grid employee-pdf-options">
        ${employeePdfOptionList().map((option) => `
          <label class="permission-card">
            <input type="checkbox" data-employee-pdf-option="${employeeEscape(option.key)}" ${employeeViewState.pdfOptions?.[option.key] ? "checked" : ""}>
            <div>
              <strong>${employeeEscape(option.title)}</strong>
              <small>${employeeEscape(option.description)}</small>
            </div>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function exportEmployeeCardPdf(employee, months) {
  const options = employeeViewState.pdfOptions || {};
  if (!Object.values(options).some(Boolean)) {
    window.alert("Zaznacz co najmniej jeden zakres karty PDF.");
    return;
  }

  const totalCost = months.reduce((sum, month) => sum + month.employer_cost, 0);
  const totalProjects = new Set(months.flatMap((month) => month.contracts)).size;
  const medical = employeeMedicalStatus(employee.medical_exam_valid_until);
  const popup = window.open("", "_blank", "width=1280,height=920");
  if (!popup) return;

  const sections = [];

  if (options.identity) {
    sections.push(`
      <section class="print-section">
        <h2>Dane podstawowe</h2>
        <div class="meta-grid">
          <div><span>Status</span><strong>${employeeEscape(employeeStatusLabel(employee.status))}</strong></div>
          <div><span>Stanowisko</span><strong>${employeeEscape(employee.position || "-")}</strong></div>
          <div><span>Zatrudniony od</span><strong>${employeeEscape(employeeDateText(employee.employment_date))}</strong></div>
          <div><span>Zakończenie pracy</span><strong>${employeeEscape(employeeDateText(employee.employment_end_date))}</strong></div>
        </div>
      </section>
    `);
  }

  if (options.contact) {
    sections.push(`
      <section class="print-section">
        <h2>Dane kontaktowe</h2>
        <div class="meta-grid">
          <div><span>Adres</span><strong>${employeeEscape(employee.street || "-")}</strong></div>
          <div><span>Kod i miejscowość</span><strong>${employeeEscape(employee.city || "-")}</strong></div>
          <div><span>Telefon</span><strong>${employeeEscape(employee.phone || "-")}</strong></div>
        </div>
      </section>
    `);
  }

  if (options.summary) {
    sections.push(`
      <section class="print-section">
        <h2>Podsumowanie</h2>
        <div class="stats-grid">
          <div><span>Przepracowane miesiące</span><strong>${employeeEscape(String(months.length))}</strong></div>
          <div><span>Suma inwestycji</span><strong>${employeeEscape(String(totalProjects))}</strong></div>
          <div><span>Łączny koszt wynagrodzeń</span><strong>${employeeEscape(employeeMoney(totalCost))}</strong></div>
        </div>
      </section>
    `);
  }

  if (options.medical) {
    sections.push(`
      <section class="print-section">
        <h2>Badania lekarskie</h2>
        <div class="meta-grid">
          <div><span>Badania ważne do</span><strong>${employeeEscape(employeeDateText(employee.medical_exam_valid_until))}</strong></div>
          <div><span>Dni do najbliższego badania</span><strong>${employeeEscape(medical.daysText)}</strong></div>
          <div><span>Status badań</span><strong>${employeeEscape(medical.label)}</strong></div>
        </div>
      </section>
    `);
  }

  if (options.history) {
    const rowsHtml = months.length
      ? months.map((month) => `
          <tr>
            <td>${employeeEscape(month.month_label)}</td>
            <td>${employeeEscape(employeeValue(month.hours))}</td>
            <td>${employeeEscape(employeeMoney(month.rh))}</td>
            <td>${employeeEscape(employeeMoney(month.employer_cost))}</td>
            <td>${employeeEscape(month.contracts.join(", ") || "-")}</td>
          </tr>
        `).join("")
      : `<tr><td colspan="5">Brak danych.</td></tr>`;

    sections.push(`
      <section class="print-section">
        <h2>Historia miesięczna</h2>
        <table>
          <thead>
            <tr>
              <th>Miesiąc</th>
              <th>Godziny</th>
              <th>Roboczogodzina</th>
              <th>Koszt wynagrodzeń</th>
              <th>Kontrakty</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </section>
    `);
  }

  popup.document.write(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>Karta pracownika</title>
  <style>
    ${(window.ClodePrintUtils?.baseCss ? window.ClodePrintUtils.baseCss() : clodePrintBaseCss())}
  </style>
</head>
<body>
  <div class="header">
    <h1>Karta pracownika</h1>
    <p>${employeeEscape(employeeDisplayName(employee) || employee.name)} • Data wydruku: ${employeeEscape(new Date().toLocaleDateString("pl-PL"))}</p>
  </div>
  ${sections.join("")}
</body>
</html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function initEmployeesView() {
  if (employeeViewState.initialized || !document.getElementById("employeesView")) return;

  const roster = getEmployeeRoster();
  employeeViewState.selectedName = roster[0]?.name || "";
  if (!employeeViewState.sort) {
    employeeViewState.sort = employeeLoadSort();
  }

  document.getElementById("newEmployeeButton")?.addEventListener("click", resetEmployeeForm);
  document.getElementById("saveEmployeeButton")?.addEventListener("click", saveEmployeeFromForm);
  document.getElementById("deleteEmployeeButton")?.addEventListener("click", () => deleteEmployeeFromRegistry());
  document.getElementById("employeeRegistrySearchInput")?.addEventListener("input", (event) => {
    employeeViewState.search = String(event.target.value || "");
    renderEmployeeModule();
  });
  document.getElementById("employeeRegistryTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='employeeRegistry']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      employeeViewState.sort = window.ClodeTableUtils.nextSort(
        employeeViewState.sort || employeeDefaultSort(),
        sortButton.dataset.sortKey,
        employeeRegistryColumnMap()
      );
      employeeSaveSort();
      renderEmployeeRegistryTable();
      return;
    }

    const editButton = event.target.closest("[data-employee-edit]");
    if (editButton) {
      employeeViewState.selectedName = editButton.dataset.employeeEdit;
      fillEmployeeForm(employeeViewState.selectedName);
      renderEmployeeRegistryTable();
      renderEmployeeCard();
      return;
    }

    const deleteButton = event.target.closest("[data-employee-delete]");
    if (deleteButton) {
      deleteEmployeeFromRegistry(deleteButton.dataset.employeeDelete);
      return;
    }

    const row = event.target.closest("[data-employee-name]");
    if (!row) return;
    employeeViewState.selectedName = row.dataset.employeeName;
    fillEmployeeForm(employeeViewState.selectedName);
    renderEmployeeRegistryTable();
    renderEmployeeCard();
  });
  document.getElementById("employeeCardView")?.addEventListener("change", (event) => {
    const optionInput = event.target.closest("[data-employee-pdf-option]");
    if (!optionInput) return;
    employeeViewState.pdfOptions[optionInput.dataset.employeePdfOption] = optionInput.checked;
  });
  document.getElementById("employeeCardView")?.addEventListener("click", (event) => {
    const printButton = event.target.closest("#printEmployeeCardButton");
    if (!printButton) return;
    const employee = getEmployeeProfileByName(employeeViewState.selectedName);
    if (!employee) return;
    exportEmployeeCardPdf(employee, buildEmployeeMonthlyRows(employee.name));
  });

  window.addEventListener("hours-registry-updated", renderEmployeeModuleIfActive);
  window.addEventListener("employee-registry-updated", renderEmployeeModuleIfActive);
  window.addEventListener("clode-data-ready", renderEmployeeModuleIfActive);
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "employeesView") renderEmployeeModule();
  });

  employeeViewState.initialized = true;
  renderEmployeeModuleIfActive();
}

window.getEmployeeRoster = getEmployeeRoster;
window.getActiveEmployeeRoster = getActiveEmployeeRoster;
window.getEmployeeRegistrySnapshot = getEmployeeRegistrySnapshot;
window.getEmployeeProfileByName = getEmployeeProfileByName;
window.saveEmployeeRegistryShared = saveEmployeeRegistry;
window.loadEmployeeRegistryShared = loadEmployeeRegistry;
window.renderEmployeesModule = renderEmployeeModule;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEmployeesView);
} else {
  initEmployeesView();
}

