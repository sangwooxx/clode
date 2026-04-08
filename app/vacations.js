const VACATION_STORAGE_KEY = "agentVacationRegistryV1";
const VACATION_PLANNING_STORAGE_KEY = "agentPlanningRegistryV1";

const vacationState = window.__agentVacationState || {
  initialized: false,
  selectedEmployee: "",
  search: "",
  editingRequestId: "",
};

window.__agentVacationState = vacationState;

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
  const parsed = window.AgentDataAccess?.legacy
    ? window.AgentDataAccess.legacy.read(VACATION_STORAGE_KEY, null)
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
  if (window.AgentDataAccess?.legacy) {
    window.AgentDataAccess.legacy.write(VACATION_STORAGE_KEY, store, { eventName: "vacation-registry-updated" });
    return;
  }
  window.localStorage.setItem(VACATION_STORAGE_KEY, JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("vacation-registry-updated"));
}

function getVacationEmployees() {
  return typeof window.getEmployeeRoster === "function" ? window.getEmployeeRoster() : [];
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
    on_demand: "Urlop na żądanie",
    l4: "L4",
    other: "Inna nieobecność",
  }[type] || "Nieobecność";
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
  const parsed = window.AgentDataAccess?.legacy
    ? window.AgentDataAccess.legacy.read(VACATION_PLANNING_STORAGE_KEY, null)
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
  document.getElementById("vacationRequestFormHeading").textContent = "Nowy wniosek / nieobecność";
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
    <article class="stat"><span>Wnioski oczekujące</span><strong>${vacationEscape(String(pendingCount))}</strong></article>
    <article class="stat"><span>Dni zatwierdzone</span><strong>${vacationEscape(vacationValue(approvedDays))}</strong></article>
    <article class="stat"><span>Pozostała pula</span><strong>${vacationEscape(vacationValue(totalRemaining))}</strong></article>
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
    .map((employee) => ({ employee, stats: getVacationStatsForEmployee(employee.name) }));

  if (!rows.length) {
    target.innerHTML = "<p>Brak pracowników dla podanego filtra.</p>";
    return;
  }

  ensureSelectedVacationEmployee();
  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Nazwisko</th>
          <th>Imię</th>
          <th>Pula</th>
          <th>Wykorzystane</th>
          <th>Oczekujące</th>
          <th>Pozostało</th>
          <th>Akcja</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(({ employee, stats }, index) => `
          <tr class="clickable-row${employee.name === vacationState.selectedEmployee ? " is-selected" : ""}" data-vacation-employee="${vacationEscape(employee.name)}">
            <td>${index + 1}</td>
            <td>${vacationEscape(employee.last_name || "-")}</td>
            <td>${vacationEscape(employee.first_name || "-")}</td>
            <td>${vacationEscape(vacationValue(stats.total_pool))}</td>
            <td>${vacationEscape(vacationValue(stats.used_days))}</td>
            <td>${vacationEscape(vacationValue(stats.pending_days))}</td>
            <td>${vacationEscape(vacationValue(stats.remaining_days))}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-vacation-open="${vacationEscape(employee.name)}">Edytuj</button>
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
    if (historyTarget) historyTarget.innerHTML = "<p>Brak danych do wyświetlenia.</p>";
    return;
  }

  const stats = getVacationStatsForEmployee(employee.name);
  heading.textContent = vacationDisplayName(employee);
  subline.textContent = `${employee.position || "Bez stanowiska"} • ${employee.status === "inactive" ? "Zakończone zatrudnienie" : "Aktywny"}`;

  document.getElementById("vacationBaseInput").value = stats.balance.base_days || "";
  document.getElementById("vacationCarryInput").value = stats.balance.carryover_days || "";
  document.getElementById("vacationExtraInput").value = stats.balance.extra_days || "";

  statsTarget.innerHTML = `
    <article class="stat"><span>Limit roczny</span><strong>${vacationEscape(vacationValue(stats.balance.base_days))}</strong></article>
    <article class="stat"><span>Urlop zaległy</span><strong>${vacationEscape(vacationValue(stats.balance.carryover_days))}</strong></article>
    <article class="stat"><span>Dodatkowa pula</span><strong>${vacationEscape(vacationValue(stats.balance.extra_days))}</strong></article>
    <article class="stat"><span>Wykorzystane</span><strong>${vacationEscape(vacationValue(stats.used_days))}</strong></article>
    <article class="stat"><span>Oczekujące</span><strong>${vacationEscape(vacationValue(stats.pending_days))}</strong></article>
    <article class="stat"><span>Pozostało</span><strong>${vacationEscape(vacationValue(stats.remaining_days))}</strong></article>
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
                <button class="table-action-button danger-button" type="button" data-vacation-delete="${vacationEscape(request.id)}">Usuń</button>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : "<p>Ten pracownik nie ma jeszcze wpisów urlopowych.</p>";
}

function renderVacationApprovals() {
  const target = document.getElementById("vacationApprovalTable");
  if (!target) return;

  const canApprove = typeof window.canApproveVacationRequests === "function" ? window.canApproveVacationRequests() : true;
  const rows = getVacationRequests();

  if (!rows.length) {
    target.innerHTML = "<p>Brak wniosków do wyświetlenia.</p>";
    return;
  }

  target.innerHTML = `
    <table class="entity-table module-table">
      <thead>
        <tr>
          <th>Lp.</th>
          <th>Nazwisko</th>
          <th>Imię</th>
          <th>Rodzaj</th>
          <th>Od</th>
          <th>Do</th>
          <th>Dni</th>
          <th>Status</th>
          <th>Wprowadza</th>
          <th>Akcje</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((request, index) => {
          const nameParts = vacationNameParts(request.employee_name);
          return `
          <tr>
            <td>${index + 1}</td>
            <td>${vacationEscape(nameParts.lastName || "-")}</td>
            <td>${vacationEscape(nameParts.firstName || "-")}</td>
            <td>${vacationEscape(vacationTypeLabel(request.type))}</td>
            <td>${vacationEscape(request.start_date || "-")}</td>
            <td>${vacationEscape(request.end_date || "-")}</td>
            <td>${vacationEscape(vacationValue(request.days))}</td>
            <td>${vacationEscape(vacationStatusLabel(request.status))}</td>
            <td>${vacationEscape(request.requested_by || "-")}</td>
            <td class="action-cell">
              <button class="table-action-button" type="button" data-vacation-edit="${vacationEscape(request.id)}">Edytuj</button>
              ${canApprove && request.status === "pending" ? `
                <button class="table-action-button" type="button" data-vacation-action="approve" data-vacation-id="${vacationEscape(request.id)}">Zatwierdź</button>
                <button class="table-action-button" type="button" data-vacation-action="reject" data-vacation-id="${vacationEscape(request.id)}">Odrzuć</button>
              ` : ""}
              <button class="table-action-button danger-button" type="button" data-vacation-action="delete" data-vacation-id="${vacationEscape(request.id)}">Usuń</button>
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
    window.recordAuditLog("Urlopy", "Zaktualizowano pulę urlopową", vacationState.selectedEmployee, "");
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
    window.alert("Podaj datę rozpoczęcia nieobecności.");
    return;
  }

  if (new Date(endDate).getTime() < new Date(startDate).getTime()) {
    window.alert("Data końcowa nie może być wcześniejsza niż data początkowa.");
    return;
  }

  const calculatedDays = inputDays || calculateRequestDays(startDate, endDate);
  if (calculatedDays <= 0) {
    window.alert("Liczba dni musi być większa od zera.");
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
    window.alert(`Ten zakres koliduje już z innym wpisem dla pracownika:\n- ${conflictLabel}`);
    return;
  }

  if (isVacationPoolType(requestType)) {
    const balance = getVacationBalance(employeeName);
    const totalPool = balance.base_days + balance.carryover_days + balance.extra_days;
    if (calculatedDays > totalPool) {
      window.alert("Wniosek przekracza łączną pulę urlopową pracownika.");
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
      `${requestedBy || "Użytkownik"} dodał wniosek dla ${employeeName}.`,
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
    window.alert("To konto nie ma uprawnień do akceptacji urlopów.");
    return;
  }

  const store = loadVacationStore();
  const entry = store.requests.find((item) => item.id === requestId);
  if (!entry) return;

  if (status === "approved") {
    const conflicts = findVacationConflicts(entry.employee_name, entry.start_date, entry.end_date, entry.id);
    if (conflicts.length) {
      window.alert("Nie można zatwierdzić wniosku, bo termin koliduje z innym wpisem pracownika.");
      return;
    }

    if (isVacationPoolType(entry.type)) {
      const balance = getVacationBalance(entry.employee_name);
      const totalPool = balance.base_days + balance.carryover_days + balance.extra_days;
      const approvedDays = getApprovedVacationDaysExcluding(entry.employee_name, entry.id);
      if (approvedDays + vacationNumber(entry.days) > totalPool) {
        window.alert("Nie można zatwierdzić wniosku, bo przekroczy dostępną pulę urlopową.");
        return;
      }
    }

    const planningConflicts = getPlanningConflictsForRange(entry.employee_name, entry.start_date, entry.end_date);
    if (planningConflicts.length) {
      const datesLabel = planningConflicts
        .slice(0, 3)
        .map((item) => `${item.date} (${item.contract_name})`)
        .join("\n- ");
      window.alert(`Usuń najpierw przypisania z planowania dla tego pracownika:\n- ${datesLabel}`);
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
  if (!window.confirm(`Czy na pewno chcesz usunąć wpis urlopowy pracownika ${request.employee_name}?`)) return;

  const store = loadVacationStore();
  store.requests = store.requests.filter((item) => item.id !== requestId);
  saveVacationStore(store);
  if (typeof window.recordAuditLog === "function") {
    window.recordAuditLog("Urlopy", "Usunięto wpis urlopowy", `${request.employee_name} / ${vacationTypeLabel(request.type)}`, "");
  }
  if (vacationState.editingRequestId === requestId) {
    resetVacationRequestForm();
  }
  renderVacationModule();
}

function initVacationsView() {
  if (vacationState.initialized || !document.getElementById("vacationsView")) return;

  ensureSelectedVacationEmployee();
  document.getElementById("newVacationRequestButton")?.addEventListener("click", resetVacationRequestForm);
  document.getElementById("vacationEmployeeSearchInput")?.addEventListener("input", (event) => {
    vacationState.search = String(event.target.value || "");
    renderVacationEmployeeTable();
  });
  document.getElementById("vacationEmployeeTable")?.addEventListener("click", (event) => {
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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initVacationsView);
} else {
  initVacationsView();
}
