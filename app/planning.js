const PLANNING_STORAGE_KEY = "clodePlanningRegistryV1";
const PLANNING_TABLE_SORT_KEY = "clodePlanningTableSortV1";

const planningState = window.__clodePlanningState || {
  initialized: false,
  selectedDate: "",
  search: "",
  calendarCursor: "",
  sorts: null,
};

window.__clodePlanningState = planningState;

function planningDefaultSorts() {
  return {
    assignments: { key: "employee_name", direction: "asc" },
    contracts: { key: "contract_number", direction: "asc" },
  };
}

function planningReadStore(storageKey, fallbackValue) {
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

function planningWriteStore(storageKey, value) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(storageKey, value);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function planningLoadSorts() {
  const defaults = planningDefaultSorts();
  const parsed = planningReadStore(PLANNING_TABLE_SORT_KEY, null);
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
    assignments: normalize(parsed.assignments, defaults.assignments),
    contracts: normalize(parsed.contracts, defaults.contracts),
  };
}

function planningSaveSorts() {
  planningWriteStore(PLANNING_TABLE_SORT_KEY, planningState.sorts || planningDefaultSorts());
}

function planningRenderHeader(label, tableName, key, sortState) {
  if (!window.ClodeTableUtils?.renderHeader) return planningEscape(label);
  return window.ClodeTableUtils.renderHeader(label, tableName, key, sortState);
}

function planningAssignmentsColumnMap() {
  return {
    employee_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.employee_name || "" },
    position: { type: "string", defaultDirection: "asc", getValue: (row) => row.position || "" },
    status: { type: "string", defaultDirection: "asc", getValue: (row) => row.status || "" },
    contract_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.contract_name || "" },
    note: { type: "string", defaultDirection: "asc", getValue: (row) => row.note || "" },
  };
}

function planningContractsColumnMap() {
  return {
    contract_number: { type: "string", defaultDirection: "asc", getValue: (row) => row.contract_number || "" },
    contract_name: { type: "string", defaultDirection: "asc", getValue: (row) => row.contract_name || "" },
    staffing_status: { type: "string", defaultDirection: "asc", getValue: (row) => row.staffing_status || "" },
    employees_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.employees_count || 0) },
  };
}

function planningEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function planningText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function planningDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function planningDateFromKey(value) {
  const normalized = planningText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function planningToday() {
  return planningDateKey(new Date());
}

function loadPlanningStore() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(PLANNING_STORAGE_KEY, null)
    : null;
  if (parsed && typeof parsed === "object") {
    return {
      assignments: parsed.assignments && typeof parsed.assignments === "object" ? parsed.assignments : {},
    };
  }
  return { assignments: {} };
}

function savePlanningStore(store) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(PLANNING_STORAGE_KEY, store, { eventName: "planning-registry-updated" });
    return;
  }
  window.localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("planning-registry-updated"));
}

function ensurePlanningDate() {
  if (!planningState.selectedDate) {
    planningState.selectedDate = planningToday();
  }
  if (!planningState.calendarCursor) {
    planningState.calendarCursor = planningState.selectedDate.slice(0, 7);
  }
}

function getPlanningEmployees() {
  return typeof window.getActiveEmployeeRoster === "function" ? window.getActiveEmployeeRoster() : [];
}

function getPlanningContracts() {
  return typeof window.getActiveContractRegistry === "function" ? window.getActiveContractRegistry() : [];
}

function getPlanningAssignmentsForDate(dateValue) {
  const store = loadPlanningStore();
  return store.assignments?.[dateValue] && typeof store.assignments[dateValue] === "object"
    ? store.assignments[dateValue]
    : {};
}

function setPlanningAssignment(dateValue, employeeName, payload) {
  const store = loadPlanningStore();
  if (!store.assignments[dateValue]) {
    store.assignments[dateValue] = {};
  }
  store.assignments[dateValue][employeeName] = payload;
  savePlanningStore(store);
}

function clearPlanningAssignment(dateValue, employeeName) {
  const store = loadPlanningStore();
  if (!store.assignments[dateValue]?.[employeeName]) return;
  delete store.assignments[dateValue][employeeName];
  savePlanningStore(store);
}

function removeContractFromPlanningData(contractName) {
  const normalizedName = planningText(contractName);
  if (!normalizedName) return;
  const store = loadPlanningStore();
  Object.keys(store.assignments || {}).forEach((dateKey) => {
    Object.keys(store.assignments[dateKey] || {}).forEach((employeeName) => {
      if (planningText(store.assignments[dateKey][employeeName]?.contract_name) === normalizedName) {
        store.assignments[dateKey][employeeName].contract_name = "";
      }
    });
  });
  savePlanningStore(store);
}

function copyPlanningFromPreviousDate() {
  ensurePlanningDate();
  const date = planningDateFromKey(planningState.selectedDate) || new Date();
  date.setDate(date.getDate() - 1);
  const previousDate = planningDateKey(date);
  const previousAssignments = getPlanningAssignmentsForDate(previousDate);
  const store = loadPlanningStore();
  const nextAssignments = {};
  Object.entries(previousAssignments || {}).forEach(([employeeName, payload]) => {
    const hasAbsence = typeof window.getEmployeeAbsenceForDate === "function"
      ? Boolean(window.getEmployeeAbsenceForDate(employeeName, planningState.selectedDate))
      : false;
    if (hasAbsence) return;
    nextAssignments[employeeName] = JSON.parse(JSON.stringify(payload || { contract_name: "", note: "" }));
  });
  store.assignments[planningState.selectedDate] = nextAssignments;
  savePlanningStore(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Planowanie", "Skopiowano plan dnia", planningState.selectedDate, `Źródło: ${previousDate}`);
  }
}

function getContractLabel(contract) {
  const code = String(contract?.contract_number || "").trim();
  return code ? `${code} - ${contract.name}` : String(contract?.name || "");
}

function renderPlanningSummary() {
  const target = document.getElementById("planningSummaryStats");
  if (!target) return;

  const employees = getPlanningEmployees();
  const assignments = getPlanningAssignmentsForDate(planningState.selectedDate);
  let unavailable = 0;
  let assigned = 0;
  let unassigned = 0;

  employees.forEach((employee) => {
    const absence = typeof window.getEmployeeAbsenceForDate === "function"
      ? window.getEmployeeAbsenceForDate(employee.name, planningState.selectedDate)
      : null;
    if (absence) {
      unavailable += 1;
      return;
    }
    if (planningText(assignments?.[employee.name]?.contract_name)) assigned += 1;
    else unassigned += 1;
  });

  target.innerHTML = `
    <article class="stat"><span>Data planu</span><strong>${planningEscape(planningState.selectedDate)}</strong></article>
    <article class="stat"><span>Kontrakty aktywne</span><strong>${planningEscape(String(getPlanningContracts().length))}</strong></article>
    <article class="stat"><span>Pracownicy przypisani</span><strong>${planningEscape(String(assigned))}</strong></article>
    <article class="stat"><span>Niedostępni</span><strong>${planningEscape(String(unavailable))}</strong></article>
    <article class="stat"><span>Bez przypisania</span><strong>${planningEscape(String(unassigned))}</strong></article>
  `;
}

function renderPlanningAssignments() {
  const target = document.getElementById("planningAssignmentsTable");
  if (!target) return;

  const employees = getPlanningEmployees().filter((employee) => {
    if (!planningState.search) return true;
    return String(employee.name || "").toLowerCase().includes(planningState.search.toLowerCase());
  });
  const contracts = getPlanningContracts().sort((left, right) => String(left.contract_number || "").localeCompare(String(right.contract_number || ""), "pl", { numeric: true }));
  const assignments = getPlanningAssignmentsForDate(planningState.selectedDate);

  if (!employees.length) {
    target.innerHTML = "<p>Brak pracowników do zaplanowania.</p>";
    return;
  }

  const rows = employees.map((employee) => {
    const absence = typeof window.getEmployeeAbsenceForDate === "function"
      ? window.getEmployeeAbsenceForDate(employee.name, planningState.selectedDate)
      : null;
    const assignment = assignments?.[employee.name] || { contract_name: "", note: "" };
    const hasConflict = Boolean(absence && planningText(assignment.contract_name));
    const disabled = absence ? "disabled" : "";
    const statusLabel = hasConflict
      ? `${absence.label} / konflikt z przypisaniem`
      : (absence ? absence.label : "Dostępny");
    return {
      employee,
      assignment,
      disabled,
      statusLabel,
      sort: {
        employee_name: planningText(employee.name),
        position: planningText(employee.position || "-"),
        status: planningText(statusLabel),
        contract_name: planningText(assignment.contract_name || ""),
        note: planningText(assignment.note || ""),
      },
    };
  });

  const sortState = planningState.sorts?.assignments || planningDefaultSorts().assignments;
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, planningAssignmentsColumnMap())
    : rows;

  target.innerHTML = `
    <table class="data-table invoice-module-table module-table planning-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${planningRenderHeader("Pracownik", "planningAssignments", "employee_name", sortState)}</th>
          <th>${planningRenderHeader("Stanowisko", "planningAssignments", "position", sortState)}</th>
          <th>${planningRenderHeader("Status na dzień", "planningAssignments", "status", sortState)}</th>
          <th>${planningRenderHeader("Kontrakt", "planningAssignments", "contract_name", sortState)}</th>
          <th>${planningRenderHeader("Uwagi", "planningAssignments", "note", sortState)}</th>
          <th class="control-col">Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((row, index) => {
          const employee = row.employee;
          const assignment = row.assignment;
          const disabled = row.disabled;
          const statusLabel = row.statusLabel;
          return `
            <tr>
              <td>${index + 1}</td>
              <td>${planningEscape(employee.name)}</td>
              <td>${planningEscape(employee.position || "-")}</td>
              <td>${planningEscape(statusLabel)}</td>
              <td>
                <select class="cell-select" data-planning-contract="${planningEscape(employee.name)}" ${disabled}>
                  <option value="">-- wybierz --</option>
                  ${contracts.map((contract) => `
                    <option value="${planningEscape(contract.name)}"${contract.name === assignment.contract_name ? " selected" : ""}>
                      ${planningEscape(getContractLabel(contract))}
                    </option>
                  `).join("")}
                </select>
              </td>
              <td>
                <input class="cell-input" type="text" data-planning-note="${planningEscape(employee.name)}" value="${planningEscape(assignment.note || "")}" ${disabled}>
              </td>
              <td class="action-cell">
                <button class="table-action-button danger-button" type="button" data-planning-clear="${planningEscape(employee.name)}">Wyczyść</button>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderPlanningContractsSummary() {
  const target = document.getElementById("planningContractsSummary");
  if (!target) return;
  const employees = getPlanningEmployees();
  const assignments = getPlanningAssignmentsForDate(planningState.selectedDate);
  const contracts = getPlanningContracts().sort((left, right) => {
    const leftCode = String(left?.contract_number || "999");
    const rightCode = String(right?.contract_number || "999");
    const byCode = leftCode.localeCompare(rightCode, "pl", { numeric: true });
    if (byCode !== 0) return byCode;
    return String(left?.name || "").localeCompare(String(right?.name || ""), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });
  const buckets = new Map();
  const unavailableEmployees = [];
  const unassignedEmployees = [];

  contracts.forEach((contract) => {
    buckets.set(contract.name, {
      contract,
      employees: [],
    });
  });

  employees.forEach((employee) => {
    const absence = typeof window.getEmployeeAbsenceForDate === "function"
      ? window.getEmployeeAbsenceForDate(employee.name, planningState.selectedDate)
      : null;
    const assignment = assignments?.[employee.name] || {};
    const contractName = planningText(assignment?.contract_name);

    if (absence) {
      unavailableEmployees.push(
        contractName
          ? `${employee.name} (${absence.label}; przypisany do ${contractName})`
          : `${employee.name} (${absence.label})`
      );
      return;
    }

    if (!contractName || !buckets.has(contractName)) {
      unassignedEmployees.push(employee.name);
      return;
    }

    buckets.get(contractName).employees.push(employee.name);
  });

  if (!contracts.length) {
    target.innerHTML = "<p>Brak kontraktów w realizacji na liście planowania.</p>";
    return;
  }

  const rows = [...buckets.values()];
  const availableCount = Math.max(employees.length - unavailableEmployees.length, 0);
  const allCovered = unassignedEmployees.length === 0;

  target.innerHTML = `
      <div class="planning-contracts-shell">
        <div class="planning-status-banner">
          <strong>${planningEscape(allCovered ? "Wszyscy pracownicy są przypisani lub niedostępni" : "Są pracownicy bez przypisania")}</strong>
          <small>
            Dostępni: ${planningEscape(String(availableCount))} |
            Niedostępni: ${planningEscape(String(unavailableEmployees.length))} |
            Bez przypisania: ${planningEscape(String(unassignedEmployees.length))}
          </small>
          <small>
            ${unassignedEmployees.length
              ? `Do przydziału: ${planningEscape(unassignedEmployees.join(", "))}`
              : "Na wybrany dzień nie ma wolnych pracowników bez przydziału."}
          </small>
        </div>
        ${
          unavailableEmployees.length
            ? `<div class="planning-status-banner">
                <strong>Pracownicy niedostępni</strong>
                <small>${planningEscape(unavailableEmployees.join(", "))}</small>
              </div>`
            : ""
        }
        <table class="data-table invoice-module-table module-table">
          <thead>
            <tr>
              <th>${planningRenderHeader("ID", "planningContracts", "contract_number", planningState.sorts?.contracts || planningDefaultSorts().contracts)}</th>
              <th>${planningRenderHeader("Kontrakt", "planningContracts", "contract_name", planningState.sorts?.contracts || planningDefaultSorts().contracts)}</th>
              <th>Status obsady</th>
              <th>${planningRenderHeader("Liczba osób", "planningContracts", "employees_count", planningState.sorts?.contracts || planningDefaultSorts().contracts)}</th>
              <th>Przypisani pracownicy</th>
            </tr>
          </thead>
          <tbody>
            ${(() => {
              const mappedRows = rows.map((row) => ({
                contract_number: String(row.contract.contract_number || "-"),
                contract_name: String(row.contract.name || "-"),
                staffing_status: row.employees.length ? "Obsadzony" : "Brak obsady",
                employees_count: row.employees.length,
                employees_text: row.employees.length ? row.employees.join(", ") : "-",
              }));
              const sortState = planningState.sorts?.contracts || planningDefaultSorts().contracts;
              const sorted = window.ClodeTableUtils?.sortItems
                ? window.ClodeTableUtils.sortItems(mappedRows, sortState, planningContractsColumnMap())
                : mappedRows;
              return sorted.map((row) => `
                <tr>
                  <td>${planningEscape(row.contract_number)}</td>
                  <td>${planningEscape(row.contract_name)}</td>
                  <td>${planningEscape(row.staffing_status)}</td>
                  <td>${planningEscape(String(row.employees_count))}</td>
                  <td>${planningEscape(row.employees_text)}</td>
                </tr>
              `).join("");
            })()}
          </tbody>
        </table>
      </div>
    `;

  const summaryNote = target.querySelector(".planning-status-banner small:last-of-type");
  if (summaryNote) {
    summaryNote.textContent = unassignedEmployees.length
      ? "Są pracownicy do przypisania."
      : "Na wybrany dzień nie ma wolnych pracowników bez przydziału.";
  }
}

function getCalendarMonthDate() {
  const [year, month] = String(planningState.calendarCursor || planningToday().slice(0, 7)).split("-").map(Number);
  return new Date(year, Math.max(month - 1, 0), 1);
}

function shiftCalendarMonth(direction) {
  const date = getCalendarMonthDate();
  date.setMonth(date.getMonth() + direction);
  planningState.calendarCursor = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildCalendarCells() {
  const monthDate = getCalendarMonthDate();
  const year = monthDate.getFullYear();
  const monthIndex = monthDate.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(year, monthIndex, 1 - startOffset + index);
    const dateValue = planningDateKey(date);
    const assignments = Object.values(getPlanningAssignmentsForDate(dateValue)).filter((item) => planningText(item?.contract_name));
    const absenceCount = getPlanningEmployees().filter((employee) => {
      return typeof window.getEmployeeAbsenceForDate === "function"
        ? Boolean(window.getEmployeeAbsenceForDate(employee.name, dateValue))
        : false;
    }).length;

    cells.push({
      dateValue,
      day: date.getDate(),
      isOutside: date.getMonth() !== monthIndex,
      isSelected: dateValue === planningState.selectedDate,
      assignmentCount: assignments.length,
      absenceCount,
      monthIndex,
      daysInMonth,
    });
  }

  return cells;
}

function renderPlanningCalendar() {
  const label = document.getElementById("planningCalendarLabel");
  const legend = document.getElementById("planningCalendarLegend");
  const grid = document.getElementById("planningCalendarGrid");
  if (!label || !legend || !grid) return;

  const monthDate = getCalendarMonthDate();
  label.textContent = monthDate.toLocaleDateString("pl-PL", { month: "long", year: "numeric" });
  legend.innerHTML = `
    <span class="calendar-legend-item"><span class="calendar-legend-dot is-selected"></span>Wybrany dzień</span>
    <span class="calendar-legend-item"><span class="calendar-legend-dot is-busy"></span>Są przypisania</span>
    <span class="calendar-legend-item"><span class="calendar-legend-dot is-absence"></span>Są nieobecności</span>
  `;

  const weekdays = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"]
    .map((day) => `<div class="planning-calendar-weekday">${day}</div>`)
    .join("");

  const days = buildCalendarCells()
    .map((cell) => `
      <button
        class="planning-calendar-day${cell.isOutside ? " is-outside" : ""}${cell.isSelected ? " is-selected" : ""}${cell.assignmentCount ? " is-busy" : ""}${cell.absenceCount ? " is-absence" : ""}"
        type="button"
        data-planning-date="${planningEscape(cell.dateValue)}">
        <strong>${cell.day}</strong>
        <small>${cell.assignmentCount ? `Przypisania: ${cell.assignmentCount}` : "Brak przypisań"}</small>
        <small>${cell.absenceCount ? `Nieobecności: ${cell.absenceCount}` : "Bez nieobecności"}</small>
      </button>
    `)
    .join("");

  grid.innerHTML = weekdays + days;
}

function renderPlanningModule() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("planningView")) return;
  ensurePlanningDate();
  document.getElementById("planningDateInput").value = planningState.selectedDate;
  renderPlanningCalendar();
  renderPlanningSummary();
  renderPlanningAssignments();
  renderPlanningContractsSummary();
}

function initPlanningView() {
  if (planningState.initialized || !document.getElementById("planningView")) return;
  ensurePlanningDate();
  if (!planningState.sorts) {
    planningState.sorts = planningLoadSorts();
  }

  document.getElementById("planningDateInput")?.addEventListener("change", (event) => {
    planningState.selectedDate = String(event.target.value || planningToday());
    planningState.calendarCursor = planningState.selectedDate.slice(0, 7);
    renderPlanningModule();
  });
  document.getElementById("planningSearchInput")?.addEventListener("input", (event) => {
    planningState.search = String(event.target.value || "");
    renderPlanningAssignments();
  });
  document.getElementById("planningAssignmentsTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='planningAssignments']");
    if (!sortButton || !window.ClodeTableUtils?.nextSort) return;
    planningState.sorts = planningState.sorts || planningDefaultSorts();
    planningState.sorts.assignments = window.ClodeTableUtils.nextSort(
      planningState.sorts.assignments || planningDefaultSorts().assignments,
      sortButton.dataset.sortKey,
      planningAssignmentsColumnMap()
    );
    planningSaveSorts();
    renderPlanningAssignments();
  });
  document.getElementById("planningContractsSummary")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='planningContracts']");
    if (!sortButton || !window.ClodeTableUtils?.nextSort) return;
    planningState.sorts = planningState.sorts || planningDefaultSorts();
    planningState.sorts.contracts = window.ClodeTableUtils.nextSort(
      planningState.sorts.contracts || planningDefaultSorts().contracts,
      sortButton.dataset.sortKey,
      planningContractsColumnMap()
    );
    planningSaveSorts();
    renderPlanningContractsSummary();
  });
  document.getElementById("planningCopyPreviousButton")?.addEventListener("click", () => {
    copyPlanningFromPreviousDate();
  });
  document.getElementById("planningCalendarPrevButton")?.addEventListener("click", () => {
    shiftCalendarMonth(-1);
    renderPlanningCalendar();
  });
  document.getElementById("planningCalendarNextButton")?.addEventListener("click", () => {
    shiftCalendarMonth(1);
    renderPlanningCalendar();
  });
  document.getElementById("planningCalendarTodayButton")?.addEventListener("click", () => {
    planningState.selectedDate = planningToday();
    planningState.calendarCursor = planningState.selectedDate.slice(0, 7);
    renderPlanningModule();
  });
  document.getElementById("planningCalendarGrid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-planning-date]");
    if (!button) return;
    planningState.selectedDate = button.dataset.planningDate;
    planningState.calendarCursor = planningState.selectedDate.slice(0, 7);
    renderPlanningModule();
  });
  document.getElementById("planningAssignmentsTable")?.addEventListener("change", (event) => {
    const contractSelect = event.target.closest("[data-planning-contract]");
    const noteInput = event.target.closest("[data-planning-note]");
    const employeeName = contractSelect?.dataset.planningContract || noteInput?.dataset.planningNote;
    if (!employeeName) return;
    const current = getPlanningAssignmentsForDate(planningState.selectedDate)?.[employeeName] || { contract_name: "", note: "" };
    const next = {
      contract_name: contractSelect ? planningText(contractSelect.value) : planningText(current.contract_name),
      note: noteInput ? planningText(noteInput.value) : planningText(current.note),
    };
    setPlanningAssignment(planningState.selectedDate, employeeName, next);
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog(
        "Planowanie",
        "Zmieniono plan dnia",
        employeeName,
        `${planningState.selectedDate} / ${next.contract_name || "bez przypisania"}`
      );
    }
  });
  document.getElementById("planningAssignmentsTable")?.addEventListener("click", (event) => {
    const clearButton = event.target.closest("[data-planning-clear]");
    if (!clearButton) return;
    clearPlanningAssignment(planningState.selectedDate, clearButton.dataset.planningClear);
    if (typeof window.recordAuditLog === "function") {
      window.recordAuditLog("Planowanie", "Wyczyszczono przypisanie", clearButton.dataset.planningClear, planningState.selectedDate);
    }
  });

  window.addEventListener("contract-registry-updated", renderPlanningModule);
  window.addEventListener("employee-registry-updated", renderPlanningModule);
  window.addEventListener("vacation-registry-updated", renderPlanningModule);
  window.addEventListener("planning-registry-updated", renderPlanningModule);
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "planningView") renderPlanningModule();
  });

  planningState.initialized = true;
  renderPlanningModule();
}

window.removeContractFromPlanningData = removeContractFromPlanningData;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlanningView);
} else {
  initPlanningView();
}

