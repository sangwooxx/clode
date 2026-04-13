const WORKWEAR_STORAGE_KEY = "clodeWorkwearRegistryV1";
const WORKWEAR_CATALOG_STORAGE_KEY = "clodeWorkwearCatalogV1";
const WORKWEAR_TABLE_SORT_KEY = "clodeWorkwearTableSortV1";

const WORKWEAR_SIZE_OPTIONS = [
  "UNI",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
];

const DEFAULT_WORKWEAR_CATALOG = [
  { id: "ww-cat-helmet", name: "Kask ochronny", category: "BHP", notes: "Standard podstawowy" },
  { id: "ww-cat-vest", name: "Kamizelka ostrzegawcza", category: "BHP", notes: "Widoczność" },
  { id: "ww-cat-jacket", name: "Kurtka robocza", category: "Odzież wierzchnia", notes: "Sezon jesień-zima" },
  { id: "ww-cat-pants", name: "Spodnie robocze", category: "Odzież robocza", notes: "Model podstawowy" },
  { id: "ww-cat-shirt", name: "Koszulka robocza", category: "Odzież robocza", notes: "Sezon letni" },
  { id: "ww-cat-shoes", name: "Buty ochronne", category: "Obuwie", notes: "Buty z podnoskiem" },
  { id: "ww-cat-gloves", name: "Rękawice robocze", category: "BHP", notes: "Zużycie bieżące" },
];

const workwearState = window.__clodeWorkwearState || {
  selectedEmployee: "",
  search: "",
  editingEntryId: "",
  editingCatalogId: "",
  selectedEntryIds: [],
  selectedEntryRowId: "",
  initialized: false,
  sorts: null,
};

window.__clodeWorkwearState = workwearState;

function workwearDefaultSorts() {
  return {
    catalog: { key: "name", direction: "asc" },
    employees: { key: "last_name", direction: "asc" },
    entries: { key: "issue_date", direction: "desc" },
  };
}

function workwearReadStore(storageKey, fallbackValue) {
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

function workwearWriteStore(storageKey, value) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(storageKey, value);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}

function workwearLoadSorts() {
  const defaults = workwearDefaultSorts();
  const parsed = workwearReadStore(WORKWEAR_TABLE_SORT_KEY, null);
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
    catalog: normalize(parsed.catalog, defaults.catalog),
    employees: normalize(parsed.employees, defaults.employees),
    entries: normalize(parsed.entries, defaults.entries),
  };
}

function workwearSaveSorts() {
  workwearWriteStore(WORKWEAR_TABLE_SORT_KEY, workwearState.sorts || workwearDefaultSorts());
}

function workwearRenderHeader(label, tableName, key, sortState) {
  if (!window.ClodeTableUtils?.renderHeader) return workwearEscape(label);
  return window.ClodeTableUtils.renderHeader(label, tableName, key, sortState);
}

function workwearCatalogColumnMap() {
  return {
    name: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.name || "") },
    category: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.category || "") },
    notes: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.notes || "") },
  };
}

function workwearEmployeesColumnMap() {
  return {
    last_name: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.last_name || "") },
    first_name: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.first_name || "") },
    position: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.position || "") },
    issues_count: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.issues_count || 0) },
    last_issue_date: { type: "date", defaultDirection: "desc", getValue: (row) => String(row.last_issue_date || "") },
  };
}

function workwearEntriesColumnMap() {
  return {
    issue_date: { type: "date", defaultDirection: "desc", getValue: (row) => String(row.issue_date || "") },
    item_name: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.item_name || "") },
    size: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.size || "") },
    quantity: { type: "number", defaultDirection: "desc", getValue: (row) => Number(row.quantity || 0) },
    notes: { type: "string", defaultDirection: "asc", getValue: (row) => String(row.notes || "") },
  };
}

function workwearEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function workwearText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function workwearNameParts(value) {
  return window.EmployeeNameUtils?.split?.(value) || {
    firstName: "",
    lastName: workwearText(value),
    displayName: workwearText(value),
    searchText: workwearText(value).toLowerCase(),
  };
}

function workwearDisplayName(value) {
  return window.EmployeeNameUtils?.display?.(value) || workwearText(value);
}

function workwearSearchText(value) {
  return window.EmployeeNameUtils?.searchText?.(value) || workwearText(value).toLowerCase();
}

function loadWorkwearRegistry() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(WORKWEAR_STORAGE_KEY, [])
    : [];
  return Array.isArray(parsed) ? parsed : [];
}

function saveWorkwearRegistry(registry) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(WORKWEAR_STORAGE_KEY, registry, { eventName: "workwear-registry-updated" });
    return;
  }
  window.localStorage.setItem(WORKWEAR_STORAGE_KEY, JSON.stringify(registry));
  window.dispatchEvent(new CustomEvent("workwear-registry-updated"));
}

function loadWorkwearCatalog() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(WORKWEAR_CATALOG_STORAGE_KEY, null)
    : null;
  if (Array.isArray(parsed) && parsed.length) {
    return parsed;
  }
  return [];
}

function saveWorkwearCatalog(catalog) {
  if (window.ClodeDataAccess?.legacy) {
    window.ClodeDataAccess.legacy.write(WORKWEAR_CATALOG_STORAGE_KEY, catalog, { eventName: "workwear-catalog-updated" });
    return;
  }
  window.localStorage.setItem(WORKWEAR_CATALOG_STORAGE_KEY, JSON.stringify(catalog));
  window.dispatchEvent(new CustomEvent("workwear-catalog-updated"));
}

function getWorkwearEmployees() {
  return typeof window.getEmployeeRoster === "function" ? window.getEmployeeRoster() : [];
}

function getWorkwearEntriesForEmployee(employeeName) {
  return loadWorkwearRegistry()
    .filter((entry) => entry.employee_name === employeeName)
    .sort((left, right) => String(right.issue_date || "").localeCompare(String(left.issue_date || ""), "pl"));
}

function getWorkwearEntryById(entryId) {
  return loadWorkwearRegistry().find((entry) => entry.id === entryId) || null;
}

function getCatalogItemById(itemId) {
  return loadWorkwearCatalog().find((item) => item.id === itemId) || null;
}

function ensureSelectedEmployee() {
  const employees = getWorkwearEmployees();
  if (!employees.length) {
    workwearState.selectedEmployee = "";
    return;
  }
  if (!employees.some((employee) => employee.name === workwearState.selectedEmployee)) {
    workwearState.selectedEmployee = employees[0].name;
  }
}

function renderWorkwearEmployeeSelect() {
  const select = document.getElementById("workwearEmployeeSelect");
  if (!select) return;
  const employees = getWorkwearEmployees();
  select.innerHTML = employees.map((employee) => `
    <option value="${workwearEscape(employee.name)}"${employee.name === workwearState.selectedEmployee ? " selected" : ""}>
      ${workwearEscape(workwearDisplayName(employee))}
    </option>
  `).join("");
}

function renderWorkwearProductSelect() {
  const select = document.getElementById("workwearProductSelect");
  if (!select) return;
  const catalog = loadWorkwearCatalog().sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pl", {
    sensitivity: "base",
    numeric: true,
  }));
  select.innerHTML = catalog.map((item) => `
    <option value="${workwearEscape(item.id)}">${workwearEscape(item.name)}</option>
  `).join("");
}

function renderWorkwearSizeSelect() {
  const select = document.getElementById("workwearSizeSelect");
  if (!select) return;
  select.innerHTML = WORKWEAR_SIZE_OPTIONS.map((size) => `
    <option value="${workwearEscape(size)}">${workwearEscape(size)}</option>
  `).join("");
}

function resetWorkwearForm() {
  workwearState.editingEntryId = "";
  document.getElementById("workwearFormHeading").textContent = "Nowe wydanie";
  document.getElementById("saveWorkwearButton").textContent = "Zapisz";
  if (workwearState.selectedEmployee) {
    document.getElementById("workwearEmployeeSelect").value = workwearState.selectedEmployee;
  }
  document.getElementById("workwearIssueDateInput").value = new Date().toISOString().slice(0, 10);
  document.getElementById("workwearQtyInput").value = "1";
  document.getElementById("workwearNotesInput").value = "";
  if (document.getElementById("workwearProductSelect").options.length) {
    document.getElementById("workwearProductSelect").selectedIndex = 0;
  }
  document.getElementById("workwearSizeSelect").value = "UNI";
}

function resetCatalogForm() {
  workwearState.editingCatalogId = "";
  document.getElementById("workwearCatalogNameInput").value = "";
  document.getElementById("workwearCatalogCategoryInput").value = "";
  document.getElementById("workwearCatalogNotesInput").value = "";
  document.getElementById("saveWorkwearCatalogButton").textContent = "Zapisz";
}

function fillCatalogForm(itemId) {
  const item = getCatalogItemById(itemId);
  if (!item) {
    resetCatalogForm();
    return;
  }
  workwearState.editingCatalogId = item.id;
  document.getElementById("workwearCatalogNameInput").value = item.name || "";
  document.getElementById("workwearCatalogCategoryInput").value = item.category || "";
  document.getElementById("workwearCatalogNotesInput").value = item.notes || "";
  document.getElementById("saveWorkwearCatalogButton").textContent = "Zapisz zmiany";
}

function fillWorkwearForm(entryId) {
  const entry = getWorkwearEntryById(entryId);
  if (!entry) {
    resetWorkwearForm();
    return;
  }

  workwearState.editingEntryId = entry.id;
  workwearState.selectedEmployee = entry.employee_name;
  document.getElementById("workwearFormHeading").textContent = `Edycja wydania: ${entry.item_name}`;
  document.getElementById("saveWorkwearButton").textContent = "Zapisz zmiany";
  document.getElementById("workwearEmployeeSelect").value = entry.employee_name || "";
  document.getElementById("workwearIssueDateInput").value = entry.issue_date || "";
  document.getElementById("workwearProductSelect").value = entry.item_id || "";
  document.getElementById("workwearSizeSelect").value = entry.size || "UNI";
  document.getElementById("workwearQtyInput").value = String(entry.quantity || 1);
  document.getElementById("workwearNotesInput").value = entry.notes || "";
}

function renderWorkwearCatalogTable() {
  const target = document.getElementById("workwearCatalogTable");
  if (!target) return;
  const catalog = loadWorkwearCatalog().map((item) => ({ ...item }));
  const sortState = workwearState.sorts?.catalog || workwearDefaultSorts().catalog;
  const sortedCatalog = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(catalog, sortState, workwearCatalogColumnMap())
    : catalog;

  target.innerHTML = `
    <table class="data-table invoice-module-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${workwearRenderHeader("Produkt", "workwearCatalog", "name", sortState)}</th>
          <th>${workwearRenderHeader("Kategoria", "workwearCatalog", "category", sortState)}</th>
          <th>${workwearRenderHeader("Opis standardu", "workwearCatalog", "notes", sortState)}</th>
          <th class="control-col">Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${sortedCatalog.map((item, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${workwearEscape(item.name)}</td>
            <td>${workwearEscape(item.category || "-")}</td>
            <td>${workwearEscape(item.notes || "-")}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-workwear-catalog-edit="${workwearEscape(item.id)}">Edytuj</button>
              <button class="table-action-button danger-button" type="button" data-workwear-catalog-delete="${workwearEscape(item.id)}">Usuń</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderWorkwearEmployeesTable() {
  const target = document.getElementById("workwearEmployeesTable");
  if (!target) return;

  const rows = getWorkwearEmployees()
    .filter((employee) => {
      if (!workwearState.search) return true;
      return workwearSearchText(employee).includes(workwearState.search.toLowerCase());
    })
    .map((employee) => {
      const entries = getWorkwearEntriesForEmployee(employee.name);
      return {
        ...employee,
        issues_count: entries.length,
        last_issue_date: entries[0]?.issue_date || "",
      };
    });

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracowników dla podanego filtra.</p>";
    return;
  }

  ensureSelectedEmployee();
  const sortState = workwearState.sorts?.employees || workwearDefaultSorts().employees;
  const sortedRows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(rows, sortState, workwearEmployeesColumnMap())
    : rows;
  target.innerHTML = `
    <table class="data-table invoice-module-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>${workwearRenderHeader("Nazwisko", "workwearEmployees", "last_name", sortState)}</th>
          <th>${workwearRenderHeader("Imię", "workwearEmployees", "first_name", sortState)}</th>
          <th>${workwearRenderHeader("Stanowisko", "workwearEmployees", "position", sortState)}</th>
          <th>${workwearRenderHeader("Liczba wydań", "workwearEmployees", "issues_count", sortState)}</th>
          <th>${workwearRenderHeader("Ostatnie wydanie", "workwearEmployees", "last_issue_date", sortState)}</th>
          <th class="control-col">Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${sortedRows.map((employee, index) => `
          <tr class="clickable-row${employee.name === workwearState.selectedEmployee ? " is-selected" : ""}" data-workwear-employee="${workwearEscape(employee.name)}">
            <td>${index + 1}</td>
            <td>${workwearEscape(employee.last_name || "-")}</td>
            <td>${workwearEscape(employee.first_name || "-")}</td>
            <td>${workwearEscape(employee.position || "-")}</td>
            <td>${workwearEscape(String(employee.issues_count))}</td>
            <td>${workwearEscape(employee.last_issue_date || "-")}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-workwear-open="${workwearEscape(employee.name)}">Edytuj</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function exportWorkwearCardPdf(employee, entries) {
  const popup = window.open("", "_blank", "width=1200,height=900");
  if (!popup) return;

  const rowsHtml = entries.length
    ? entries.map((entry) => `
        <tr>
          <td>${workwearEscape(entry.issue_date || "-")}</td>
          <td>${workwearEscape(entry.item_name || "-")}</td>
          <td>${workwearEscape(entry.size || "-")}</td>
          <td>${workwearEscape(String(entry.quantity || 1))}</td>
          <td>${workwearEscape(entry.notes || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5">Brak wpisów.</td></tr>`;

  popup.document.write(`<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <title>Karta przekazania odzieży</title>
  <style>
    ${(window.ClodePrintUtils?.baseCss ? window.ClodePrintUtils.baseCss() : `
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
    `.trim())}
    .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 48px; }
    .box span { display: block; font-size: 11px; color: #666; margin-bottom: 32px; text-transform: none; letter-spacing: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Karta przekazania odzieży roboczej</h1>
    <p>${workwearEscape(workwearDisplayName(employee))} • Data wydruku: ${workwearEscape(new Date().toLocaleDateString("pl-PL"))}</p>
  </div>
  <div class="meta">
    <div><span>Pracownik</span><strong>${workwearEscape(workwearDisplayName(employee))}</strong></div>
    <div><span>Zatrudniony od</span><strong>${workwearEscape(employee.employment_date || "-")}</strong></div>
    <div><span>Adres</span><strong>${workwearEscape(employee.street || "-")}</strong></div>
    <div><span>Kod i miejscowość</span><strong>${workwearEscape(employee.city || "-")}</strong></div>
    <div><span>Telefon</span><strong>${workwearEscape(employee.phone || "-")}</strong></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Data wydania</th>
        <th>Produkt</th>
        <th>Rozmiar</th>
        <th>Ilość</th>
        <th>Uwagi</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="signatures">
    <div class="box"><span>Wydający</span><strong>........................................</strong></div>
    <div class="box"><span>Pracownik</span><strong>........................................</strong></div>
  </div>
</body>
</html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

function renderWorkwearCard() {
  const target = document.getElementById("workwearCardView");
  if (!target) return;
  const employee = typeof window.getEmployeeProfileByName === "function"
    ? window.getEmployeeProfileByName(workwearState.selectedEmployee)
    : null;

  if (!employee) {
    target.innerHTML = "<p>Wybierz pracownika ze spisu.</p>";
    return;
  }

  const entries = getWorkwearEntriesForEmployee(employee.name);
  const entrySort = workwearState.sorts?.entries || workwearDefaultSorts().entries;
  const sortedEntries = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(entries, entrySort, workwearEntriesColumnMap())
    : entries;
  const selectedSet = new Set((workwearState.selectedEntryIds || []).map((id) => String(id)));
  const allSelected = entries.length > 0 && entries.every((entry) => selectedSet.has(String(entry.id)));
  target.innerHTML = `
    <div class="record-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Karta przekazania odzieży</p>
          <h2>${workwearEscape(workwearDisplayName(employee))}</h2>
        </div>
        <div class="detail-actions">
          <button id="printWorkwearCardButton" class="clicker-button" type="button">PDF karty</button>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div><span>Adres</span><strong>${workwearEscape(employee.street || "-")}</strong></div>
        <div><span>Kod i miejscowość</span><strong>${workwearEscape(employee.city || "-")}</strong></div>
        <div><span>Telefon</span><strong>${workwearEscape(employee.phone || "-")}</strong></div>
        <div><span>Zatrudniony od</span><strong>${workwearEscape(employee.employment_date || "-")}</strong></div>
      </div>
      <div class="form-table-shell">
        <table class="data-table invoice-module-table module-table workwear-entries-table">
          <thead>
            <tr>
              <th class="checkbox-cell"><input id="workwearEntrySelectAll" type="checkbox"${allSelected ? " checked" : ""}></th>
              <th>Lp.</th>
              <th>${workwearRenderHeader("Data wydania", "workwearEntries", "issue_date", entrySort)}</th>
              <th>${workwearRenderHeader("Produkt", "workwearEntries", "item_name", entrySort)}</th>
              <th>${workwearRenderHeader("Rozmiar", "workwearEntries", "size", entrySort)}</th>
              <th>${workwearRenderHeader("Ilość", "workwearEntries", "quantity", entrySort)}</th>
              <th>${workwearRenderHeader("Uwagi", "workwearEntries", "notes", entrySort)}</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            ${sortedEntries.length ? sortedEntries.map((entry, index) => `
              <tr class="clickable-row${String(entry.id) === String(workwearState.selectedEntryRowId || "") ? " is-selected" : ""}" data-workwear-entry-row-id="${workwearEscape(entry.id)}">
                <td class="checkbox-cell">
                  <input type="checkbox" data-workwear-entry-select="${workwearEscape(entry.id)}"${selectedSet.has(String(entry.id)) ? " checked" : ""}>
                </td>
                <td>${index + 1}</td>
                <td>${workwearEscape(entry.issue_date || "-")}</td>
                <td>${workwearEscape(entry.item_name || "-")}</td>
                <td>${workwearEscape(entry.size || "-")}</td>
                <td>${workwearEscape(String(entry.quantity || 1))}</td>
                <td>${workwearEscape(entry.notes || "-")}</td>
                <td class="action-cell">
                  <button class="table-action-button" type="button" data-workwear-edit="${workwearEscape(entry.id)}">Edytuj</button>
                  <button class="table-action-button danger-button" type="button" data-workwear-delete="${workwearEscape(entry.id)}">Usuń</button>
                </td>
              </tr>
            `).join("") : `
              <tr>
                <td colspan="8">Brak wydań dla tego pracownika.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
      <div class="signature-grid">
        <div class="signature-box">
          <span>Wydający</span>
          <strong>........................................</strong>
        </div>
        <div class="signature-box">
          <span>Pracownik</span>
          <strong>........................................</strong>
        </div>
      </div>
    </div>
  `;
}

function renderWorkwearModule() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("workwearView")) return;
  ensureSelectedEmployee();
  renderWorkwearEmployeeSelect();
  renderWorkwearProductSelect();
  renderWorkwearSizeSelect();
  renderWorkwearCatalogTable();
  renderWorkwearEmployeesTable();
  renderWorkwearCard();
  if (workwearState.editingEntryId) {
    fillWorkwearForm(workwearState.editingEntryId);
  } else {
    resetWorkwearForm();
  }
  if (workwearState.editingCatalogId) {
    fillCatalogForm(workwearState.editingCatalogId);
  } else {
    resetCatalogForm();
  }
}

function saveCatalogItem() {
  const name = workwearText(document.getElementById("workwearCatalogNameInput").value);
  if (!name) {
    window.alert("Podaj nazwę produktu.");
    return;
  }

  const catalog = loadWorkwearCatalog();
  const existing = catalog.find((item) => item.id === workwearState.editingCatalogId);
  const duplicate = catalog.find((item) => item.name.toLowerCase() === name.toLowerCase() && item.id !== workwearState.editingCatalogId);
  if (duplicate) {
    window.alert("Taki produkt już istnieje w katalogu.");
    return;
  }

  const payload = {
    id: existing?.id || `ww-cat-${Date.now()}`,
    name,
    category: workwearText(document.getElementById("workwearCatalogCategoryInput").value),
    notes: workwearText(document.getElementById("workwearCatalogNotesInput").value),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    catalog.push(payload);
  }

  saveWorkwearCatalog(catalog);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Odzież robocza",
      existing ? "Zaktualizowano produkt" : "Dodano produkt",
      name,
      payload.category ? `Kategoria: ${payload.category}` : ""
    );
  }
  workwearState.editingCatalogId = payload.id;
  renderWorkwearModule();
}

function deleteCatalogItem(itemId) {
  const item = getCatalogItemById(itemId);
  if (!item) return;
  if (!window.confirm(`Czy na pewno chcesz usunąć produkt ${item.name} z katalogu?`)) return;

  const registry = loadWorkwearRegistry();
  if (registry.some((entry) => entry.item_id === itemId)) {
    window.alert("Nie można usunąć produktu, który został już wydany pracownikowi.");
    return;
  }

  saveWorkwearCatalog(loadWorkwearCatalog().filter((catalogItem) => catalogItem.id !== itemId));
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Odzież robocza", "Usunięto produkt", item.name, "");
  }
  if (workwearState.editingCatalogId === itemId) {
    resetCatalogForm();
  }
  renderWorkwearModule();
}

function saveWorkwearIssue() {
  const employeeName = workwearText(document.getElementById("workwearEmployeeSelect").value);
  const productId = workwearText(document.getElementById("workwearProductSelect").value);
  const product = getCatalogItemById(productId);
  if (!employeeName || !product) {
    window.alert("Wybierz pracownika i produkt z katalogu.");
    return;
  }

  const registry = loadWorkwearRegistry();
  const existing = registry.find((entry) => entry.id === workwearState.editingEntryId);
  const payload = {
    employee_name: employeeName,
    issue_date: String(document.getElementById("workwearIssueDateInput").value || ""),
    item_id: product.id,
    item_name: product.name,
    size: workwearText(document.getElementById("workwearSizeSelect").value || "UNI"),
    quantity: Number(document.getElementById("workwearQtyInput").value || 1),
    notes: workwearText(document.getElementById("workwearNotesInput").value),
  };

  if (existing) {
    Object.assign(existing, payload);
  } else {
    registry.push({ id: `ww-${Date.now()}`, ...payload });
  }

  saveWorkwearRegistry(registry);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog(
      "Odzież robocza",
      existing ? "Zaktualizowano wydanie" : "Dodano wydanie",
      `${employeeName} / ${product.name}`,
      payload.issue_date ? `Data wydania: ${payload.issue_date}` : ""
    );
  }
  workwearState.selectedEmployee = employeeName;
  resetWorkwearForm();
  renderWorkwearModule();
}

function deleteWorkwearIssue(entryId) {
  const entry = getWorkwearEntryById(entryId);
  if (!entry) return;
  if (!window.confirm(`Czy na pewno chcesz usunąć wydanie ${entry.item_name}?`)) return;

  saveWorkwearRegistry(loadWorkwearRegistry().filter((item) => item.id !== entryId));
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Odzież robocza", "Usunięto wydanie", `${entry.employee_name} / ${entry.item_name}`, "");
  }
  if (workwearState.editingEntryId === entryId) {
    resetWorkwearForm();
  }
  renderWorkwearModule();
}

function initWorkwearView() {
  if (workwearState.initialized || !document.getElementById("workwearView")) return;

  ensureSelectedEmployee();
  if (!workwearState.sorts) {
    workwearState.sorts = workwearLoadSorts();
  }
  document.getElementById("newWorkwearButton")?.addEventListener("click", resetWorkwearForm);
  document.getElementById("saveWorkwearButton")?.addEventListener("click", saveWorkwearIssue);
  document.getElementById("newWorkwearCatalogButton")?.addEventListener("click", resetCatalogForm);
  document.getElementById("saveWorkwearCatalogButton")?.addEventListener("click", saveCatalogItem);
  document.getElementById("workwearSearchInput")?.addEventListener("input", (event) => {
    workwearState.search = String(event.target.value || "");
    renderWorkwearModule();
  });
  document.getElementById("workwearEmployeesTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='workwearEmployees']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      workwearState.sorts = workwearState.sorts || workwearDefaultSorts();
      workwearState.sorts.employees = window.ClodeTableUtils.nextSort(
        workwearState.sorts.employees || workwearDefaultSorts().employees,
        sortButton.dataset.sortKey,
        workwearEmployeesColumnMap()
      );
      workwearSaveSorts();
      renderWorkwearEmployeesTable();
      return;
    }

    const editButton = event.target.closest("[data-workwear-open]");
    if (editButton) {
      workwearState.selectedEmployee = editButton.dataset.workwearOpen;
      workwearState.editingEntryId = "";
      workwearState.selectedEntryIds = [];
      workwearState.selectedEntryRowId = "";
      renderWorkwearModule();
      return;
    }
    const row = event.target.closest("[data-workwear-employee]");
    if (!row) return;
    workwearState.selectedEmployee = row.dataset.workwearEmployee;
    workwearState.editingEntryId = "";
    workwearState.selectedEntryIds = [];
    workwearState.selectedEntryRowId = "";
    renderWorkwearModule();
  });
  document.getElementById("workwearCardView")?.addEventListener("change", (event) => {
    const selectAll = event.target.closest("#workwearEntrySelectAll");
    if (selectAll) {
      const employee = typeof window.getEmployeeProfileByName === "function"
        ? window.getEmployeeProfileByName(workwearState.selectedEmployee)
        : null;
      const entries = employee ? getWorkwearEntriesForEmployee(employee.name) : [];
      workwearState.selectedEntryIds = selectAll.checked ? entries.map((entry) => String(entry.id)) : [];
      renderWorkwearCard();
      return;
    }
    const checkbox = event.target.closest("[data-workwear-entry-select]");
    if (!checkbox) return;
    const entryId = String(checkbox.dataset.workwearEntrySelect || "");
    if (!entryId) return;
    const current = new Set((workwearState.selectedEntryIds || []).map((id) => String(id)));
    if (checkbox.checked) current.add(entryId);
    else current.delete(entryId);
    workwearState.selectedEntryIds = [...current];
    renderWorkwearCard();
  });
  document.getElementById("workwearCardView")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='workwearEntries']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      workwearState.sorts = workwearState.sorts || workwearDefaultSorts();
      workwearState.sorts.entries = window.ClodeTableUtils.nextSort(
        workwearState.sorts.entries || workwearDefaultSorts().entries,
        sortButton.dataset.sortKey,
        workwearEntriesColumnMap()
      );
      workwearSaveSorts();
      renderWorkwearCard();
      return;
    }

    if (event.target.closest("input[type='checkbox']") || event.target.closest("button")) {
      // keep checkbox/button interactions without toggling selection highlight
    } else {
      const row = event.target.closest("[data-workwear-entry-row-id]");
      if (row?.dataset?.workwearEntryRowId) {
        workwearState.selectedEntryRowId = row.dataset.workwearEntryRowId;
        renderWorkwearCard();
        return;
      }
    }

    const printButton = event.target.closest("#printWorkwearCardButton");
    if (printButton) {
      const employee = typeof window.getEmployeeProfileByName === "function"
        ? window.getEmployeeProfileByName(workwearState.selectedEmployee)
        : null;
      if (!employee) return;
      const allEntries = getWorkwearEntriesForEmployee(employee.name);
      const selectedSet = new Set((workwearState.selectedEntryIds || []).map((id) => String(id)));
      const entries = selectedSet.size ? allEntries.filter((entry) => selectedSet.has(String(entry.id))) : allEntries;
      exportWorkwearCardPdf(employee, entries);
      return;
    }
    const editButton = event.target.closest("[data-workwear-edit]");
    if (editButton) {
      fillWorkwearForm(editButton.dataset.workwearEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-workwear-delete]");
    if (deleteButton) {
      deleteWorkwearIssue(deleteButton.dataset.workwearDelete);
    }
  });
  document.getElementById("workwearCatalogTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='workwearCatalog']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      workwearState.sorts = workwearState.sorts || workwearDefaultSorts();
      workwearState.sorts.catalog = window.ClodeTableUtils.nextSort(
        workwearState.sorts.catalog || workwearDefaultSorts().catalog,
        sortButton.dataset.sortKey,
        workwearCatalogColumnMap()
      );
      workwearSaveSorts();
      renderWorkwearCatalogTable();
      return;
    }

    const editButton = event.target.closest("[data-workwear-catalog-edit]");
    if (editButton) {
      fillCatalogForm(editButton.dataset.workwearCatalogEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-workwear-catalog-delete]");
    if (deleteButton) {
      deleteCatalogItem(deleteButton.dataset.workwearCatalogDelete);
    }
  });

  window.addEventListener("employee-registry-updated", renderWorkwearModule);
  window.addEventListener("workwear-registry-updated", renderWorkwearModule);
  window.addEventListener("workwear-catalog-updated", renderWorkwearModule);
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "workwearView") renderWorkwearModule();
  });

  workwearState.initialized = true;
  renderWorkwearModule();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkwearView);
} else {
  initWorkwearView();
}

