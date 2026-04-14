const LEGACY_INVOICE_STORAGE_KEY = "clodeInvoiceRegistryV1";
const LEGACY_INVOICE_MIGRATION_KEY = "clodeInvoicesSqlMigratedV1";
const INVOICE_UNASSIGNED_KEY = "__unassigned__";
const INVOICE_SORT_STORAGE_KEY = "clodeInvoicesSortV1";

const invoiceMonthLabels = [
  "styczeń",
  "luty",
  "marzec",
  "kwiecień",
  "maj",
  "czerwiec",
  "lipiec",
  "sierpień",
  "wrzesień",
  "październik",
  "listopad",
  "grudzień",
];

const invoiceModuleState = {
  initialized: false,
  requestId: 0,
  contractSearch: "",
  contracts: [],
  selectedContractId: "",
  selectedContractName: "",
  timeScope: "all",
  selectedYear: String(new Date().getFullYear()),
  selectedMonth: String(new Date().getMonth() + 1).padStart(2, "0"),
  activeType: "cost",
  paymentStatus: "",
  sort: { key: "issue_date", direction: "desc" },
  selectedIds: [],
  selectedRowId: "",
  editingInvoiceId: "",
  formOpen: false,
  loading: false,
  items: [],
  stats: { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 },
  summary: { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 },
  availableYears: [],
  availableMonths: [],
  errorMessage: "",
  migrationChecked: false,
  ...(window.__clodeInvoiceModuleState || {}),
};

window.__clodeInvoiceModuleState = invoiceModuleState;

const invoiceTableColumns = {
  issue_date: { type: "date", defaultDirection: "desc" },
  invoice_number: { type: "string", defaultDirection: "asc" },
  counterparty_name: { type: "string", defaultDirection: "asc" },
  category_or_description: { type: "string", defaultDirection: "asc" },
  amount_net: { type: "number", defaultDirection: "desc" },
  amount_vat: { type: "number", defaultDirection: "desc" },
  amount_gross: { type: "number", defaultDirection: "desc" },
  due_date: { type: "date", defaultDirection: "desc" },
  payment_date: { type: "date", defaultDirection: "desc" },
  payment_status: { type: "string", defaultDirection: "asc" },
};

function loadInvoiceSortPreference() {
  try {
    const raw = window.localStorage?.getItem(INVOICE_SORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const key = String(parsed?.key || "").trim();
    const direction = parsed?.direction === "desc" ? "desc" : "asc";
    return key ? { key, direction } : null;
  } catch {
    return null;
  }
}

function saveInvoiceSortPreference(sortState) {
  try {
    if (!sortState?.key) return;
    window.localStorage?.setItem(
      INVOICE_SORT_STORAGE_KEY,
      JSON.stringify({ key: String(sortState.key), direction: sortState.direction === "desc" ? "desc" : "asc" })
    );
  } catch {
    // Ignore storage errors (private mode / disabled storage).
  }
}

function ensureInvoiceSortState() {
  const persisted = loadInvoiceSortPreference();
  if (persisted?.key && invoiceTableColumns[persisted.key]) {
    invoiceModuleState.sort = persisted;
  }
  if (!invoiceModuleState.sort || !invoiceTableColumns[invoiceModuleState.sort.key]) {
    invoiceModuleState.sort = { key: "issue_date", direction: "desc" };
  }
}

function invoiceText(value) {
  return String(value || "").trim();
}

function invoiceNumber(value) {
  const normalized = String(value ?? "").replace(/\s+/g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function invoiceEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function invoiceMoney(value) {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 2,
  }).format(invoiceNumber(value));
}

function invoiceDateLabel(value) {
  const raw = invoiceText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "-";
  const [year, month, day] = raw.split("-");
  return `${day}.${month}.${year}`;
}

function invoiceMonthLabel(monthValue) {
  const numeric = Number(String(monthValue || "").padStart(2, "0"));
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > 12) return "-";
  return invoiceMonthLabels[numeric - 1];
}

function invoicePaymentStatusLabel(value) {
  const normalized = invoiceText(value).toLowerCase();
  if (normalized === "paid") return "Opłacona";
  if (normalized === "overdue") return "Przeterminowana";
  return "Nieopłacona";
}

function invoiceVatLabel(rate) {
  const normalized = invoiceNumber(rate);
  return normalized ? `${normalized}%` : "bez VAT";
}

function roundMoney(value) {
  return Math.round(invoiceNumber(value) * 100) / 100;
}

function normalizeInvoiceRole(value) {
  return invoiceText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function resolveInvoiceApiBaseUrl() {
  return window.__CLODE_API_BASE_URL || window.__AGENT_API_BASE_URL || (window.location?.origin ? `${window.location.origin}/api/v1` : "/api/v1");
}

function getInvoiceApi() {
  if (!window.ClodeInvoiceApi?.create) return null;
  return window.ClodeInvoiceApi.create({
    baseUrl: resolveInvoiceApiBaseUrl(),
  });
}

function readLegacyInvoiceStore() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(LEGACY_INVOICE_STORAGE_KEY, null)
    : null;
  if (parsed && typeof parsed === "object") {
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_INVOICE_STORAGE_KEY);
    const store = raw ? JSON.parse(raw) : null;
    return store && typeof store === "object"
      ? { entries: Array.isArray(store.entries) ? store.entries : [] }
      : { entries: [] };
  } catch {
    return { entries: [] };
  }
}

function isLegacyInvoiceMigrationDone() {
  try {
    return window.localStorage.getItem(LEGACY_INVOICE_MIGRATION_KEY) === "1";
  } catch {
    return false;
  }
}

function markLegacyInvoiceMigrationDone() {
  try {
    window.localStorage.setItem(LEGACY_INVOICE_MIGRATION_KEY, "1");
  } catch {}
}

async function ensureLegacyInvoiceMigration() {
  if (invoiceModuleState.migrationChecked || isLegacyInvoiceMigrationDone()) {
    invoiceModuleState.migrationChecked = true;
    return;
  }

  const api = getInvoiceApi();
  if (!api) return;

  const legacyEntries = readLegacyInvoiceStore().entries;
  if (!legacyEntries.length) {
    markLegacyInvoiceMigrationDone();
    invoiceModuleState.migrationChecked = true;
    return;
  }

  try {
    await api.importLegacy(legacyEntries);
    markLegacyInvoiceMigrationDone();
    invoiceModuleState.migrationChecked = true;
  } catch (error) {
    console.warn("Nie udało się zmigrować faktur legacy do API.", error);
  }
}

function getContractRegistryForInvoices() {
  const registry = Array.isArray(invoiceModuleState.contracts) ? invoiceModuleState.contracts : [];
  const query = invoiceText(invoiceModuleState.contractSearch).toLowerCase();
  const filtered = registry
    .filter((contract) => {
      if (!query) return true;
      return [
        contract.contract_number,
        contract.name,
        contract.investor,
        contract.status === "archived" ? "zarchiwizowana" : "w realizacji",
      ].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort((left, right) =>
      String(left.contract_number || "").localeCompare(String(right.contract_number || ""), "pl", {
        numeric: true,
        sensitivity: "base",
      })
    );

  return [
    ...filtered,
    {
      id: INVOICE_UNASSIGNED_KEY,
      contract_number: "",
      name: INVOICE_UNASSIGNED_KEY,
      display_name: "Nieprzypisane",
      investor: "Pozycje do weryfikacji",
      status: "active",
      is_unassigned: true,
    },
  ];
}

async function loadInvoiceContracts(api) {
  if (!api) {
    invoiceModuleState.contracts = [];
    return [];
  }

  const payload = await api.listContracts({ includeArchived: false });
  const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
  invoiceModuleState.contracts = contracts.map((contract) => ({
    id: invoiceText(contract.id),
    contract_number: invoiceText(contract.contract_number),
    name: invoiceText(contract.name),
    investor: invoiceText(contract.investor),
    status: invoiceText(contract.status) === "archived" ? "archived" : "active",
    contract_value: invoiceNumber(contract.contract_value),
  }));
  return invoiceModuleState.contracts;
}

function invoiceContractDisplay(contract) {
  if (!contract) return "Wybierz kontrakt";
  if (contract.is_unassigned) return "Nieprzypisane";
  const numberPart = invoiceText(contract.contract_number);
  return numberPart ? `${String(numberPart).padStart(3, "0")} ${contract.name}` : contract.name;
}

function ensureSelectedContract() {
  const contracts = getContractRegistryForInvoices();
  if (!contracts.length) {
    invoiceModuleState.selectedContractId = "";
    invoiceModuleState.selectedContractName = "";
    return null;
  }
  const current = contracts.find((contract) => contract.id === invoiceModuleState.selectedContractId);
  if (current) return current;
  const firstReal = contracts.find((contract) => !contract.is_unassigned) || contracts[0];
  invoiceModuleState.selectedContractId = firstReal?.id || "";
  invoiceModuleState.selectedContractName = firstReal?.name || "";
  return firstReal || null;
}

function getSelectedContract() {
  return ensureSelectedContract();
}

function getInvoiceNodes() {
  return {
    contractSearchInput: document.getElementById("invoiceContractSearchInput"),
    contractSelect: document.getElementById("invoiceContractSelect"),
    scopeTabs: document.getElementById("invoiceScopeTabs"),
    yearField: document.getElementById("invoiceYearField"),
    yearSelect: document.getElementById("invoiceYearSelect"),
    monthField: document.getElementById("invoiceMonthField"),
    monthSelect: document.getElementById("invoiceMonthSelect"),
    contractHeading: document.getElementById("invoiceContractHeading"),
    contractSubline: document.getElementById("invoiceContractSubline"),
    statsBar: document.getElementById("invoiceStatsBar"),
    tableHeading: document.getElementById("invoiceTableHeading"),
    scopeCaption: document.getElementById("invoiceScopeCaption"),
    selectedCount: document.getElementById("invoiceSelectedCount"),
    bulkDeleteButton: document.getElementById("invoiceBulkDeleteButton"),
    typeTabs: document.getElementById("invoiceTypeTabs"),
    entryEditor: document.getElementById("invoiceEntryEditor"),
    formHeading: document.getElementById("invoiceFormHeading"),
    formContext: document.getElementById("invoiceFormContext"),
    entryFields: document.getElementById("invoiceEntryFields"),
    typeInput: document.getElementById("invoiceTypeInput"),
    dateInput: document.getElementById("invoiceDateInput"),
    numberInput: document.getElementById("invoiceNumberInput"),
    partyInput: document.getElementById("invoicePartyInput"),
    categoryInput: document.getElementById("invoiceCategoryInput"),
    descriptionInput: document.getElementById("invoiceDescriptionInput"),
    netInput: document.getElementById("invoiceNetInput"),
    vatRateSelect: document.getElementById("invoiceVatRateSelect"),
    vatCustomField: document.getElementById("invoiceVatCustomField"),
    vatRateCustomInput: document.getElementById("invoiceVatRateCustomInput"),
    vatInput: document.getElementById("invoiceVatInput"),
    grossInput: document.getElementById("invoiceGrossInput"),
    dueDateInput: document.getElementById("invoiceDueDateInput"),
    paymentDateInput: document.getElementById("invoicePaymentDateInput"),
    paymentStatusInput: document.getElementById("invoicePaymentStatusInput"),
    cancelButton: document.getElementById("cancelInvoiceButton"),
    newInvoiceButton: document.getElementById("newInvoiceButton"),
    saveButton: document.getElementById("saveInvoiceButton"),
    table: document.getElementById("invoiceEntriesTable"),
  };
}

function getAvailableYears() {
  const values = new Set(
    (invoiceModuleState.availableYears || [])
      .map((value) => invoiceText(value))
      .filter((value) => /^\d{4}$/.test(value))
  );
  values.add(String(new Date().getFullYear()));
  if (/^\d{4}$/.test(String(invoiceModuleState.selectedYear || ""))) {
    values.add(String(invoiceModuleState.selectedYear));
  }
  return [...values].sort((left, right) => right.localeCompare(left, "pl"));
}

function getMonthOptions() {
  return Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0"));
}

function getCurrentUser() {
  return window.ClodeAuthClient?.getCurrentUser?.() || null;
}

function userCanWriteInvoices() {
  const role = normalizeInvoiceRole(getCurrentUser()?.role);
  return role === "admin" || role === "ksiegowosc";
}

function buildInvoiceFilters() {
  const selectedContract = getSelectedContract();
  const filters = {
    scope: invoiceModuleState.timeScope,
    type: invoiceModuleState.activeType,
  };

  if (selectedContract?.is_unassigned) {
    filters.unassigned = "1";
  } else if (invoiceText(invoiceModuleState.selectedContractId)) {
    filters.contract_id = invoiceModuleState.selectedContractId;
  }
  if (invoiceModuleState.timeScope === "year" || invoiceModuleState.timeScope === "month") {
    filters.year = invoiceModuleState.selectedYear;
  }
  if (invoiceModuleState.timeScope === "month") {
    filters.month = invoiceModuleState.selectedMonth;
  }
  return filters;
}

function setSelectOptions(select, items, selectedValue, mapOption) {
  if (!select) return;
  const currentValue = invoiceText(selectedValue);
  select.innerHTML = items
    .map((item) => {
      const option = mapOption(item);
      const isSelected = invoiceText(option.value) === currentValue;
      return `<option value="${invoiceEscape(option.value)}"${isSelected ? " selected" : ""}>${invoiceEscape(option.label)}</option>`;
    })
    .join("");
}

function renderInvoiceFilterControls() {
  const nodes = getInvoiceNodes();
  const contracts = getContractRegistryForInvoices();
  const selectedContract = ensureSelectedContract();
  const years = getAvailableYears();
  const months = getMonthOptions();
  const filterGrid = document.querySelector("#invoicesView .invoice-filter-grid");

  if (nodes.contractSearchInput && nodes.contractSearchInput.value !== invoiceModuleState.contractSearch) {
    nodes.contractSearchInput.value = invoiceModuleState.contractSearch;
  }

  setSelectOptions(nodes.contractSelect, contracts, invoiceModuleState.selectedContractId, (contract) => ({
    value: contract.id,
    label: invoiceContractDisplay(contract),
  }));
  setSelectOptions(nodes.yearSelect, years, invoiceModuleState.selectedYear, (year) => ({ value: year, label: year }));
  setSelectOptions(nodes.monthSelect, months, invoiceModuleState.selectedMonth, (month) => ({
    value: month,
    label: invoiceMonthLabel(month),
  }));

  [nodes.yearField, nodes.monthField].forEach((field) => {
    if (field) field.hidden = false;
  });

  if (nodes.yearField) {
    const enabled = invoiceModuleState.timeScope === "year" || invoiceModuleState.timeScope === "month";
    nodes.yearField.classList.toggle("is-disabled", !enabled);
    if (nodes.yearSelect) nodes.yearSelect.disabled = !enabled;
  }
  if (nodes.monthField) {
    const enabled = invoiceModuleState.timeScope === "month";
    nodes.monthField.classList.toggle("is-disabled", !enabled);
    if (nodes.monthSelect) nodes.monthSelect.disabled = !enabled;
  }

  if (filterGrid) {
    const visibleTiles = Array.from(filterGrid.children).filter((element) => !element.hidden).length || 1;
    filterGrid.style.gridTemplateColumns = `repeat(${visibleTiles}, minmax(0, 1fr))`;
  }

  document.querySelectorAll("#invoiceScopeTabs [data-invoice-scope]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.invoiceScope === invoiceModuleState.timeScope);
  });
  document.querySelectorAll("#invoiceTypeTabs [data-invoice-type]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.invoiceType === invoiceModuleState.activeType);
  });

  if (nodes.contractHeading) {
    nodes.contractHeading.textContent = selectedContract ? invoiceContractDisplay(selectedContract) : "Wybierz kontrakt";
  }
  if (nodes.contractSubline) {
    const stats = invoiceModuleState.stats || {};
    const hasStats = Number(stats.cost_count || 0) + Number(stats.sales_count || 0) > 0;
    if (!selectedContract) {
      nodes.contractSubline.textContent = "Wybierz kontrakt, aby zobaczyć analizę faktur.";
    } else if (selectedContract.is_unassigned) {
      nodes.contractSubline.textContent = hasStats
        ? "Pozycje wymagające przypisania do kontraktu."
        : "Brak danych dla pozycji nieprzypisanych w wybranym zakresie.";
    } else {
      const statusLabel = selectedContract.status === "archived" ? "Zarchiwizowana" : "W realizacji";
      nodes.contractSubline.textContent = !hasStats
        ? [
            selectedContract.investor || "Brak inwestora",
            statusLabel,
            "Brak danych dla wybranego zakresu",
          ].join(" • ")
        : [
            selectedContract.investor || "Brak inwestora",
            statusLabel,
            invoiceMoney(selectedContract.contract_value || 0),
          ].join(" • ");
    }
  }
}

function renderInvoiceStats() {
  const nodes = getInvoiceNodes();
  if (!nodes.statsBar) return;
  const stats = invoiceModuleState.stats || {};
  const hasStats = Number(stats.cost_count || 0) + Number(stats.sales_count || 0) > 0;
  nodes.statsBar.innerHTML = [
    { label: "Faktury kosztowe (całość)", value: hasStats ? String(stats.cost_count || 0) : "Brak danych" },
    { label: "Suma kosztów netto (całość)", value: hasStats ? invoiceMoney(stats.cost_net || 0) : "Brak danych" },
    { label: "Faktury sprzedażowe (całość)", value: hasStats ? String(stats.sales_count || 0) : "Brak danych" },
    { label: "Suma przychodów netto (całość)", value: hasStats ? invoiceMoney(stats.sales_net || 0) : "Brak danych" },
    { label: "Saldo netto (całość)", value: hasStats ? invoiceMoney(stats.saldo_net || 0) : "Brak danych" },
  ]
    .map((item) => `<article class="stat"><span>${invoiceEscape(item.label)}</span><strong>${invoiceEscape(item.value)}</strong></article>`)
    .join("");
}

function getInvoiceScopeCaption() {
  if (invoiceModuleState.timeScope === "all") {
    return "Zakres analizy: cały okres kontraktu.";
  }
  if (invoiceModuleState.timeScope === "year") {
    return `Zakres analizy: rok ${invoiceModuleState.selectedYear}.`;
  }
  return `Zakres analizy: ${invoiceMonthLabel(invoiceModuleState.selectedMonth)} ${invoiceModuleState.selectedYear}.`;
}

function renderInvoiceTable() {
  const nodes = getInvoiceNodes();
  if (!nodes.table) return;

  ensureInvoiceSortState();

  if (nodes.tableHeading) {
    nodes.tableHeading.textContent = invoiceModuleState.activeType === "cost" ? "Faktury kosztowe" : "Faktury sprzedażowe";
  }
  if (nodes.scopeCaption) {
    nodes.scopeCaption.textContent = getInvoiceScopeCaption();
  }

  const canWrite = userCanWriteInvoices();
  const selectedCount = invoiceModuleState.selectedIds.length;
  if (nodes.selectedCount) nodes.selectedCount.textContent = `Zaznaczone: ${selectedCount}`;
  if (nodes.bulkDeleteButton) nodes.bulkDeleteButton.disabled = !canWrite || !selectedCount;
  if (nodes.newInvoiceButton) {
    const selectedContract = getSelectedContract();
    nodes.newInvoiceButton.disabled = !canWrite || !selectedContract || Boolean(selectedContract?.is_unassigned);
  }

  if (invoiceModuleState.loading) {
    nodes.table.innerHTML = "<p>Ładowanie faktur...</p>";
    return;
  }
  if (invoiceModuleState.errorMessage) {
    nodes.table.innerHTML = `<p>${invoiceEscape(invoiceModuleState.errorMessage)}</p>`;
    return;
  }
  if (!invoiceModuleState.items.length) {
    nodes.table.innerHTML = "<p>Brak faktur dla wybranego zakresu.</p>";
    return;
  }

  const summary = invoiceModuleState.summary || {};
  const allSelected = invoiceModuleState.items.length > 0 && invoiceModuleState.items.every((item) => invoiceModuleState.selectedIds.includes(item.id));
  const rows = window.ClodeTableUtils?.sortItems
    ? window.ClodeTableUtils.sortItems(invoiceModuleState.items, invoiceModuleState.sort, invoiceTableColumns)
    : [...invoiceModuleState.items];

  nodes.table.innerHTML = `
    <table class="data-table invoice-module-table">
      <thead>
        <tr>
          <th class="checkbox-cell"><input id="invoiceSelectAll" type="checkbox"${allSelected ? " checked" : ""}></th>
          <th>Lp.</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Data wystawienia", "invoices", "issue_date", invoiceModuleState.sort) : "Data wystawienia"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Numer faktury", "invoices", "invoice_number", invoiceModuleState.sort) : "Numer faktury"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Kontrahent", "invoices", "counterparty_name", invoiceModuleState.sort) : "Kontrahent"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Kategoria / opis", "invoices", "category_or_description", invoiceModuleState.sort) : "Kategoria / opis"}</th>
          <th class="text-right">${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Netto", "invoices", "amount_net", invoiceModuleState.sort) : "Netto"}</th>
          <th class="text-right">${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("VAT", "invoices", "amount_vat", invoiceModuleState.sort) : "VAT"}</th>
          <th class="text-right">${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Brutto", "invoices", "amount_gross", invoiceModuleState.sort) : "Brutto"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Termin płatności", "invoices", "due_date", invoiceModuleState.sort) : "Termin płatności"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Data płatności", "invoices", "payment_date", invoiceModuleState.sort) : "Data płatności"}</th>
          <th>${window.ClodeTableUtils?.renderHeader ? window.ClodeTableUtils.renderHeader("Status", "invoices", "payment_status", invoiceModuleState.sort) : "Status"}</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((item, index) => {
            const checked = invoiceModuleState.selectedIds.includes(item.id) ? " checked" : "";
            const actions = canWrite
              ? `
                   <button class="table-action-button" type="button" title="Edytuj fakturę" data-invoice-edit="${invoiceEscape(item.id)}">Edytuj</button>
                   <button class="table-action-button danger-button" type="button" title="Usuń fakturę" data-invoice-delete="${invoiceEscape(item.id)}">Usuń</button>
                 `
              : "<span>-</span>";
            return `
              <tr class="clickable-row${item.id === invoiceModuleState.selectedRowId ? " is-selected" : ""}" data-invoice-row-id="${invoiceEscape(item.id)}">
                <td class="checkbox-cell"><input type="checkbox" data-invoice-select="${invoiceEscape(item.id)}"${checked}></td>
                <td>${index + 1}</td>
                <td>${invoiceEscape(invoiceDateLabel(item.issue_date))}</td>
                <td>${invoiceEscape(item.invoice_number)}</td>
                <td>${invoiceEscape(item.counterparty_name || "-")}</td>
                <td class="invoice-description-cell">
                  <div class="invoice-description-content">
                    <strong>${invoiceEscape(item.category_or_description || "-")}</strong>
                    ${item.notes ? `<small>${invoiceEscape(item.notes)}</small>` : ""}
                  </div>
                </td>
                <td class="text-right">${invoiceEscape(invoiceMoney(item.amount_net))}</td>
                <td class="text-right">${invoiceEscape(invoiceVatLabel(item.vat_rate))}<br><small>${invoiceEscape(invoiceMoney(item.amount_vat))}</small></td>
                <td class="text-right">${invoiceEscape(invoiceMoney(item.amount_gross))}</td>
                <td>${invoiceEscape(invoiceDateLabel(item.due_date))}</td>
                <td>${invoiceEscape(invoiceDateLabel(item.payment_date))}</td>
                <td>${invoiceEscape(invoicePaymentStatusLabel(item.payment_status))}</td>
                <td class="action-cell">${actions}</td>
              </tr>
            `;
          })
          .join("")}
        <tr class="invoice-summary-row">
          <td colspan="6">Suma zakresu (${invoiceEscape(String(summary.count || 0))} faktur)</td>
          <td class="text-right">${invoiceEscape(invoiceMoney(summary.amount_net || 0))}</td>
          <td class="text-right">${invoiceEscape(invoiceMoney(summary.amount_vat || 0))}</td>
          <td class="text-right">${invoiceEscape(invoiceMoney(summary.amount_gross || 0))}</td>
          <td colspan="4"></td>
        </tr>
      </tbody>
    </table>
  `;
}

function updateInvoiceVatFieldVisibility() {
  const nodes = getInvoiceNodes();
  const isCustom = nodes.vatRateSelect?.value === "custom";
  if (nodes.vatCustomField) nodes.vatCustomField.hidden = !isCustom;
  if (nodes.vatRateCustomInput) nodes.vatRateCustomInput.disabled = !isCustom;
}

function getCurrentVatRate() {
  const nodes = getInvoiceNodes();
  const mode = nodes.vatRateSelect?.value || "23";
  if (mode === "none") return 0;
  if (mode === "custom") return invoiceNumber(nodes.vatRateCustomInput?.value);
  return invoiceNumber(mode);
}

function recalculateInvoiceFormTotals() {
  const nodes = getInvoiceNodes();
  const netAmount = invoiceNumber(nodes.netInput?.value);
  const vatRate = getCurrentVatRate();
  const amountVat = roundMoney(netAmount * vatRate / 100);
  const amountGross = roundMoney(netAmount + amountVat);
  if (nodes.vatInput) nodes.vatInput.value = amountVat ? String(amountVat) : "0";
  if (nodes.grossInput) nodes.grossInput.value = amountGross ? String(amountGross) : "0";
}

function resetInvoiceForm() {
  const nodes = getInvoiceNodes();
  invoiceModuleState.editingInvoiceId = "";
  if (nodes.formHeading) nodes.formHeading.textContent = "Dodaj fakturę";
  if (nodes.formContext) {
    const selectedContract = getSelectedContract();
    nodes.formContext.textContent = selectedContract?.is_unassigned
      ? "Nowa faktura zostanie zapisana bez przypisanego kontraktu."
      : `Nowa faktura dla kontraktu: ${invoiceContractDisplay(selectedContract)}.`;
  }
  if (nodes.typeInput) nodes.typeInput.value = invoiceModuleState.activeType;
  if (nodes.dateInput) nodes.dateInput.value = new Date().toISOString().slice(0, 10);
  if (nodes.numberInput) nodes.numberInput.value = "";
  if (nodes.partyInput) nodes.partyInput.value = "";
  if (nodes.categoryInput) nodes.categoryInput.value = "";
  if (nodes.descriptionInput) nodes.descriptionInput.value = "";
  if (nodes.netInput) nodes.netInput.value = "";
  if (nodes.vatRateSelect) nodes.vatRateSelect.value = "23";
  if (nodes.vatRateCustomInput) nodes.vatRateCustomInput.value = "";
  if (nodes.vatInput) nodes.vatInput.value = "0";
  if (nodes.grossInput) nodes.grossInput.value = "0";
  if (nodes.dueDateInput) nodes.dueDateInput.value = "";
  if (nodes.paymentDateInput) nodes.paymentDateInput.value = "";
  if (nodes.paymentStatusInput) nodes.paymentStatusInput.value = "unpaid";
  updateInvoiceVatFieldVisibility();
  recalculateInvoiceFormTotals();
}

function renderInvoiceFormState() {
  const nodes = getInvoiceNodes();
  if (nodes.entryFields) nodes.entryFields.hidden = !invoiceModuleState.formOpen;
  if (nodes.cancelButton) nodes.cancelButton.hidden = !invoiceModuleState.formOpen;
  if (nodes.saveButton) nodes.saveButton.hidden = !invoiceModuleState.formOpen;
}

function openInvoiceForm(invoice = null) {
  invoiceModuleState.formOpen = true;
  const nodes = getInvoiceNodes();
  if (!invoice) {
    resetInvoiceForm();
  } else {
    invoiceModuleState.editingInvoiceId = invoice.id;
    if (nodes.formHeading) nodes.formHeading.textContent = "Edytuj fakturę";
    if (nodes.formContext) nodes.formContext.textContent = `Edytujesz fakturę ${invoice.invoice_number}.`;
    if (nodes.typeInput) nodes.typeInput.value = invoice.type || "cost";
    if (nodes.dateInput) nodes.dateInput.value = invoice.issue_date || "";
    if (nodes.numberInput) nodes.numberInput.value = invoice.invoice_number || "";
    if (nodes.partyInput) nodes.partyInput.value = invoice.counterparty_name || "";
    if (nodes.categoryInput) nodes.categoryInput.value = invoice.category_or_description || "";
    if (nodes.descriptionInput) nodes.descriptionInput.value = invoice.notes || "";
    if (nodes.netInput) nodes.netInput.value = invoice.amount_net || "";
    if (invoiceNumber(invoice.vat_rate) === 23) {
      if (nodes.vatRateSelect) nodes.vatRateSelect.value = "23";
      if (nodes.vatRateCustomInput) nodes.vatRateCustomInput.value = "";
    } else if (invoiceNumber(invoice.vat_rate) === 0) {
      if (nodes.vatRateSelect) nodes.vatRateSelect.value = "none";
      if (nodes.vatRateCustomInput) nodes.vatRateCustomInput.value = "";
    } else {
      if (nodes.vatRateSelect) nodes.vatRateSelect.value = "custom";
      if (nodes.vatRateCustomInput) nodes.vatRateCustomInput.value = invoice.vat_rate || "";
    }
    if (nodes.vatInput) nodes.vatInput.value = invoice.amount_vat || "";
    if (nodes.grossInput) nodes.grossInput.value = invoice.amount_gross || "";
    if (nodes.dueDateInput) nodes.dueDateInput.value = invoice.due_date || "";
    if (nodes.paymentDateInput) nodes.paymentDateInput.value = invoice.payment_date || "";
    if (nodes.paymentStatusInput) nodes.paymentStatusInput.value = invoice.payment_status || "unpaid";
    updateInvoiceVatFieldVisibility();
    recalculateInvoiceFormTotals();
  }
  renderInvoiceFormState();
}

function closeInvoiceForm() {
  invoiceModuleState.formOpen = false;
  invoiceModuleState.editingInvoiceId = "";
  renderInvoiceFormState();
}

function collectInvoiceFormPayload() {
  const nodes = getInvoiceNodes();
  const selectedContract = getSelectedContract();
  return {
    contract_id: selectedContract?.is_unassigned ? "" : invoiceText(selectedContract?.id),
    contract_name: selectedContract?.is_unassigned ? "" : invoiceText(selectedContract?.name),
    type: nodes.typeInput?.value || invoiceModuleState.activeType,
    issue_date: nodes.dateInput?.value || "",
    invoice_number: invoiceText(nodes.numberInput?.value),
    counterparty_name: invoiceText(nodes.partyInput?.value),
    category_or_description: invoiceText(nodes.categoryInput?.value),
    notes: invoiceText(nodes.descriptionInput?.value),
    amount_net: roundMoney(nodes.netInput?.value),
    vat_rate: roundMoney(getCurrentVatRate()),
    amount_vat: roundMoney(nodes.vatInput?.value),
    amount_gross: roundMoney(nodes.grossInput?.value),
    due_date: nodes.dueDateInput?.value || "",
    payment_date: nodes.paymentDateInput?.value || "",
    payment_status: nodes.paymentStatusInput?.value || "unpaid",
  };
}

async function refreshInvoiceModule() {
  const api = getInvoiceApi();
  let selectedContract = null;
  renderInvoiceFilterControls();
  renderInvoiceFormState();

  if (!api) {
    invoiceModuleState.errorMessage = "Brak połączenia z modułem API faktur.";
    invoiceModuleState.items = [];
    invoiceModuleState.stats = { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 };
    invoiceModuleState.summary = { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 };
    renderInvoiceStats();
    renderInvoiceTable();
    return;
  }

  try {
    await loadInvoiceContracts(api);
  } catch (error) {
    invoiceModuleState.errorMessage = error?.message || "Nie udało się pobrać kontraktów z backendu.";
    invoiceModuleState.items = [];
    invoiceModuleState.stats = { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 };
    invoiceModuleState.summary = { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 };
    renderInvoiceFilterControls();
    renderInvoiceStats();
    renderInvoiceTable();
    return;
  }

  selectedContract = ensureSelectedContract();

  if (!selectedContract) {
    invoiceModuleState.errorMessage = "";
    invoiceModuleState.items = [];
    invoiceModuleState.stats = { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 };
    invoiceModuleState.summary = { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 };
    renderInvoiceStats();
    renderInvoiceTable();
    return;
  }

  invoiceModuleState.loading = true;
  invoiceModuleState.errorMessage = "";
  renderInvoiceStats();
  renderInvoiceTable();

  await ensureLegacyInvoiceMigration();

  const requestId = ++invoiceModuleState.requestId;
  try {
    const payload = await api.list(buildInvoiceFilters());
    if (requestId !== invoiceModuleState.requestId) return;
    invoiceModuleState.availableYears = Array.isArray(payload?.available_years) ? payload.available_years : [];
    invoiceModuleState.availableMonths = Array.isArray(payload?.available_months) ? payload.available_months : [];
    const years = getAvailableYears();
    if ((invoiceModuleState.timeScope === "year" || invoiceModuleState.timeScope === "month")
      && years.length
      && !years.includes(String(invoiceModuleState.selectedYear))) {
      invoiceModuleState.selectedYear = years[0];
      invoiceModuleState.loading = false;
      return refreshInvoiceModule();
    }
    invoiceModuleState.items = Array.isArray(payload?.items) ? payload.items : [];
    invoiceModuleState.stats = payload?.stats || { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 };
    invoiceModuleState.summary = payload?.summary || { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 };
    invoiceModuleState.selectedIds = invoiceModuleState.selectedIds.filter((id) => invoiceModuleState.items.some((item) => item.id === id));
  } catch (error) {
    if (requestId !== invoiceModuleState.requestId) return;
    invoiceModuleState.errorMessage = error?.message || "Nie udało się pobrać faktur z backendu.";
    invoiceModuleState.items = [];
    invoiceModuleState.stats = { cost_count: 0, cost_net: 0, sales_count: 0, sales_net: 0, saldo_net: 0 };
    invoiceModuleState.summary = { count: 0, amount_net: 0, amount_vat: 0, amount_gross: 0 };
  } finally {
    if (requestId === invoiceModuleState.requestId) {
      invoiceModuleState.loading = false;
      renderInvoiceFilterControls();
      renderInvoiceStats();
      renderInvoiceTable();
    }
  }
}

async function saveInvoice(submitAndContinue = false) {
  const api = getInvoiceApi();
  if (!api) return;
  try {
    const payload = collectInvoiceFormPayload();
    if (invoiceModuleState.editingInvoiceId) {
      await api.update(invoiceModuleState.editingInvoiceId, payload);
    } else {
      await api.create(payload);
    }
    window.dispatchEvent(new CustomEvent("invoice-registry-updated"));
    if (submitAndContinue) {
      resetInvoiceForm();
    } else {
      closeInvoiceForm();
    }
    await refreshInvoiceModule();
  } catch (error) {
    window.alert(error?.message || "Nie udało się zapisać faktury.");
  }
}

async function deleteInvoice(invoiceId) {
  if (!userCanWriteInvoices()) return;
  if (!window.confirm("Czy na pewno chcesz usunąć tę fakturę?")) return;
  const api = getInvoiceApi();
  if (!api) return;
  try {
    await api.remove(invoiceId);
    invoiceModuleState.selectedIds = invoiceModuleState.selectedIds.filter((id) => id !== invoiceId);
    window.dispatchEvent(new CustomEvent("invoice-registry-updated"));
    await refreshInvoiceModule();
  } catch (error) {
    window.alert(error?.message || "Nie udało się usunąć faktury.");
  }
}

async function bulkDeleteInvoices() {
  if (!userCanWriteInvoices() || !invoiceModuleState.selectedIds.length) return;
  if (!window.confirm(`Czy na pewno chcesz usunąć ${invoiceModuleState.selectedIds.length} zaznaczonych faktur?`)) return;
  const api = getInvoiceApi();
  if (!api) return;
  try {
    await api.bulkDelete(invoiceModuleState.selectedIds);
    invoiceModuleState.selectedIds = [];
    window.dispatchEvent(new CustomEvent("invoice-registry-updated"));
    await refreshInvoiceModule();
  } catch (error) {
    window.alert(error?.message || "Nie udało się usunąć zaznaczonych faktur.");
  }
}

async function editInvoice(invoiceId) {
  const api = getInvoiceApi();
  if (!api) return;
  try {
    const payload = await api.get(invoiceId);
    if (!payload?.invoice) {
      window.alert("Nie znaleziono faktury.");
      return;
    }
    openInvoiceForm(payload.invoice);
  } catch (error) {
    window.alert(error?.message || "Nie udało się pobrać faktury.");
  }
}

function toggleInvoiceSelection(invoiceId, checked) {
  const ids = new Set(invoiceModuleState.selectedIds);
  if (checked) {
    ids.add(invoiceId);
  } else {
    ids.delete(invoiceId);
  }
  invoiceModuleState.selectedIds = [...ids];
  renderInvoiceTable();
}

function setAllInvoiceSelections(checked) {
  invoiceModuleState.selectedIds = checked ? invoiceModuleState.items.map((item) => item.id) : [];
  renderInvoiceTable();
}

function bindInvoiceModule() {
  if (invoiceModuleState.initialized) return;
  invoiceModuleState.initialized = true;

  const nodes = getInvoiceNodes();

  nodes.contractSearchInput?.addEventListener("input", (event) => {
    invoiceModuleState.contractSearch = String(event.target.value || "");
    renderInvoiceFilterControls();
  });

  nodes.contractSelect?.addEventListener("change", async (event) => {
    const selectedId = String(event.target.value || "");
    const selectedContract = getContractRegistryForInvoices().find((contract) => contract.id === selectedId) || null;
    invoiceModuleState.selectedContractId = selectedId;
    invoiceModuleState.selectedContractName = selectedContract?.name || "";
    invoiceModuleState.selectedIds = [];
    await refreshInvoiceModule();
  });

  nodes.scopeTabs?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invoice-scope]");
    if (!button) return;
    invoiceModuleState.timeScope = button.dataset.invoiceScope || "all";
    await refreshInvoiceModule();
  });

  nodes.yearSelect?.addEventListener("change", async (event) => {
    invoiceModuleState.selectedYear = String(event.target.value || "");
    await refreshInvoiceModule();
  });

  nodes.monthSelect?.addEventListener("change", async (event) => {
    invoiceModuleState.selectedMonth = String(event.target.value || "").padStart(2, "0");
    await refreshInvoiceModule();
  });

  nodes.typeTabs?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-invoice-type]");
    if (!button) return;
    invoiceModuleState.activeType = button.dataset.invoiceType || "cost";
    if (!invoiceModuleState.formOpen) {
      await refreshInvoiceModule();
      return;
    }
    if (!invoiceModuleState.editingInvoiceId && nodes.typeInput) {
      nodes.typeInput.value = invoiceModuleState.activeType;
    }
    renderInvoiceFilterControls();
    renderInvoiceTable();
  });

  nodes.cancelButton?.addEventListener("click", closeInvoiceForm);
  nodes.netInput?.addEventListener("input", recalculateInvoiceFormTotals);
  nodes.vatRateSelect?.addEventListener("change", () => {
    updateInvoiceVatFieldVisibility();
    recalculateInvoiceFormTotals();
  });
  nodes.vatRateCustomInput?.addEventListener("input", recalculateInvoiceFormTotals);

  nodes.saveButton?.addEventListener("click", () => saveInvoice(false));
  nodes.newInvoiceButton?.addEventListener("click", () => openInvoiceForm());
  nodes.bulkDeleteButton?.addEventListener("click", bulkDeleteInvoices);

  nodes.table?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='invoices']");
    if (sortButton && window.ClodeTableUtils?.nextSort) {
      invoiceModuleState.sort = window.ClodeTableUtils.nextSort(
        invoiceModuleState.sort,
        sortButton.dataset.sortKey,
        invoiceTableColumns
      );
      saveInvoiceSortPreference(invoiceModuleState.sort);
      renderInvoiceTable();
      return;
    }

    if (event.target.closest("input[type='checkbox']") || event.target.closest("button")) {
      // Keep existing checkbox/buttons behavior without toggling row highlight.
    } else {
      const row = event.target.closest("[data-invoice-row-id]");
      if (row?.dataset?.invoiceRowId) {
        invoiceModuleState.selectedRowId = row.dataset.invoiceRowId;
        renderInvoiceTable();
      }
    }
    const editButton = event.target.closest("[data-invoice-edit]");
    if (editButton) {
      editInvoice(editButton.dataset.invoiceEdit);
      return;
    }
    const deleteButton = event.target.closest("[data-invoice-delete]");
    if (deleteButton) {
      deleteInvoice(deleteButton.dataset.invoiceDelete);
    }
  });

  nodes.table?.addEventListener("change", (event) => {
    const selectAll = event.target.closest("#invoiceSelectAll");
    if (selectAll) {
      setAllInvoiceSelections(Boolean(selectAll.checked));
      return;
    }
    const checkbox = event.target.closest("[data-invoice-select]");
    if (checkbox) {
      toggleInvoiceSelection(checkbox.dataset.invoiceSelect, Boolean(checkbox.checked));
    }
  });

  window.addEventListener("contract-registry-updated", refreshInvoiceModule);
  window.addEventListener("clode-auth-changed", () => {
    invoiceModuleState.contracts = [];
    refreshInvoiceModule();
  });
  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "invoicesView") {
      refreshInvoiceModule();
    }
  });
}

function renderInvoiceModule() {
  bindInvoiceModule();
  ensureInvoiceSortState();
  renderInvoiceFilterControls();
  renderInvoiceStats();
  renderInvoiceFormState();
  renderInvoiceTable();
  return refreshInvoiceModule();
}

window.renderInvoiceModule = renderInvoiceModule;
window.initInvoiceModule = bindInvoiceModule;

bindInvoiceModule();

