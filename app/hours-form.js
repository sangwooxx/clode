const HOURS_STORAGE_KEY = "agentHoursFormV2";
const HOURS_INVESTMENT_REGISTRY_KEY = "agentInvestmentCatalogV1";

const hoursState = {
  seed: window.HOURS_FORM_SEED || { meta: {}, employees: [], investments: [], months: [], default_month: "" },
  data: null,
  selectedMonth: "",
  search: "",
  sorts: {
    workers: { key: "employee_name", direction: "asc" },
    yearProjects: { key: "cost", direction: "desc" },
    yearEmployees: { key: "cost", direction: "desc" },
  },
};

const hoursCurrency = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const hoursNumber = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 2,
});

function hMoney(value) {
  return hoursCurrency.format(Number(value || 0));
}

function hNumber(value) {
  return hoursNumber.format(Number(value || 0));
}

function hDate(value) {
  return value ? new Date(value).toLocaleString("pl-PL") : "-";
}

function hEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeLabel(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function toNumeric(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMonthMap() {
  return hoursState.data.months || {};
}

function getSelectedMonthRecord() {
  return getMonthMap()[hoursState.selectedMonth] || null;
}

function defaultMonthFinance() {
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

function createWorker(seedEmployee, seedRow) {
  return {
    employee_name: seedEmployee.name,
    worker_code: seedRow?.worker_code || seedEmployee.worker_code || "",
    employee_ids: [...(seedEmployee.employee_ids || [])],
    project_hours: { ...(seedRow?.project_hours || {}) },
  };
}

function createMonthRecord(monthSeed, employees) {
  const seedRows = new Map((monthSeed.rows || []).map((row) => [row.employee_name, row]));
  return {
    month_key: monthSeed.month_key,
    month_label: monthSeed.month_label,
    visible_investments: [...(monthSeed.investments || [])],
    finance: defaultMonthFinance(),
    workers: employees.map((employee) => createWorker(employee, seedRows.get(employee.name))),
  };
}

function createBaseData(seed) {
  const employees = (seed.employees || []).map((employee) => ({
    name: employee.name,
    worker_code: employee.worker_code || "",
    employee_ids: [...(employee.employee_ids || [])],
  }));

  const months = {};
  (seed.months || []).forEach((monthSeed) => {
    months[monthSeed.month_key] = createMonthRecord(monthSeed, employees);
  });

  return {
    version: 2,
    updated_at: null,
    investments: uniqueStrings(seed.investments || []),
    employees,
    months,
  };
}

function ensureWorker(month, employee) {
  let worker = month.workers.find((item) => item.employee_name === employee.name);
  if (!worker) {
    worker = createWorker(employee);
    month.workers.push(worker);
  }
  return worker;
}

function mergeSavedData(baseData, savedData) {
  if (!savedData || typeof savedData !== "object") return baseData;

  const investments = uniqueStrings([...(baseData.investments || []), ...(savedData.investments || [])]);
  const employeeMap = new Map(baseData.employees.map((item) => [item.name, { ...item }]));

  (savedData.employees || []).forEach((employee) => {
    const name = normalizeLabel(employee.name);
    if (!name) return;
    if (!employeeMap.has(name)) {
      employeeMap.set(name, {
        name,
        worker_code: employee.worker_code || "",
        employee_ids: [...(employee.employee_ids || [])],
      });
    }
  });

  const employees = [...employeeMap.values()].sort((a, b) => a.name.localeCompare(b.name, "pl"));
  const months = {};
  const monthKeys = uniqueStrings([...Object.keys(baseData.months || {}), ...Object.keys(savedData.months || {})]).sort();

  monthKeys.forEach((monthKey) => {
    const baseMonth = baseData.months[monthKey] || {
      month_key: monthKey,
      month_label: monthKey,
      visible_investments: [],
      finance: defaultMonthFinance(),
      workers: employees.map((employee) => createWorker(employee)),
    };
    const savedMonth = savedData.months?.[monthKey];
    const workers = employees.map((employee) => {
      const baseWorker = baseMonth.workers.find((item) => item.employee_name === employee.name) || createWorker(employee);
      const savedWorker = savedMonth?.workers?.find((item) => item.employee_name === employee.name);
      if (!savedWorker) {
        return {
          ...baseWorker,
          employee_ids: [...(baseWorker.employee_ids || [])],
          project_hours: { ...(baseWorker.project_hours || {}) },
        };
      }
      return {
        employee_name: employee.name,
        worker_code: savedWorker.worker_code || baseWorker.worker_code || employee.worker_code || "",
        employee_ids: [...(savedWorker.employee_ids || baseWorker.employee_ids || employee.employee_ids || [])],
        project_hours: { ...(baseWorker.project_hours || {}), ...(savedWorker.project_hours || {}) },
      };
    });

    months[monthKey] = {
      month_key: baseMonth.month_key,
      month_label: baseMonth.month_label,
      visible_investments: uniqueStrings([...(baseMonth.visible_investments || []), ...(savedMonth?.visible_investments || [])]),
      finance: {
        zus_company_1: toNumeric(savedMonth?.finance?.zus_company_1),
        zus_company_2: toNumeric(savedMonth?.finance?.zus_company_2),
        zus_company_3: toNumeric(savedMonth?.finance?.zus_company_3),
        pit4_company_1: toNumeric(savedMonth?.finance?.pit4_company_1 ?? savedMonth?.finance?.pit4),
        pit4_company_2: toNumeric(savedMonth?.finance?.pit4_company_2),
        pit4_company_3: toNumeric(savedMonth?.finance?.pit4_company_3),
        payouts: toNumeric(savedMonth?.finance?.payouts) + toNumeric(savedMonth?.finance?.payouts_extra),
      },
      workers,
    };
  });

  return {
    version: 2,
    updated_at: savedData.updated_at || null,
    investments,
    employees,
    months,
  };
}

function loadHoursData() {
  try {
    const raw = window.localStorage.getItem(HOURS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveHoursData() {
  hoursState.data.updated_at = new Date().toISOString();
  window.localStorage.setItem(HOURS_STORAGE_KEY, JSON.stringify(hoursState.data));
  if (typeof window.renderInvoiceRegistry === "function") {
    window.renderInvoiceRegistry();
  }
  window.dispatchEvent(new CustomEvent("hours-registry-updated"));
}

function getInvestmentRegistry() {
  try {
    return JSON.parse(window.localStorage.getItem(HOURS_INVESTMENT_REGISTRY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveInvestmentRegistry(registry) {
  window.localStorage.setItem(HOURS_INVESTMENT_REGISTRY_KEY, JSON.stringify(registry));
  if (typeof window.refreshDashboardLocalRegistry === "function") {
    window.refreshDashboardLocalRegistry();
  }
  if (typeof window.renderInvoiceRegistry === "function") {
    window.renderInvoiceRegistry();
  }
  if (typeof window.renderContractRegistry === "function") {
    window.renderContractRegistry();
  }
  window.dispatchEvent(new CustomEvent("contract-registry-updated"));
}

function getContractRegistryNames() {
  if (typeof window.getContractRegistry === "function") {
    return (window.getContractRegistry() || []).map((item) => item.name).filter(Boolean);
  }

  try {
    const raw = JSON.parse(window.localStorage.getItem(HOURS_INVESTMENT_REGISTRY_KEY) || "[]");
    return raw.map((item) => item?.name).filter(Boolean);
  } catch {
    return [];
  }
}

function getMonthAvailableInvestments(month) {
  return uniqueStrings([
    ...getContractRegistryNames(),
    ...(hoursState.data.investments || []),
    ...((month && month.visible_investments) || []),
  ]).sort((a, b) => a.localeCompare(b, "pl"));
}

function getVisibleInvestments(month) {
  const available = getMonthAvailableInvestments(month);
  return available.filter((name) => month.visible_investments.includes(name));
}

function getWorkerTotalHours(worker) {
  return Object.values(worker.project_hours || {}).reduce((sum, value) => sum + toNumeric(value), 0);
}

function getMonthTotalHours(month) {
  return (month.workers || []).reduce((sum, worker) => sum + getWorkerTotalHours(worker), 0);
}

function getMonthTotalCosts(month) {
  const finance = month.finance || defaultMonthFinance();
  return (
    toNumeric(finance.zus_company_1) +
    toNumeric(finance.zus_company_2) +
    toNumeric(finance.zus_company_3) +
    toNumeric(finance.pit4_company_1) +
    toNumeric(finance.pit4_company_2) +
    toNumeric(finance.pit4_company_3)
  );
}

function getMonthTotalPayouts(month) {
  const finance = month.finance || defaultMonthFinance();
  return toNumeric(finance.payouts);
}

function getMonthRhFromPayouts(month) {
  const totalHours = getMonthTotalHours(month);
  return totalHours > 0 ? getMonthTotalPayouts(month) / totalHours : 0;
}

function getMonthRhFromCosts(month) {
  const totalHours = getMonthTotalHours(month);
  return totalHours > 0 ? getMonthTotalCosts(month) / totalHours : 0;
}

function getMonthRhTotal(month) {
  return getMonthRhFromPayouts(month) + getMonthRhFromCosts(month);
}

function getMonthWorkerColumns(month, visibleInvestments) {
  const monthRh = getMonthRhTotal(month);
  const columns = {
    employee_name: { type: "string", defaultDirection: "asc" },
    worker_code: { type: "string", defaultDirection: "asc" },
    total_hours: {
      type: "number",
      defaultDirection: "desc",
      getValue: (worker) => getWorkerTotalHours(worker),
    },
    worker_cost: {
      type: "number",
      defaultDirection: "desc",
      getValue: (worker) => getWorkerTotalHours(worker) * monthRh,
    },
  };

  visibleInvestments.forEach((investment) => {
    columns[`project::${investment}`] = {
      type: "number",
      defaultDirection: "desc",
      getValue: (worker) => toNumeric(worker.project_hours[investment]),
    };
  });

  return columns;
}

const yearProjectColumns = {
  name: { type: "string", defaultDirection: "asc" },
  hours: { type: "number", defaultDirection: "desc" },
  cost: { type: "number", defaultDirection: "desc" },
  months: { type: "number", defaultDirection: "desc" },
  workers: { type: "number", defaultDirection: "desc" },
};

const yearEmployeeColumns = {
  name: { type: "string", defaultDirection: "asc" },
  worker_code: { type: "string", defaultDirection: "asc" },
  hours: { type: "number", defaultDirection: "desc" },
  cost: { type: "number", defaultDirection: "desc" },
  months: { type: "number", defaultDirection: "desc" },
  projects: { type: "number", defaultDirection: "desc" },
};

function renderHoursMeta() {
  document.getElementById("formSourceFile").textContent = hoursState.seed.meta.source_file || "-";
  document.getElementById("formGeneratedAt").textContent = hDate(hoursState.seed.meta.generated_at);
}

function renderMonthOptions() {
  const select = document.getElementById("monthSelect");
  const months = Object.values(getMonthMap()).sort((a, b) => a.month_key.localeCompare(b.month_key));
  select.innerHTML = months.map((month) => `<option value="${month.month_key}">${month.month_label}</option>`).join("");
  select.value = hoursState.selectedMonth;
}

function renderFinancePanel() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("monthFinancePanel");
  if (!month) {
    target.innerHTML = "<p>Brak miesiąca.</p>";
    return;
  }

  const totalHours = getMonthTotalHours(month);
  const totalCosts = getMonthTotalCosts(month);
  const totalPayouts = getMonthTotalPayouts(month);
  const totalOutflow = totalPayouts + totalCosts;
  const rhPayout = getMonthRhFromPayouts(month);
  const rhCosts = getMonthRhFromCosts(month);
  const rhTotal = getMonthRhTotal(month);

  target.innerHTML = `
    <div class="finance-grid">
      <label class="finance-field">
        <span>Suma godzin</span>
        <strong>${hNumber(totalHours)}</strong>
      </label>
      <label class="finance-field">
        <span>ZUS firma 1</span>
        <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_1) || ""}" data-finance="zus_company_1">
      </label>
      <label class="finance-field">
        <span>ZUS firma 2</span>
        <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_2) || ""}" data-finance="zus_company_2">
      </label>
      <label class="finance-field">
        <span>ZUS firma 3</span>
        <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_3) || ""}" data-finance="zus_company_3">
      </label>
      <label class="finance-field">
        <span>PIT-4 firma 1</span>
        <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.pit4_company_1) || ""}" data-finance="pit4_company_1">
      </label>
      <label class="finance-field">
        <span>Suma wypłat netto</span>
        <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.payouts) || ""}" data-finance="payouts">
      </label>
      <label class="finance-field">
        <span>Dopłata / korekta wypłat</span>
        <input type="number" step="0.01" value="${toNumeric(month.finance.payouts_extra) || ""}" data-finance="payouts_extra">
      </label>
      <label class="finance-field">
        <span>Koszty razem</span>
        <strong>${hMoney(totalCosts)}</strong>
      </label>
      <label class="finance-field">
        <span>Wypłaty razem</span>
        <strong>${hMoney(totalPayouts)}</strong>
      </label>
      <label class="finance-field">
        <span>RH z wypłat</span>
        <strong>${hMoney(rhPayout)}</strong>
      </label>
      <label class="finance-field">
        <span>RH z kosztów</span>
        <strong>${hMoney(rhCosts)}</strong>
      </label>
      <label class="finance-field finance-field-emphasis">
        <span>Roboczogodzina</span>
        <strong>${hMoney(rhTotal)}</strong>
      </label>
    </div>
  `;
}

function renderInvestmentPills() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("currentInvestmentsPills");
  if (!target) return;
  if (!month) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = getVisibleInvestments(month)
    .map((name) => {
      const code = getHoursContractCode(name);
      const label = getHoursContractReportLabel(name);
      return `<span class="pill" title="${hEscape(label)}">${hEscape(code)}</span>`;
    })
    .join("");
}

function renderMonthlyContractsSelector() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("monthlyContractsSelector");
  if (!target) return;

  if (!month) {
    target.innerHTML = "<p>Najpierw wybierz lub utwórz miesiąc.</p>";
    return;
  }

  const availableContracts = getMonthAvailableInvestments(month);
  if (!availableContracts.length) {
    target.innerHTML = "<p>Brak kontraktów w rejestrze. Dodaj je najpierw w zakładce Kontrakty.</p>";
    return;
  }

  target.innerHTML = `
    <div class="contracts-selector-grid">
      ${availableContracts.map((name) => {
        const code = getHoursContractCode(name);
        const label = getHoursContractReportLabel(name);
        return `
          <label class="contract-chip${month.visible_investments.includes(name) ? " is-active" : ""}" title="${hEscape(label)}">
            <input
              type="checkbox"
              data-contract-name="${hEscape(name)}"
              ${month.visible_investments.includes(name) ? "checked" : ""}
            >
            <span class="contract-chip-code">${hEscape(code)}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderHoursTable() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("hoursFormTable");
  if (!target) return;
  if (!month) {
    target.innerHTML = "<p>Brak miesiąca do wyświetlenia.</p>";
    return;
  }

  const visibleInvestments = getVisibleInvestments(month);
  if (!visibleInvestments.length) {
    target.innerHTML = "<p>Wybierz aktywne kontrakty dla miesiąca, aby wprowadzać godziny.</p>";
    return;
  }

  const monthRh = getMonthRhTotal(month);
  const footerRows = buildMonthProjectFooter(month, visibleInvestments);
  const workerColumns = getMonthWorkerColumns(month, visibleInvestments);
  const workers = window.AgentTableUtils.sortItems(
    getFilteredWorkers({ ...month, workers: getHoursDisplayWorkers(month) }),
    hoursState.sorts.workers,
    workerColumns
  );

  const projectHeaders = visibleInvestments.map((investment) => `
    <th>${window.AgentTableUtils.renderHeader(getHoursContractCode(investment), "hoursWorkers", "project::" + investment, hoursState.sorts.workers)}</th>
  `).join("");

  const rowsHtml = workers.map((worker) => {
    const totalHours = getWorkerTotalHours(worker);
    const workerCost = totalHours * monthRh;
    const projectInputs = visibleInvestments.map((investment) => `
      <td>
        <input
          class="cell-input hours-input"
          type="number"
          step="0.5"
          min="0"
          value="${toNumeric(worker.project_hours[investment]) || ""}"
          data-worker="${hEscape(worker.employee_name)}"
          data-project="${hEscape(investment)}"
          title="${hEscape(getHoursContractReportLabel(investment))}"
        >
      </td>
    `).join("");

    return `
      <tr>
        <td>${hEscape(worker.employee_name)}</td>
        <td>${hEscape(worker.worker_code || "-")}</td>
        <td class="table-emphasis">${hEscape(hNumber(totalHours))}</td>
        <td class="table-emphasis">${hEscape(hMoney(workerCost))}</td>
        ${projectInputs}
        <td class="action-cell">
          <button class="table-action-button" type="button" data-remove-worker="${hEscape(worker.employee_name)}">Usuń</button>
        </td>
      </tr>
    `;
  }).join("");

  const footerHtml = footerRows.map((row) => `
    <td title="${hEscape(getHoursContractReportLabel(row.investment))}">
      <span class="footer-metric">${hEscape(hNumber(row.hours))} h</span>
      <small>${hEscape(hMoney(row.cost))}</small>
    </td>
  `).join("");

  target.innerHTML = `
    <table class="hours-table compact-hours-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "hoursWorkers", "employee_name", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "hoursWorkers", "worker_code", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Suma godzin", "hoursWorkers", "total_hours", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "hoursWorkers", "worker_cost", hoursState.sorts.workers)}</th>
          ${projectHeaders}
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="4">Suma miesiąca na kontraktach</td>
          ${footerHtml}
          <td></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderYearProjectSummary() {
  const target = document.getElementById("yearProjectSummary");
  if (!target) return;
  const rows = window.AgentTableUtils.sortItems(
    buildYearProjectSummary(),
    hoursState.sorts.yearProjects,
    yearProjectColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table class="compact-summary-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Kontrakt", "yearProjects", "name", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearProjects", "hours", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "yearProjects", "cost", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearProjects", "months", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba pracowników", "yearProjects", "workers", hoursState.sorts.yearProjects)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${hEscape(getHoursContractReportLabel(row.name))}</td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.workers))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderYearEmployeeSummary() {
  const target = document.getElementById("yearEmployeeSummary");
  if (!target) return;
  const rows = window.AgentTableUtils.sortItems(
    buildYearEmployeeSummary(),
    hoursState.sorts.yearEmployees,
    yearEmployeeColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table class="compact-summary-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "yearEmployees", "name", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "yearEmployees", "worker_code", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearEmployees", "hours", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt roczny", "yearEmployees", "cost", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearEmployees", "months", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba kontraktów", "yearEmployees", "projects", hoursState.sorts.yearEmployees)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${hEscape(row.name)}</td>
            <td>${hEscape(row.worker_code || "-")}</td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.projects))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function isHoursSummaryPanelExpanded(panelId) {
  const panel = document.getElementById(panelId);
  return Boolean(panel && !panel.hasAttribute("hidden"));
}

function renderHoursSummariesIfVisible() {
  if (isHoursSummaryPanelExpanded("yearProjectSummaryPanel")) {
    renderYearProjectSummary();
  }
  if (isHoursSummaryPanelExpanded("yearEmployeeSummaryPanel")) {
    renderYearEmployeeSummary();
  }
}

function toggleHoursSummaryPanel(panelId) {
  const panel = document.getElementById(panelId);
  const button = document.querySelector(`[data-collapse-target='${panelId}']`);
  if (!panel || !button) return;

  const nextHidden = !panel.hasAttribute("hidden");
  if (nextHidden) {
    panel.setAttribute("hidden", "");
  } else {
    panel.removeAttribute("hidden");
    if (panelId === "yearProjectSummaryPanel") {
      renderYearProjectSummary();
    }
    if (panelId === "yearEmployeeSummaryPanel") {
      renderYearEmployeeSummary();
    }
  }

  button.textContent = nextHidden ? "Rozwi\u0144" : "Zwi\u0144";
}

function exportSummaryToPdf(targetId) {
  const source = document.getElementById(targetId);
  if (!source) return;
  if (!source.innerHTML.trim()) {
    if (targetId === "yearProjectSummary") {
      renderYearProjectSummary();
    } else if (targetId === "yearEmployeeSummary") {
      renderYearEmployeeSummary();
    }
  }
  if (!source.innerHTML.trim()) return;

  const title = targetId === "yearProjectSummary"
    ? "Roczne podsumowanie inwestycji"
    : "Roczne podsumowanie pracowników";

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>${hEscape(title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: #555; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #d8d8d8; text-align: left; vertical-align: top; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
    button { border: 0; background: transparent; padding: 0; font: inherit; color: inherit; }
    .sort-indicator { display: none; }
  </style>
</head>
<body>
  <h1>${hEscape(title)}</h1>
  <p>Wygenerowano: ${hEscape(new Date().toLocaleString("pl-PL"))}</p>
  ${source.innerHTML}
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}

function renderInvestmentPills() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("currentInvestmentsPills");
  if (!month) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = getVisibleInvestments(month)
    .map((name) => `<span class="pill">${hEscape(name)}</span>`)
    .join("");
}

function renderMonthlyContractsSelector() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("monthlyContractsSelector");
  if (!target) return;

  if (!month) {
    target.innerHTML = "<p>Najpierw wybierz lub utwórz miesiąc.</p>";
    return;
  }

  const availableContracts = getMonthAvailableInvestments(month);
  if (!availableContracts.length) {
    target.innerHTML = "<p>Brak kontraktów w rejestrze. Dodaj je najpierw w zakładce Kontrakty.</p>";
    return;
  }

  target.innerHTML = `
    <div class="contracts-selector-grid">
      ${availableContracts.map((name) => `
        <label class="contract-chip${month.visible_investments.includes(name) ? " is-active" : ""}">
          <input
            type="checkbox"
            data-contract-name="${hEscape(name)}"
            ${month.visible_investments.includes(name) ? "checked" : ""}
          >
          <span>${hEscape(name)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function getFilteredWorkers(month) {
  const query = hoursState.search.trim().toLowerCase();
  const sourceWorkers = typeof getHoursDisplayWorkers === "function"
    ? getHoursDisplayWorkers(month)
    : (month.workers || []);
  const workers = [...sourceWorkers].sort((a, b) => a.employee_name.localeCompare(b.employee_name, "pl"));
  if (!query) return workers;
  return workers.filter((worker) => worker.employee_name.toLowerCase().includes(query));
}

function buildMonthProjectFooter(month, visibleInvestments) {
  const monthRh = getMonthRhTotal(month);
  return visibleInvestments.map((investment) => {
    let hours = 0;
    month.workers.forEach((worker) => {
      hours += toNumeric(worker.project_hours[investment]);
    });
    return {
      investment,
      hours,
      cost: hours * monthRh,
    };
  });
}

function renderHoursTable() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("hoursFormTable");
  if (!month) {
    target.innerHTML = "<p>Brak miesiąca do wyświetlenia.</p>";
    return;
  }

  const visibleInvestments = getVisibleInvestments(month);
  const monthRh = getMonthRhTotal(month);
  const footerRows = buildMonthProjectFooter(month, visibleInvestments);
  const workerColumns = getMonthWorkerColumns(month, visibleInvestments);
  const workers = window.AgentTableUtils.sortItems(
    getFilteredWorkers(month),
    hoursState.sorts.workers,
    workerColumns
  );

  const projectHeaders = visibleInvestments.map((investment) => `
    <th>${window.AgentTableUtils.renderHeader(investment, "hoursWorkers", "project::" + investment, hoursState.sorts.workers)}</th>
  `).join("");
  const rowsHtml = workers.map((worker) => {
    const totalHours = getWorkerTotalHours(worker);
    const workerCost = totalHours * monthRh;
    const projectInputs = visibleInvestments.map((investment) => `
      <td>
        <input
          class="cell-input hours-input"
          type="number"
          step="0.5"
          min="0"
          value="${toNumeric(worker.project_hours[investment]) || ""}"
          data-worker="${hEscape(worker.employee_name)}"
          data-project="${hEscape(investment)}"
        >
      </td>
    `).join("");

    return `
      <tr>
        <td><strong>${hEscape(worker.employee_name)}</strong></td>
        <td>${hEscape(worker.worker_code || "-")}</td>
        <td>${hEscape(hNumber(totalHours))}</td>
        <td>${hEscape(hMoney(workerCost))}</td>
        ${projectInputs}
        <td class="action-cell">
          <button class="table-action-button" type="button" data-remove-worker="${hEscape(worker.employee_name)}">Usuń</button>
        </td>
      </tr>
    `;
  }).join("");

  const footerHtml = footerRows.map((row) => `
    <td>
      <strong>${hEscape(hNumber(row.hours))} h</strong>
      <small>${hEscape(hMoney(row.cost))}</small>
    </td>
  `).join("");

  target.innerHTML = `
    <table class="hours-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "hoursWorkers", "employee_name", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "hoursWorkers", "worker_code", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Suma godzin", "hoursWorkers", "total_hours", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "hoursWorkers", "worker_cost", hoursState.sorts.workers)}</th>
          ${projectHeaders}
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="4"><strong>Suma miesiąca na inwestycjach</strong></td>
          ${footerHtml}
        </tr>
      </tfoot>
    </table>
  `;
}

function buildYearProjectSummary() {
  const summary = new Map();
  Object.values(getMonthMap()).forEach((month) => {
    const monthRh = getMonthRhTotal(month);
    month.workers.forEach((worker) => {
      Object.entries(worker.project_hours || {}).forEach(([investment, hoursRaw]) => {
        const hours = toNumeric(hoursRaw);
        if (!hours) return;
        if (!summary.has(investment)) {
          summary.set(investment, {
            name: investment,
            hours: 0,
            cost: 0,
            months: new Set(),
            workers: new Set(),
          });
        }
        const item = summary.get(investment);
        item.hours += hours;
        item.cost += hours * monthRh;
        item.months.add(month.month_key);
        item.workers.add(worker.employee_name);
      });
    });
  });

  return [...summary.values()]
    .map((item) => ({
      name: item.name,
      hours: item.hours,
      cost: item.cost,
      months: item.months.size,
      workers: item.workers.size,
    }));
}

function buildYearEmployeeSummary() {
  const summary = new Map();
  Object.values(getMonthMap()).forEach((month) => {
    const monthRh = getMonthRhTotal(month);
    month.workers.forEach((worker) => {
      const totalHours = getWorkerTotalHours(worker);
      if (!summary.has(worker.employee_name)) {
        summary.set(worker.employee_name, {
          name: worker.employee_name,
          worker_code: worker.worker_code || "",
          hours: 0,
          cost: 0,
          months: new Set(),
          projects: new Set(),
        });
      }
      const item = summary.get(worker.employee_name);
      item.hours += totalHours;
      item.cost += totalHours * monthRh;
      if (totalHours > 0) {
        item.months.add(month.month_key);
      }
      Object.entries(worker.project_hours || {}).forEach(([project, hoursRaw]) => {
        if (toNumeric(hoursRaw) > 0) {
          item.projects.add(project);
        }
      });
    });
  });

  return [...summary.values()]
    .map((item) => ({
      name: item.name,
      worker_code: item.worker_code,
      hours: item.hours,
      cost: item.cost,
      months: item.months.size,
      projects: item.projects.size,
    }));
}

function renderYearProjectSummary() {
  const target = document.getElementById("yearProjectSummary");
  const rows = window.AgentTableUtils.sortItems(
    buildYearProjectSummary(),
    hoursState.sorts.yearProjects,
    yearProjectColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Inwestycja", "yearProjects", "name", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearProjects", "hours", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "yearProjects", "cost", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearProjects", "months", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba pracowników", "yearProjects", "workers", hoursState.sorts.yearProjects)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><strong>${hEscape(row.name)}</strong></td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.workers))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderYearEmployeeSummary() {
  const target = document.getElementById("yearEmployeeSummary");
  const rows = window.AgentTableUtils.sortItems(
    buildYearEmployeeSummary(),
    hoursState.sorts.yearEmployees,
    yearEmployeeColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "yearEmployees", "name", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "yearEmployees", "worker_code", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearEmployees", "hours", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt roczny", "yearEmployees", "cost", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearEmployees", "months", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba inwestycji", "yearEmployees", "projects", hoursState.sorts.yearEmployees)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td><strong>${hEscape(row.name)}</strong></td>
            <td>${hEscape(row.worker_code || "-")}</td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.projects))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderInvestmentPills() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("currentInvestmentsPills");
  if (!target) return;
  if (!month) {
    target.innerHTML = "";
    return;
  }

  target.innerHTML = getVisibleInvestments(month)
    .map((name) => {
      const code = getHoursContractCode(name);
      const label = getHoursContractReportLabel(name);
      return `<span class="pill" title="${hEscape(label)}">${hEscape(code)}</span>`;
    })
    .join("");
}

function renderMonthlyContractsSelector() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("monthlyContractsSelector");
  if (!target) return;

  if (!month) {
    target.innerHTML = "<p>Najpierw wybierz lub utwórz miesiąc.</p>";
    return;
  }

  const availableContracts = getMonthAvailableInvestments(month);
  if (!availableContracts.length) {
    target.innerHTML = "<p>Brak kontraktów w rejestrze. Dodaj je najpierw w zakładce Kontrakty.</p>";
    return;
  }

  target.innerHTML = `
    <div class="contracts-selector-grid">
      ${availableContracts.map((name) => {
        const code = getHoursContractCode(name);
        const label = getHoursContractReportLabel(name);
        return `
          <label class="contract-chip${month.visible_investments.includes(name) ? " is-active" : ""}" title="${hEscape(label)}">
            <input
              type="checkbox"
              data-contract-name="${hEscape(name)}"
              ${month.visible_investments.includes(name) ? "checked" : ""}
            >
            <span class="contract-chip-code">${hEscape(code)}</span>
          </label>
        `;
      }).join("")}
    </div>
  `;
}

function renderHoursTable() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("hoursFormTable");
  if (!target) return;
  if (!month) {
    target.innerHTML = "<p>Brak miesiąca do wyświetlenia.</p>";
    return;
  }

  const visibleInvestments = getVisibleInvestments(month);
  if (!visibleInvestments.length) {
    target.innerHTML = "<p>Wybierz aktywne kontrakty dla miesiąca, aby wprowadzać godziny.</p>";
    return;
  }

  const monthRh = getMonthRhTotal(month);
  const footerRows = buildMonthProjectFooter(month, visibleInvestments);
  const workerColumns = getMonthWorkerColumns(month, visibleInvestments);
  const workers = window.AgentTableUtils.sortItems(
    getFilteredWorkers(month),
    hoursState.sorts.workers,
    workerColumns
  );

  const projectHeaders = visibleInvestments.map((investment) => `
    <th>${window.AgentTableUtils.renderHeader(getHoursContractCode(investment), "hoursWorkers", "project::" + investment, hoursState.sorts.workers)}</th>
  `).join("");

  const rowsHtml = workers.map((worker) => {
    const totalHours = getWorkerTotalHours(worker);
    const workerCost = totalHours * monthRh;
    const projectInputs = visibleInvestments.map((investment) => `
      <td>
        <input
          class="cell-input hours-input"
          type="number"
          step="0.5"
          min="0"
          value="${toNumeric(worker.project_hours[investment]) || ""}"
          data-worker="${hEscape(worker.employee_name)}"
          data-project="${hEscape(investment)}"
          title="${hEscape(getHoursContractReportLabel(investment))}"
        >
      </td>
    `).join("");

    return `
      <tr>
        <td>${hEscape(worker.employee_name)}</td>
        <td>${hEscape(worker.worker_code || "-")}</td>
        <td>${hEscape(hNumber(totalHours))}</td>
        <td>${hEscape(hMoney(workerCost))}</td>
        ${projectInputs}
        <td class="action-cell">
          <button class="table-action-button" type="button" data-remove-worker="${hEscape(worker.employee_name)}">Usuń</button>
        </td>
      </tr>
    `;
  }).join("");

  const footerHtml = footerRows.map((row) => `
    <td title="${hEscape(getHoursContractReportLabel(row.investment))}">
      <span class="footer-metric">${hEscape(hNumber(row.hours))} h</span>
      <small>${hEscape(hMoney(row.cost))}</small>
    </td>
  `).join("");

  target.innerHTML = `
    <table class="hours-table compact-hours-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "hoursWorkers", "employee_name", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "hoursWorkers", "worker_code", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Suma godzin", "hoursWorkers", "total_hours", hoursState.sorts.workers)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "hoursWorkers", "worker_cost", hoursState.sorts.workers)}</th>
          ${projectHeaders}
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="4">Suma miesiąca na kontraktach</td>
          ${footerHtml}
          <td></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderYearProjectSummary() {
  const target = document.getElementById("yearProjectSummary");
  if (!target) return;
  const rows = window.AgentTableUtils.sortItems(
    buildYearProjectSummary(),
    hoursState.sorts.yearProjects,
    yearProjectColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table class="compact-summary-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Kontrakt", "yearProjects", "name", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearProjects", "hours", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt wynagrodzeń", "yearProjects", "cost", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearProjects", "months", hoursState.sorts.yearProjects)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba pracowników", "yearProjects", "workers", hoursState.sorts.yearProjects)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${hEscape(getHoursContractReportLabel(row.name))}</td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.workers))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderYearEmployeeSummary() {
  const target = document.getElementById("yearEmployeeSummary");
  if (!target) return;
  const rows = window.AgentTableUtils.sortItems(
    buildYearEmployeeSummary(),
    hoursState.sorts.yearEmployees,
    yearEmployeeColumns
  );
  if (!rows.length) {
    target.innerHTML = "<p>Brak danych rocznych.</p>";
    return;
  }

  target.innerHTML = `
    <table class="compact-summary-table">
      <thead>
        <tr>
          <th>${window.AgentTableUtils.renderHeader("Pracownik", "yearEmployees", "name", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Kod", "yearEmployees", "worker_code", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Godziny", "yearEmployees", "hours", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Koszt roczny", "yearEmployees", "cost", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Aktywne miesiące", "yearEmployees", "months", hoursState.sorts.yearEmployees)}</th>
          <th>${window.AgentTableUtils.renderHeader("Liczba kontraktów", "yearEmployees", "projects", hoursState.sorts.yearEmployees)}</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${hEscape(row.name)}</td>
            <td>${hEscape(row.worker_code || "-")}</td>
            <td>${hEscape(hNumber(row.hours))}</td>
            <td>${hEscape(hMoney(row.cost))}</td>
            <td>${hEscape(String(row.months))}</td>
            <td>${hEscape(String(row.projects))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function toggleHoursSummaryPanel(panelId) {
  const panel = document.getElementById(panelId);
  const button = document.querySelector(`[data-collapse-target='${panelId}']`);
  if (!panel || !button) return;

  const nextHidden = !panel.hasAttribute("hidden");
  if (nextHidden) {
    panel.setAttribute("hidden", "");
  } else {
    panel.removeAttribute("hidden");
  }

  button.textContent = nextHidden ? "Rozwi\u0144" : "Zwi\u0144";
}

function exportSummaryToPdf(targetId) {
  const source = document.getElementById(targetId);
  if (!source || !source.innerHTML.trim()) return;

  const title = targetId === "yearProjectSummary"
    ? "Roczne podsumowanie inwestycji"
    : "Roczne podsumowanie pracowników";

  const printWindow = window.open("", "_blank", "width=1200,height=900");
  if (!printWindow) return;

  printWindow.document.write(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>${hEscape(title)}</title>
  <style>
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: #555; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #d8d8d8; text-align: left; vertical-align: top; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #555; }
    button { border: 0; background: transparent; padding: 0; font: inherit; color: inherit; }
    .sort-indicator { display: none; }
  </style>
</head>
<body>
  <h1>${hEscape(title)}</h1>
  <p>Wygenerowano: ${hEscape(new Date().toLocaleString("pl-PL"))}</p>
  ${source.innerHTML}
</body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 250);
}

function renderHoursView() {
  renderHoursMeta();
  renderMonthOptions();
  renderFinancePanel();
  renderInvestmentPills();
  renderHoursTable();
  renderYearProjectSummary();
  renderYearEmployeeSummary();
}

function addMonth() {
  const monthInput = document.getElementById("newMonthInput");
  const monthKey = normalizeLabel(monthInput.value);
  if (!monthKey) return;

  if (getMonthMap()[monthKey]) {
    hoursState.selectedMonth = monthKey;
    renderHoursView();
    return;
  }

  const currentMonth = getSelectedMonthRecord();
  const employees = getHoursActiveEmployeeRecords().map((employee) => ({
    name: employee.name,
    worker_code: employee.worker_code || "",
    employee_ids: [],
  }));
  const visibleInvestments = currentMonth ? [...currentMonth.visible_investments] : [];
  hoursState.data.months[monthKey] = {
    month_key: monthKey,
    month_label: monthKey,
    visible_investments: visibleInvestments,
    finance: defaultMonthFinance(),
    workers: employees.map((employee) => createWorker(employee)),
  };

  hoursState.selectedMonth = monthKey;
  monthInput.value = "";
  saveHoursData();
  renderHoursView();
}

function deleteSelectedMonth() {
  const month = getSelectedMonthRecord();
  if (!month) return;

  delete hoursState.data.months[hoursState.selectedMonth];
  const nextMonthKeys = Object.keys(getMonthMap()).sort();
  hoursState.selectedMonth = nextMonthKeys[nextMonthKeys.length - 1] || "";
  saveHoursData();
  renderHoursView();
}

function addInvestment() {
  const name = normalizeLabel(document.getElementById("newInvestmentNameInput").value);
  const investor = normalizeLabel(document.getElementById("newInvestmentInvestorInput").value);
  const contractValue = toNumeric(document.getElementById("newInvestmentContractInput").value);
  const startDate = document.getElementById("newInvestmentStartInput").value || "";
  const endDate = document.getElementById("newInvestmentEndInput").value || "";

  if (!name) return;

  if (!hoursState.data.investments.includes(name)) {
    hoursState.data.investments.push(name);
    hoursState.data.investments.sort((a, b) => a.localeCompare(b, "pl"));
  }

  const month = getSelectedMonthRecord();
  if (month && !month.visible_investments.includes(name)) {
    month.visible_investments.push(name);
  }

  const registry = getInvestmentRegistry();
  const existing = registry.find((item) => item.name === name);
  const payload = {
    name,
    investor,
    contract_value: contractValue,
    start_date: startDate,
    end_date: endDate,
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    registry.push(payload);
  }

  saveInvestmentRegistry(registry);
  saveHoursData();

  document.getElementById("newInvestmentNameInput").value = "";
  document.getElementById("newInvestmentInvestorInput").value = "";
  document.getElementById("newInvestmentContractInput").value = "";
  document.getElementById("newInvestmentStartInput").value = "";
  document.getElementById("newInvestmentEndInput").value = "";
  renderHoursView();
}

function updateFinanceField(field, value) {
  const month = getSelectedMonthRecord();
  if (!month) return;
  month.finance[field] = toNumeric(value);
  saveHoursData();
  renderFinancePanel();
  renderHoursTable();
  renderHoursSummariesIfVisible();
}

function updateProjectHours(workerName, projectName, value) {
  const month = getSelectedMonthRecord();
  const worker = month?.workers.find((item) => item.employee_name === workerName);
  if (!worker) return;

  const hours = toNumeric(value);
  if (hours <= 0) {
    delete worker.project_hours[projectName];
  } else {
    worker.project_hours[projectName] = hours;
  }

  if (!month.visible_investments.includes(projectName)) {
    month.visible_investments.push(projectName);
    month.visible_investments = sortHoursContractNames(month.visible_investments);
  }

  saveHoursData();
  renderFinancePanel();
  renderHoursTable();
  renderHoursSummariesIfVisible();
}

function addEmployeeFromHoursView() {
  const input = document.getElementById("hoursEmployeeNameInput");
  const name = normalizeLabel(input?.value);
  if (!name) return;

  let registry = ensureHoursEmployeeRegistrySeed();
  const existing = registry.find((employee) => normalizeLabel(employee.name) === name);

  if (existing) {
    existing.status = "active";
  } else {
    registry.push({
      name,
      position: "",
      status: "active",
      employment_date: "",
      employment_end_date: "",
      street: "",
      city: "",
      phone: "",
    });
  }

  window.localStorage.setItem("agentEmployeeRegistryV1", JSON.stringify(registry));
  syncHoursEmployeesFromRegistry();
  saveHoursData();
  window.dispatchEvent(new CustomEvent("employee-registry-updated"));

  if (input) input.value = "";
  renderHoursView();
}

function deactivateEmployeeFromHours(workerName) {
  const name = normalizeLabel(workerName);
  if (!name) return;

  const registry = ensureHoursEmployeeRegistrySeed();
  const existing = registry.find((employee) => normalizeLabel(employee.name) === name);
  if (existing) {
    existing.status = "inactive";
    if (!existing.employment_end_date) {
      existing.employment_end_date = new Date().toISOString().slice(0, 10);
    }
    window.localStorage.setItem("agentEmployeeRegistryV1", JSON.stringify(registry));
  }

  syncHoursEmployeesFromRegistry();
  saveHoursData();
  window.dispatchEvent(new CustomEvent("employee-registry-updated"));
  renderHoursView();
}

function removeEmployeeFromHoursData(workerName) {
  const name = normalizeLabel(workerName);
  if (!name) return;

  hoursState.data.employees = (hoursState.data.employees || []).filter((employee) => employee.name !== name);
  Object.values(getMonthMap()).forEach((month) => {
    month.workers = (month.workers || []).filter((worker) => worker.employee_name !== name);
  });

  saveHoursData();
  renderHoursView();
}

function exportHoursJson() {
  const content = JSON.stringify(hoursState.data, null, 2);
  downloadHoursFile(`godziny-backup-${hoursState.selectedMonth || "all"}.json`, content, "application/json;charset=utf-8");
}

function xmlStringCell(value) {
  return `<Cell><Data ss:Type="String">${hEscape(value)}</Data></Cell>`;
}

function xmlNumberCell(value) {
  return `<Cell><Data ss:Type="Number">${Number(value || 0)}</Data></Cell>`;
}

function buildHourEntries() {
  const rows = [];
  Object.values(getMonthMap()).forEach((month) => {
    const monthRh = getMonthRhTotal(month);
    month.workers.forEach((worker) => {
      Object.entries(worker.project_hours || {}).forEach(([investment, hoursRaw]) => {
        const hours = toNumeric(hoursRaw);
        if (!hours) return;
        rows.push({
          month_label: month.month_label,
          month_key: month.month_key,
          employee_name: worker.employee_name,
          worker_code: worker.worker_code || "",
          investment,
          hours,
          rh: monthRh,
          cost: hours * monthRh,
        });
      });
    });
  });
  return rows;
}

function exportHoursExcelXml() {
  const entryRows = buildHourEntries();
  const projectRows = buildYearProjectSummary();
  const employeeRows = buildYearEmployeeSummary();

  const worksheets = [
    {
      name: "Wpisy",
      headers: ["Miesiąc", "Klucz", "Pracownik", "Kod", "Inwestycja", "Godziny", "Roboczogodzina", "Koszt"],
      rows: entryRows.map((row) => [
        xmlStringCell(row.month_label),
        xmlStringCell(row.month_key),
        xmlStringCell(row.employee_name),
        xmlStringCell(row.worker_code),
        xmlStringCell(row.investment),
        xmlNumberCell(row.hours),
        xmlNumberCell(row.rh),
        xmlNumberCell(row.cost),
      ]),
    },
    {
      name: "Inwestycje",
      headers: ["Inwestycja", "Godziny", "Koszt", "Miesiące", "Pracownicy"],
      rows: projectRows.map((row) => [
        xmlStringCell(row.name),
        xmlNumberCell(row.hours),
        xmlNumberCell(row.cost),
        xmlNumberCell(row.months),
        xmlNumberCell(row.workers),
      ]),
    },
    {
      name: "Pracownicy",
      headers: ["Pracownik", "Kod", "Godziny", "Koszt", "Miesiące", "Inwestycje"],
      rows: employeeRows.map((row) => [
        xmlStringCell(row.name),
        xmlStringCell(row.worker_code || ""),
        xmlNumberCell(row.hours),
        xmlNumberCell(row.cost),
        xmlNumberCell(row.months),
        xmlNumberCell(row.projects),
      ]),
    },
  ];

  const xmlSheets = worksheets.map((sheet) => `
    <Worksheet ss:Name="${hEscape(sheet.name)}">
      <Table>
        <Row>${sheet.headers.map((header) => xmlStringCell(header)).join("")}</Row>
        ${sheet.rows.map((cells) => `<Row>${cells.join("")}</Row>`).join("")}
      </Table>
    </Worksheet>
  `).join("");

  const xml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${xmlSheets}
</Workbook>`;

  downloadHoursFile(`godziny-backup-${hoursState.selectedMonth || "all"}.xml`, xml, "application/xml;charset=utf-8");
}

function downloadHoursFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function bindHoursEvents() {
  document.getElementById("monthSelect").addEventListener("change", (event) => {
    hoursState.selectedMonth = event.target.value;
    renderHoursView();
  });

  document.getElementById("employeeSearchInput").addEventListener("input", (event) => {
    hoursState.search = event.target.value || "";
    renderHoursTable();
  });

  document.getElementById("addMonthButton").addEventListener("click", addMonth);
  document.getElementById("addInvestmentButton").addEventListener("click", addInvestment);
  document.getElementById("exportJsonButton").addEventListener("click", exportHoursJson);
  document.getElementById("exportExcelButton").addEventListener("click", exportHoursExcelXml);

  document.getElementById("monthFinancePanel").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.finance) return;
    updateFinanceField(target.dataset.finance, target.value);
  });

  document.getElementById("hoursFormTable").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.worker || !target.dataset.project) return;
    updateProjectHours(target.dataset.worker, target.dataset.project, target.value);
  });

  document.getElementById("hoursFormTable").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-table='hoursWorkers']");
    if (!button) return;
    const month = getSelectedMonthRecord();
    if (!month) return;
    hoursState.sorts.workers = window.AgentTableUtils.nextSort(
      hoursState.sorts.workers,
      button.dataset.sortKey,
      getMonthWorkerColumns(month, getVisibleInvestments(month))
    );
    renderHoursTable();
  });

  document.getElementById("yearProjectSummary").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-table='yearProjects']");
    if (!button) return;
    hoursState.sorts.yearProjects = window.AgentTableUtils.nextSort(
      hoursState.sorts.yearProjects,
      button.dataset.sortKey,
      yearProjectColumns
    );
    renderYearProjectSummary();
  });

  document.getElementById("yearEmployeeSummary").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-table='yearEmployees']");
    if (!button) return;
    hoursState.sorts.yearEmployees = window.AgentTableUtils.nextSort(
      hoursState.sorts.yearEmployees,
      button.dataset.sortKey,
      yearEmployeeColumns
    );
    renderYearEmployeeSummary();
  });
}

function getHoursContractRecord(name) {
  if (typeof window.getContractByName === "function") {
    return window.getContractByName(name);
  }
  return null;
}

function getHoursContractCode(name) {
  if (typeof window.getContractCodeByName === "function") {
    return window.getContractCodeByName(name) || name;
  }
  return name;
}

function getHoursContractReportLabel(name) {
  if (typeof window.getContractReportLabelByName === "function") {
    return window.getContractReportLabelByName(name) || name;
  }
  return name;
}

yearProjectColumns.name.getValue = (item) => getHoursContractReportLabel(item?.name);

function sortHoursContractNames(names) {
  return [...names].sort((left, right) => {
    const leftCode = getHoursContractCode(left);
    const rightCode = getHoursContractCode(right);
    const leftNumeric = Number(leftCode);
    const rightNumeric = Number(rightCode);

    if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && leftNumeric !== rightNumeric) {
      return leftNumeric - rightNumeric;
    }

    return getHoursContractReportLabel(left).localeCompare(getHoursContractReportLabel(right), "pl", {
      sensitivity: "base",
      numeric: true,
    });
  });
}

function getMonthAvailableInvestments(month) {
  return sortHoursContractNames(uniqueStrings([
    ...getContractRegistryNames(),
    ...(hoursState.data.investments || []),
    ...((month && month.visible_investments) || []),
  ]));
}

function getVisibleInvestments(month) {
  const available = getMonthAvailableInvestments(month);
  return sortHoursContractNames(available.filter((name) => month.visible_investments.includes(name)));
}

function loadHoursEmployeeRegistry() {
  try {
    return JSON.parse(window.localStorage.getItem("agentEmployeeRegistryV1") || "[]");
  } catch {
    return [];
  }
}

function ensureHoursEmployeeRegistrySeed() {
  const existingRegistry = loadHoursEmployeeRegistry();
  if (existingRegistry.length) return existingRegistry;

  const seededRegistry = (hoursState.data.employees || []).map((employee) => ({
    name: normalizeLabel(employee.name),
    worker_code: employee.worker_code || "",
    position: "",
    status: "active",
    employment_date: "",
    employment_end_date: "",
    street: "",
    city: "",
    phone: "",
  })).filter((employee) => employee.name);

  if (seededRegistry.length) {
    window.localStorage.setItem("agentEmployeeRegistryV1", JSON.stringify(seededRegistry));
  }

  return seededRegistry;
}

function getHoursActiveEmployeeRecords() {
  const registry = ensureHoursEmployeeRegistrySeed();
  if (!registry.length) {
    return (hoursState.data.employees || []).map((employee) => ({
      name: employee.name,
      worker_code: employee.worker_code || "",
      status: "active",
    }));
  }

  return registry
    .filter((employee) => employee?.status !== "inactive")
    .map((employee) => ({
      name: normalizeLabel(employee.name),
      worker_code: employee.worker_code || "",
      status: employee.status || "active",
    }))
    .filter((employee) => employee.name);
}

function syncHoursEmployeesFromRegistry() {
  const activeEmployees = getHoursActiveEmployeeRecords();
  const activeNames = new Set(activeEmployees.map((employee) => employee.name));
  const monthMap = getMonthMap();

  activeEmployees.forEach((employee) => {
    if (!hoursState.data.employees.some((item) => item.name === employee.name)) {
      hoursState.data.employees.push({
        name: employee.name,
        worker_code: employee.worker_code || "",
        employee_ids: [],
      });
    }
  });

  Object.values(monthMap).forEach((month) => {
    activeEmployees.forEach((employee) => {
      if (!month.workers.some((item) => item.employee_name === employee.name)) {
        month.workers.push(createWorker({ name: employee.name, worker_code: employee.worker_code || "", employee_ids: [] }));
      }
    });

    month.workers = month.workers.filter((worker) => {
      const totalHours = getWorkerTotalHours(worker);
      return activeNames.has(worker.employee_name) || totalHours > 0;
    });
  });

  hoursState.data.employees = hoursState.data.employees
    .filter((employee) => activeNames.has(employee.name) || Object.values(monthMap).some((month) => month.workers.some((worker) => worker.employee_name === employee.name)))
    .sort((left, right) => left.name.localeCompare(right.name, "pl"));
}

function getHoursDisplayWorkers(month) {
  const activeNames = new Set(getHoursActiveEmployeeRecords().map((employee) => employee.name));
  return (month.workers || [])
    .filter((worker) => activeNames.has(worker.employee_name) || getWorkerTotalHours(worker) > 0);
}

function updateMonthInvestment(contractName, isActive) {
  const month = getSelectedMonthRecord();
  if (!month) return;

  const normalizedName = normalizeLabel(contractName);
  if (!normalizedName) return;

  if (isActive) {
    if (!month.visible_investments.includes(normalizedName)) {
      month.visible_investments.push(normalizedName);
      month.visible_investments = sortHoursContractNames(month.visible_investments);
    }
  } else {
    month.visible_investments = month.visible_investments.filter((name) => name !== normalizedName);
    month.workers.forEach((worker) => {
      if (worker?.project_hours && Object.prototype.hasOwnProperty.call(worker.project_hours, normalizedName)) {
        delete worker.project_hours[normalizedName];
      }
    });
  }

  saveHoursData();
  renderHoursView();
}

function renderFinancePanel() {
  const month = getSelectedMonthRecord();
  const target = document.getElementById("monthFinancePanel");
  if (!target) return;

  if (!month) {
    target.innerHTML = "<p>Brak miesi&#261;ca.</p>";
    return;
  }

  const totalHours = getMonthTotalHours(month);
  const totalCosts = getMonthTotalCosts(month);
  const totalPayouts = getMonthTotalPayouts(month);
  const totalOutflow = totalPayouts + totalCosts;
  const rhPayout = getMonthRhFromPayouts(month);
  const rhCosts = getMonthRhFromCosts(month);
  const rhTotal = getMonthRhTotal(month);

  target.innerHTML = `
    <div class="finance-grid finance-grid-primary">
      <div class="finance-stack">
        <label class="finance-field">
          <span>ZUS firma 1</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_1) || ""}" data-finance="zus_company_1">
        </label>
        <label class="finance-field">
          <span>PIT-4 firma 1</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.pit4_company_1) || ""}" data-finance="pit4_company_1">
        </label>
      </div>
      <div class="finance-stack">
        <label class="finance-field">
          <span>ZUS firma 2</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_2) || ""}" data-finance="zus_company_2">
        </label>
        <label class="finance-field">
          <span>PIT-4 firma 2</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.pit4_company_2) || ""}" data-finance="pit4_company_2">
        </label>
      </div>
      <div class="finance-stack">
        <label class="finance-field">
          <span>ZUS firma 3</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.zus_company_3) || ""}" data-finance="zus_company_3">
        </label>
        <label class="finance-field">
          <span>PIT-4 firma 3</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.pit4_company_3) || ""}" data-finance="pit4_company_3">
        </label>
      </div>
      <div class="finance-stack">
        <label class="finance-field">
          <span>Wypłaty</span>
          <input type="number" step="0.01" min="0" value="${toNumeric(month.finance.payouts) || ""}" data-finance="payouts">
        </label>
        <label class="finance-field">
          <span>Wypłata + koszty</span>
          <strong>${hMoney(totalOutflow)}</strong>
        </label>
      </div>
    </div>
    <div class="finance-grid finance-grid-secondary">
      <label class="finance-field">
        <span>RH z wypłat</span>
        <strong>${hMoney(rhPayout)}</strong>
      </label>
      <label class="finance-field">
        <span>RH z kosztów</span>
        <strong>${hMoney(rhCosts)}</strong>
      </label>
      <label class="finance-field">
        <span>Koszty razem</span>
        <strong>${hMoney(totalCosts)}</strong>
      </label>
    </div>
    <div class="finance-grid finance-grid-tertiary">
      <label class="finance-field finance-field-summary">
        <span>Suma godzin</span>
        <strong>${hNumber(totalHours)}</strong>
      </label>
      <label class="finance-field finance-field-emphasis">
        <span>Roboczogodzina</span>
        <strong>${hMoney(rhTotal)}</strong>
      </label>
    </div>
  `;
}

function renderHoursView() {
  renderHoursMeta();
  renderMonthOptions();
  renderMonthlyContractsSelector();
  renderFinancePanel();
  renderInvestmentPills();
  renderHoursTable();
  renderHoursSummariesIfVisible();
}

function renderHoursViewIfActive() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("hoursView")) {
    return;
  }
  renderHoursView();
}

function bindHoursEvents() {
  document.getElementById("monthSelect").addEventListener("change", (event) => {
    hoursState.selectedMonth = event.target.value;
    renderHoursView();
  });

  document.getElementById("employeeSearchInput").addEventListener("input", (event) => {
    hoursState.search = event.target.value || "";
    renderHoursTable();
  });

  document.getElementById("addMonthButton").addEventListener("click", addMonth);
  document.getElementById("deleteMonthButton").addEventListener("click", deleteSelectedMonth);
  document.getElementById("addHoursEmployeeButton").addEventListener("click", addEmployeeFromHoursView);
  document.getElementById("exportJsonButton").addEventListener("click", exportHoursJson);
  document.getElementById("exportExcelButton").addEventListener("click", exportHoursExcelXml);

  document.getElementById("monthFinancePanel").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.finance) return;
    updateFinanceField(target.dataset.finance, target.value);
  });

  document.getElementById("monthlyContractsSelector").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.type !== "checkbox" || !target.dataset.contractName) return;
    updateMonthInvestment(target.dataset.contractName, target.checked);
  });

  document.getElementById("hoursFormTable").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.worker || !target.dataset.project) return;
    updateProjectHours(target.dataset.worker, target.dataset.project, target.value);
  });

  document.getElementById("hoursFormTable").addEventListener("click", (event) => {
    const removeButton = event.target.closest("button[data-remove-worker]");
    if (removeButton) {
      deactivateEmployeeFromHours(removeButton.dataset.removeWorker);
      return;
    }

    const button = event.target.closest("button[data-sort-table='hoursWorkers']");
    if (!button) return;
    const month = getSelectedMonthRecord();
    if (!month) return;
    hoursState.sorts.workers = window.AgentTableUtils.nextSort(
      hoursState.sorts.workers,
      button.dataset.sortKey,
      getMonthWorkerColumns(month, getVisibleInvestments(month))
    );
    renderHoursTable();
  });

  document.getElementById("yearProjectSummary").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-table='yearProjects']");
    if (!button) return;
    hoursState.sorts.yearProjects = window.AgentTableUtils.nextSort(
      hoursState.sorts.yearProjects,
      button.dataset.sortKey,
      yearProjectColumns
    );
    renderYearProjectSummary();
  });

  document.getElementById("yearEmployeeSummary").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sort-table='yearEmployees']");
    if (!button) return;
    hoursState.sorts.yearEmployees = window.AgentTableUtils.nextSort(
      hoursState.sorts.yearEmployees,
      button.dataset.sortKey,
      yearEmployeeColumns
    );
    renderYearEmployeeSummary();
  });

  document.querySelectorAll("[data-collapse-target]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleHoursSummaryPanel(button.dataset.collapseTarget);
    });
  });

  document.querySelectorAll("[data-pdf-target]").forEach((button) => {
    button.addEventListener("click", () => {
      exportSummaryToPdf(button.dataset.pdfTarget);
    });
  });

  window.addEventListener("contract-registry-updated", () => {
    renderHoursViewIfActive();
  });
  window.addEventListener("employee-registry-updated", () => {
    syncHoursEmployeesFromRegistry();
    saveHoursData();
    renderHoursViewIfActive();
  });
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "hoursView") {
      renderHoursView();
    }
  });
}

function initHoursForm() {
  const baseData = createBaseData(hoursState.seed);
  hoursState.data = mergeSavedData(baseData, loadHoursData());
  syncHoursEmployeesFromRegistry();
  saveHoursData();
  const monthKeys = Object.keys(getMonthMap()).sort();
  const preferredMonth = hoursState.seed.default_month;
  hoursState.selectedMonth = getMonthMap()[preferredMonth]
    ? preferredMonth
    : (monthKeys.length ? monthKeys[monthKeys.length - 1] : "");
  bindHoursEvents();
  renderHoursViewIfActive();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHoursForm);
} else {
  initHoursForm();
}

window.removeEmployeeFromHoursData = removeEmployeeFromHoursData;
