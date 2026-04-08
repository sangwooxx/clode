const WORKWEAR_STORAGE_KEY = "agentWorkwearRegistryV1";
const WORKWEAR_CATALOG_STORAGE_KEY = "agentWorkwearCatalogV1";

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

const workwearState = window.__agentWorkwearState || {
  selectedEmployee: "",
  search: "",
  editingEntryId: "",
  editingCatalogId: "",
  initialized: false,
};

window.__agentWorkwearState = workwearState;

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
  const parsed = window.AgentDataAccess?.legacy
    ? window.AgentDataAccess.legacy.read(WORKWEAR_STORAGE_KEY, [])
    : [];
  return Array.isArray(parsed) ? parsed : [];
}

function saveWorkwearRegistry(registry) {
  if (window.AgentDataAccess?.legacy) {
    window.AgentDataAccess.legacy.write(WORKWEAR_STORAGE_KEY, registry, { eventName: "workwear-registry-updated" });
    return;
  }
  window.localStorage.setItem(WORKWEAR_STORAGE_KEY, JSON.stringify(registry));
  window.dispatchEvent(new CustomEvent("workwear-registry-updated"));
}

function loadWorkwearCatalog() {
  const parsed = window.AgentDataAccess?.legacy
    ? window.AgentDataAccess.legacy.read(WORKWEAR_CATALOG_STORAGE_KEY, null)
    : null;
  if (Array.isArray(parsed) && parsed.length) {
    return parsed;
  }
  return DEFAULT_WORKWEAR_CATALOG.map((item) => ({ ...item }));
}

function saveWorkwearCatalog(catalog) {
  if (window.AgentDataAccess?.legacy) {
    window.AgentDataAccess.legacy.write(WORKWEAR_CATALOG_STORAGE_KEY, catalog, { eventName: "workwear-catalog-updated" });
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
  document.getElementById("saveWorkwearButton").textContent = "Zapisz wydanie";
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
  document.getElementById("saveWorkwearCatalogButton").textContent = "Zapisz pozycję";
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
  const catalog = loadWorkwearCatalog().sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "pl", {
    sensitivity: "base",
    numeric: true,
  }));

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Produkt</th>
          <th>Kategoria</th>
          <th>Opis standardu</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${catalog.map((item, index) => `
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
  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Nazwisko</th>
          <th>Imię</th>
          <th>Stanowisko</th>
          <th>Liczba wydań</th>
          <th>Ostatnie wydanie</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((employee, index) => `
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
    body { font-family: "Segoe UI", Arial, sans-serif; margin: 24px; color: #111; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 18px 0 22px; }
    .meta div { padding: 10px 12px; border: 1px solid #d9d9d9; }
    .meta span { display: block; font-size: 10px; text-transform: uppercase; color: #666; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #d8d8d8; text-align: left; }
    th { font-size: 10px; text-transform: uppercase; color: #555; }
    .signatures { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; margin-top: 48px; }
    .box span { display: block; font-size: 11px; color: #666; margin-bottom: 32px; }
  </style>
</head>
<body>
  <h1>Karta przekazania odzieży roboczej</h1>
  <div class="meta">
    <div><span>Pracownik</span><strong>${workwearEscape(workwearDisplayName(employee))}</strong></div>
    <div><span>Zatrudniony od</span><strong>${workwearEscape(employee.employment_date || "-")}</strong></div>
    <div><span>Adres</span><strong>${workwearEscape(employee.street || "-")}</strong></div>
    <div><span>Kod i miejscowość</span><strong>${workwearEscape(employee.city || "-")}</strong></div>
    <div><span>Telefon</span><strong>${workwearEscape(employee.phone || "-")}</strong></div>
    <div><span>Data wydruku</span><strong>${workwearEscape(new Date().toLocaleDateString("pl-PL"))}</strong></div>
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
  target.innerHTML = `
    <div class="record-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Karta przekazania odzieży</p>
          <h2>${workwearEscape(workwearDisplayName(employee))}</h2>
        </div>
        <div class="detail-actions">
          <button id="printWorkwearCardButton" class="primary-button" type="button">PDF karty</button>
        </div>
      </div>
      <div class="detail-meta-grid">
        <div><span>Adres</span><strong>${workwearEscape(employee.street || "-")}</strong></div>
        <div><span>Kod i miejscowość</span><strong>${workwearEscape(employee.city || "-")}</strong></div>
        <div><span>Telefon</span><strong>${workwearEscape(employee.phone || "-")}</strong></div>
        <div><span>Zatrudniony od</span><strong>${workwearEscape(employee.employment_date || "-")}</strong></div>
      </div>
      <div class="form-table-shell">
        <table class="compact-summary-table">
          <thead>
            <tr>
              <th>Lp.</th>
              <th>Data wydania</th>
              <th>Produkt</th>
              <th>Rozmiar</th>
              <th>Ilość</th>
              <th>Uwagi</th>
              <th>Akcje</th>
            </tr>
          </thead>
          <tbody>
            ${entries.length ? entries.map((entry, index) => `
              <tr>
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
                <td colspan="7">Brak wydań dla tego pracownika.</td>
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

  document.getElementById("printWorkwearCardButton")?.addEventListener("click", () => exportWorkwearCardPdf(employee, entries));
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
  document.getElementById("newWorkwearButton")?.addEventListener("click", resetWorkwearForm);
  document.getElementById("saveWorkwearButton")?.addEventListener("click", saveWorkwearIssue);
  document.getElementById("newWorkwearCatalogButton")?.addEventListener("click", resetCatalogForm);
  document.getElementById("saveWorkwearCatalogButton")?.addEventListener("click", saveCatalogItem);
  document.getElementById("workwearSearchInput")?.addEventListener("input", (event) => {
    workwearState.search = String(event.target.value || "");
    renderWorkwearModule();
  });
  document.getElementById("workwearEmployeesTable")?.addEventListener("click", (event) => {
    const editButton = event.target.closest("[data-workwear-open]");
    if (editButton) {
      workwearState.selectedEmployee = editButton.dataset.workwearOpen;
      workwearState.editingEntryId = "";
      renderWorkwearModule();
      return;
    }
    const row = event.target.closest("[data-workwear-employee]");
    if (!row) return;
    workwearState.selectedEmployee = row.dataset.workwearEmployee;
    workwearState.editingEntryId = "";
    renderWorkwearModule();
  });
  document.getElementById("workwearCardView")?.addEventListener("click", (event) => {
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
