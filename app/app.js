const DASHBOARD_INVOICE_STORAGE_KEY = "clodeInvoiceRegistryV1";
const DASHBOARD_HOURS_STORAGE_KEY = "clodeHoursRegistryV2";

const state = {
  data: null,
  loading: false,
  errorMessage: "",
  search: "",
  dashboardMode: "contracts",
  selectedInvestmentId: null,
  sorts: {
    investments: { key: "margin", direction: "desc" },
    detailMonthly: { key: "month_key", direction: "asc" },
    unassignedInvoices: { key: "issue_date", direction: "desc" },
    unmatchedHours: { key: "labor_cost", direction: "desc" },
  },
};

const currency = new Intl.NumberFormat("pl-PL", {
  style: "currency",
  currency: "PLN",
  maximumFractionDigits: 2,
});

const moneyMetricFormatter = new Intl.NumberFormat("pl-PL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 0,
});

const investmentColumns = {
  name: {
    type: "string",
    defaultDirection: "asc",
    getValue: (item) => item.report_label || item.name,
  },
  sales: { type: "number", defaultDirection: "desc" },
  material_cost: { type: "number", defaultDirection: "desc" },
  labor_cost: { type: "number", defaultDirection: "desc" },
  total_cost: { type: "number", defaultDirection: "desc" },
  labor_hours: { type: "number", defaultDirection: "desc" },
  margin: { type: "number", defaultDirection: "desc" },
  trend: {
    type: "number",
    defaultDirection: "desc",
    getValue: (item) => (item.monthly_breakdown || []).slice(-1)[0]?.total_cost || 0,
  },
};

const unassignedInvoiceColumns = {
  issue_date: { type: "date", defaultDirection: "desc" },
  type: { type: "string", defaultDirection: "asc" },
  document_number: { type: "string", defaultDirection: "asc" },
  contract_name: { type: "string", defaultDirection: "asc" },
  party: { type: "string", defaultDirection: "asc" },
  category_or_description: {
    type: "string",
    defaultDirection: "asc",
    getValue: (item) => [item?.category, item?.description].filter(Boolean).join(" ").trim(),
  },
  net_amount: { type: "number", defaultDirection: "desc" },
  vat_rate: { type: "number", defaultDirection: "desc" },
  gross_amount: { type: "number", defaultDirection: "desc" },
};

const unmatchedHoursColumns = {
  source_name: { type: "string", defaultDirection: "asc" },
  entries: { type: "number", defaultDirection: "desc" },
  labor_hours: { type: "number", defaultDirection: "desc" },
  labor_cost: { type: "number", defaultDirection: "desc" },
};

const detailMonthlyColumns = {
  month_key: { type: "string", defaultDirection: "asc" },
  sales: { type: "number", defaultDirection: "desc" },
  material_cost: { type: "number", defaultDirection: "desc" },
  labor_cost: { type: "number", defaultDirection: "desc" },
  labor_hours: { type: "number", defaultDirection: "desc" },
  total_cost: { type: "number", defaultDirection: "desc" },
  margin: { type: "number", defaultDirection: "desc" },
};

function formatMoney(value) {
  return currency.format(Number(value || 0));
}

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function escapeHtml(value) {
  if (window.ClodeTableUtils?.escapeHtml) {
    return window.ClodeTableUtils.escapeHtml(String(value ?? ""));
  }
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatMetricMarkup(value, type = "money") {
  const numeric = Number(value || 0);

  if (type === "money") {
    return `
      <span class="metric-value metric-value--money">
        <span class="metric-value__amount">${escapeHtml(moneyMetricFormatter.format(numeric))}</span>
        <span class="metric-value__currency">zł</span>
      </span>
    `;
  }

  const formattedValue = type === "count"
    ? integerFormatter.format(numeric)
    : formatNumber(numeric);

  return `
    <span class="metric-value metric-value--number">
      <span class="metric-value__amount">${escapeHtml(formattedValue)}</span>
    </span>
  `;
}

function formatDate(value) {
  if (!value) return "-";
  // Accept both ISO date and datetime, but display date-only in the dashboard tables.
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString("pl-PL") : "-";
}

function emptyDashboardData() {
  return {
    totals: {
      total_material: 0,
      total_labor: 0,
      total_cost: 0,
      total_sales: 0,
      total_margin: 0,
      investments_count: 0,
    },
    investments: [],
    alerts: [],
    recommendations: [],
    top_positive: [],
    top_negative: [],
    unassigned: {
      cost_invoice_count: 0,
      cost_net: 0,
      sales_invoice_count: 0,
      sales_net: 0,
      labor_entries: 0,
      labor_hours: 0,
      labor_cost: 0,
      margin: 0,
    },
    unassigned_invoices: [],
    unmatched_hours: [],
  };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function numberValue(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getDashboardApi() {
  if (!window.ClodeContractApi?.create) return null;
  return window.ClodeContractApi.create({
    baseUrl: window.__CLODE_API_BASE_URL || "http://127.0.0.1:8787/api/v1",
  });
}

function monthKeyFromValues(yearValue, monthValue) {
  const year = String(yearValue || "").trim();
  const month = String(monthValue || "").trim().padStart(2, "0");
  return /^\d{4}$/.test(year) && /^\d{2}$/.test(month) ? `${year}-${month}` : "";
}

function monthLabel(monthKey) {
  const [yearValue, monthValue] = String(monthKey || "").split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!year || !month) return String(monthKey || "");
  return `${String(month).padStart(2, "0")}.${year}`;
}

function loadInvoiceStore() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(DASHBOARD_INVOICE_STORAGE_KEY, null)
    : null;
  if (parsed && typeof parsed === "object") {
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  }
  return { entries: [] };
}

function loadHoursStore() {
  const parsed = window.ClodeDataAccess?.legacy
    ? window.ClodeDataAccess.legacy.read(DASHBOARD_HOURS_STORAGE_KEY, null)
    : null;
  if (parsed && typeof parsed === "object") {
    return { months: parsed.months && typeof parsed.months === "object" ? parsed.months : {} };
  }
  return { months: {} };
}

function getContracts() {
  if (typeof window.getContractRegistry !== "function") return [];
  return window.getContractRegistry()
    .map((contract) => ({
      contract_number: String(contract?.contract_number || "").trim(),
      name: textValue(contract?.name),
      investor: textValue(contract?.investor),
      signed_date: String(contract?.signed_date || "").trim(),
      end_date: String(contract?.end_date || "").trim(),
      contract_value: numberValue(contract?.contract_value),
      status: String(contract?.status || "active") === "completed" ? "completed" : "active",
    }))
    .filter((contract) => contract.name);
}

function getContractLabel(contract) {
  return contract.contract_number ? `${contract.contract_number} - ${contract.name}` : contract.name;
}

function createInvestmentRecord(contract) {
  return {
    id: `contract-${slugify(contract.contract_number || contract.name)}`,
    name: contract.name,
    report_label: getContractLabel(contract),
    contract_number: contract.contract_number || "",
    investor: contract.investor || "",
    status: contract.status || "active",
    signed_date: contract.signed_date || "",
    end_date: contract.end_date || "",
    contract_value: numberValue(contract.contract_value),
    material_cost: 0,
    labor_cost: 0,
    total_cost: 0,
    labor_hours: 0,
    sales: 0,
    margin: 0,
    margin_percent: 0,
    invoice_count: 0,
    material_invoice_count: 0,
    sales_invoice_count: 0,
    monthly_breakdown: [],
    analyses: [],
    _monthly: new Map(),
  };
}

function buildInvestmentLookup(investmentMap) {
  const lookup = new Map();

  function register(reference, investmentKey) {
    const normalized = textValue(reference);
    if (!normalized) return;
    if (!lookup.has(normalized)) lookup.set(normalized, investmentKey);
    const lowered = normalized.toLowerCase();
    if (!lookup.has(lowered)) lookup.set(lowered, investmentKey);
    const slug = slugify(normalized);
    if (slug && !lookup.has(slug)) lookup.set(slug, investmentKey);
  }

  investmentMap.forEach((investment, investmentKey) => {
    register(investment.name, investmentKey);
    register(investment.report_label, investmentKey);
    register(investment.contract_number, investmentKey);
  });

  return lookup;
}

function resolveInvestmentKey(investmentMap, investmentLookup, rawReference) {
  const normalized = textValue(rawReference);
  if (!normalized) return "";
  if (investmentMap.has(normalized)) return normalized;
  return (
    investmentLookup.get(normalized) ||
    investmentLookup.get(normalized.toLowerCase()) ||
    investmentLookup.get(slugify(normalized)) ||
    ""
  );
}

function ensureMonthBucket(investment, monthKeyValue, monthLabelValue = "") {
  const normalizedMonthKey = textValue(monthKeyValue);
  if (!normalizedMonthKey) return null;

  if (!investment._monthly.has(normalizedMonthKey)) {
    investment._monthly.set(normalizedMonthKey, {
      month_key: normalizedMonthKey,
      month_label: monthLabelValue || monthLabel(normalizedMonthKey),
      sales: 0,
      material_cost: 0,
      labor_cost: 0,
      labor_hours: 0,
      total_cost: 0,
      margin: 0,
      invoice_count: 0,
    });
  }

  return investment._monthly.get(normalizedMonthKey);
}

function buildUnmatchedEntry(map, name) {
  if (!map.has(name)) {
    map.set(name, {
      source_name: name,
      entries: 0,
      labor_cost: 0,
      labor_hours: 0,
    });
  }
  return map.get(name);
}

function getUnassignedInvoiceEntries(investmentMap, investmentLookup) {
  return loadInvoiceStore().entries
    .filter((entry) => {
      return !resolveInvestmentKey(investmentMap, investmentLookup, entry?.contract_name);
    })
    .map((entry, index) => ({
      id: textValue(entry?.id) || `unassigned-${index}`,
      type: String(entry?.type || "cost") === "sales" ? "sales" : "cost",
      contract_name: textValue(entry?.contract_name),
      issue_date: textValue(entry?.issue_date),
      document_number: textValue(entry?.document_number),
      party: textValue(entry?.party),
      category: textValue(entry?.category),
      description: textValue(entry?.description),
      net_amount: numberValue(entry?.net_amount),
      vat_rate: numberValue(entry?.vat_rate),
      gross_amount: numberValue(entry?.gross_amount),
    }))
    .sort((left, right) => {
      const byDate = String(right.issue_date || "").localeCompare(String(left.issue_date || ""), "pl");
      if (byDate !== 0) return byDate;
      return String(right.document_number || "").localeCompare(String(left.document_number || ""), "pl", {
        numeric: true,
        sensitivity: "base",
      });
    });
}

function buildUnassignedSummary(unassignedInvoices, unmatchedHours) {
  return {
    cost_invoice_count: unassignedInvoices.filter((entry) => entry.type === "cost").length,
    cost_net: unassignedInvoices
      .filter((entry) => entry.type === "cost")
      .reduce((sum, entry) => sum + numberValue(entry.net_amount), 0),
    sales_invoice_count: unassignedInvoices.filter((entry) => entry.type === "sales").length,
    sales_net: unassignedInvoices
      .filter((entry) => entry.type === "sales")
      .reduce((sum, entry) => sum + numberValue(entry.net_amount), 0),
    labor_entries: unmatchedHours.reduce((sum, entry) => sum + numberValue(entry.entries), 0),
    labor_hours: unmatchedHours.reduce((sum, entry) => sum + numberValue(entry.labor_hours), 0),
    labor_cost: unmatchedHours.reduce((sum, entry) => sum + numberValue(entry.labor_cost), 0),
  };
}

function addInvoiceData(investmentMap, investmentLookup) {
  loadInvoiceStore().entries.forEach((entry) => {
    const contractKey = resolveInvestmentKey(investmentMap, investmentLookup, entry?.contract_name);
    if (!contractKey || !investmentMap.has(contractKey)) return;

    const investment = investmentMap.get(contractKey);
    const bucket = ensureMonthBucket(
      investment,
      monthKeyFromValues(entry?.year, entry?.month)
    );
    const netAmount = numberValue(entry?.net_amount);
    const invoiceType = String(entry?.type || "cost") === "sales" ? "sales" : "cost";

    investment.invoice_count += 1;
    if (bucket) bucket.invoice_count += 1;

    if (invoiceType === "sales") {
      investment.sales += netAmount;
      investment.sales_invoice_count += 1;
      if (bucket) bucket.sales += netAmount;
      return;
    }

    investment.material_cost += netAmount;
    investment.material_invoice_count += 1;
    if (bucket) bucket.material_cost += netAmount;
  });
}

function addHoursData(investmentMap, investmentLookup) {
  const unmatched = new Map();

  Object.values(loadHoursStore().months || {}).forEach((month) => {
    const monthKeyValue = textValue(month?.month_key);
    if (!monthKeyValue) return;

    const contractHours = new Map();
    const activeContracts = new Set(
      Array.isArray(month?.visible_investments)
        ? month.visible_investments.map((value) => textValue(value)).filter(Boolean)
        : []
    );
    let totalHours = 0;

    (month?.workers || []).forEach((worker) => {
      Object.entries(worker?.project_hours || {}).forEach(([contractNameRaw, hoursRaw]) => {
        const contractName = textValue(contractNameRaw);
        const hours = numberValue(hoursRaw);
        if (!contractName || !hours) return;
        if (activeContracts.size && !activeContracts.has(contractName)) return;
        contractHours.set(contractName, (contractHours.get(contractName) || 0) + hours);
        totalHours += hours;
      });
    });

    const finance = month?.finance || {};
    const statutoryCosts =
      numberValue(finance.zus_company_1) +
      numberValue(finance.zus_company_2) +
      numberValue(finance.zus_company_3) +
      numberValue(finance.pit4_company_1) +
      numberValue(finance.pit4_company_2) +
      numberValue(finance.pit4_company_3);

    const payouts = numberValue(finance.payouts);
    const totalEmployerCost = payouts + statutoryCosts;
    const rhValue = totalHours > 0 ? totalEmployerCost / totalHours : 0;
    const displayLabel = textValue(month?.month_label) || monthLabel(monthKeyValue);

    if (!totalHours && totalEmployerCost > 0) {
      const unmatchedEntry = buildUnmatchedEntry(unmatched, `Koszty miesiąca ${displayLabel} bez godzin`);
      unmatchedEntry.entries += 1;
      unmatchedEntry.labor_cost += totalEmployerCost;
      return;
    }

    contractHours.forEach((hours, contractName) => {
      const laborCost = hours * rhValue;
      const contractKey = resolveInvestmentKey(investmentMap, investmentLookup, contractName);
      if (!contractKey || !investmentMap.has(contractKey)) {
        const unmatchedEntry = buildUnmatchedEntry(unmatched, contractName);
        unmatchedEntry.entries += 1;
        unmatchedEntry.labor_cost += laborCost;
        unmatchedEntry.labor_hours += hours;
        return;
      }

      const investment = investmentMap.get(contractKey);
      const bucket = ensureMonthBucket(investment, monthKeyValue, displayLabel);
      investment.labor_hours += hours;
      investment.labor_cost += laborCost;
      if (bucket) {
        bucket.labor_hours += hours;
        bucket.labor_cost += laborCost;
      }
    });
  });

  return [...unmatched.values()].sort((left, right) => right.labor_cost - left.labor_cost);
}

function buildInvestmentAnalyses(investment) {
  const analyses = [];
  const monthRows = investment.monthly_breakdown || [];
  const lastMonth = monthRows[monthRows.length - 1];
  const previousMonth = monthRows[monthRows.length - 2];

  if (investment.sales <= 0 && investment.total_cost <= 0) {
    analyses.push("Brak zapisanych kosztów i faktur sprzedażowych w rejestrach systemowych.");
  }

  if (investment.total_cost > 0 && investment.sales <= 0) {
    analyses.push("Kontrakt generuje koszty bez potwierdzonych faktur sprzedażowych w rejestrze faktur.");
  }

  if (investment.sales > 0 && investment.total_cost <= 0) {
    analyses.push("Wprowadzono faktury sprzedażowe bez faktur kosztowych i bez rozliczonego kosztu wynagrodzeń.");
  }

  if (investment.margin < 0) {
    analyses.push(`Kontrakt jest pod kreską. Aktualna marża wynosi ${formatMoney(investment.margin)}.`);
  } else if (investment.sales > 0) {
    analyses.push(`Aktualna marża kontraktu wynosi ${formatMoney(investment.margin)}.`);
  }

  if (investment.contract_value > 0 && investment.sales > investment.contract_value) {
    analyses.push("Faktury sprzedażowe przekroczyły kwotę ryczałtową wpisaną w kartotece kontraktu.");
  }

  if (investment.contract_value > 0 && investment.total_cost > investment.contract_value) {
    analyses.push("Łączne koszty są wyższe od kwoty ryczałtowej zapisanej w kontrakcie.");
  }

  if (investment.labor_hours > 0 && investment.labor_cost > 0) {
    analyses.push(
      `Średni koszt roboczogodziny w kontrakcie wynosi ${formatMoney(investment.labor_cost / Math.max(investment.labor_hours, 1))}.`
    );
  }

  if (lastMonth && previousMonth && lastMonth.total_cost > previousMonth.total_cost * 1.25) {
    analyses.push(`Koszt w miesiącu ${lastMonth.month_label} wzrósł wyraźnie względem poprzedniego okresu.`);
  }

  if (!analyses.length) {
    analyses.push("Dla kontraktu nie wykryto odchyleń wymagających reakcji.");
  }

  return analyses;
}

function buildAlerts(investments) {
  const alerts = [];

  investments.forEach((investment) => {
    const issues = [];
    if (investment.margin < 0) issues.push("ujemna marża");
    if (investment.total_cost > 0 && investment.sales <= 0) issues.push("koszty bez faktur sprzedażowych");
    if (investment.sales > 0 && investment.total_cost <= 0) issues.push("faktury sprzedażowe bez kosztów");
    if (investment.contract_value > 0 && investment.total_cost > investment.contract_value) {
      issues.push("koszt powyżej wartości kontraktu");
    }

    if (issues.length) {
      alerts.push({
        investment_name: investment.report_label,
        issues,
        margin_value: investment.margin,
      });
    }
  });

  return alerts.sort((left, right) => left.margin_value - right.margin_value).slice(0, 8);
}

function buildRecommendations(investments, unmatchedHours) {
  const recommendations = [];

  investments.forEach((investment) => {
    if (investment.margin < 0) {
      recommendations.push(`Zweryfikuj rentowność kontraktu ${investment.report_label} i porównaj koszty z wartością faktur sprzedażowych.`);
    }
    if (investment.total_cost > 0 && investment.sales <= 0) {
      recommendations.push(`Uzupełnij faktury sprzedażowe dla kontraktu ${investment.report_label}, bo w systemie są już koszty.`);
    }
    if (investment.sales > 0 && investment.total_cost <= 0) {
      recommendations.push(`Sprawdź, czy dla kontraktu ${investment.report_label} zostały rozliczone faktury kosztowe i ewidencja czasu pracy.`);
    }
  });

  unmatchedHours.slice(0, 3).forEach((item) => {
    recommendations.push(`Przypisz roboczogodziny z pozycji "${item.source_name}" do właściwego kontraktu, żeby koszt nie był poza raportem.`);
  });

  return [...new Set(recommendations)].slice(0, 10);
}

function buildInvestmentFromSnapshot(item) {
  const contract = item?.contract || {};
  const metrics = item?.metrics || {};
  const monthlyBreakdown = Array.isArray(item?.monthly_breakdown) ? item.monthly_breakdown : [];
  const investment = {
    id: String(contract.id || ""),
    name: textValue(contract.name),
    report_label: textValue(contract.contract_number)
      ? `${textValue(contract.contract_number)} - ${textValue(contract.name)}`
      : textValue(contract.name),
    contract_number: textValue(contract.contract_number),
    investor: textValue(contract.investor),
    status: textValue(contract.status) === "archived" ? "archived" : "active",
    signed_date: textValue(contract.signed_date),
    end_date: textValue(contract.end_date),
    contract_value: numberValue(contract.contract_value),
    material_cost: numberValue(metrics.invoice_cost_total),
    labor_cost: numberValue(metrics.labor_cost_total),
    total_cost: numberValue(metrics.cost_total),
    labor_hours: numberValue(metrics.labor_hours_total),
    sales: numberValue(metrics.revenue_total),
    margin: numberValue(metrics.margin),
    margin_percent: numberValue(metrics.revenue_total) > 0 ? numberValue(metrics.margin) / numberValue(metrics.revenue_total) : 0,
    invoice_count: Number(metrics.invoice_count || 0),
    material_invoice_count: Number(metrics.cost_invoice_count || 0),
    sales_invoice_count: Number(metrics.sales_invoice_count || 0),
    monthly_breakdown: monthlyBreakdown.map((bucket) => ({
      month_key: textValue(bucket.month_key),
      month_label: textValue(bucket.month_label) || monthLabel(bucket.month_key),
      sales: numberValue(bucket.revenue_total),
      material_cost: numberValue(bucket.invoice_cost_total),
      labor_cost: numberValue(bucket.labor_cost_total),
      labor_hours: numberValue(bucket.labor_hours_total),
      total_cost: numberValue(bucket.cost_total),
      margin: numberValue(bucket.margin),
      invoice_count: Number(bucket.invoice_count || 0),
    })),
    analyses: [],
  };
  investment.analyses = buildInvestmentAnalyses(investment);
  return investment;
}

function mapDashboardSnapshot(payload) {
  const contracts = Array.isArray(payload?.contracts) ? payload.contracts : [];
  const investments = contracts
    .map(buildInvestmentFromSnapshot)
    .sort((left, right) => {
      const leftCode = String(left.contract_number || "9999");
      const rightCode = String(right.contract_number || "9999");
      const byCode = leftCode.localeCompare(rightCode, "pl", { numeric: true });
      if (byCode !== 0) return byCode;
      return left.name.localeCompare(right.name, "pl", { sensitivity: "base", numeric: true });
    });

  const totalsSource = payload?.totals || {};
  const unassignedSource = payload?.unassigned || {};
  const unmatchedHours = Array.isArray(payload?.unmatched_hours) ? payload.unmatched_hours.map((item) => ({
    source_name: textValue(item.source_name),
    entries: Number(item.entries || 0),
    labor_hours: numberValue(item.labor_hours),
    labor_cost: numberValue(item.labor_cost),
  })) : [];

  return {
    totals: {
      total_material: numberValue(totalsSource.invoice_cost_total),
      total_labor: numberValue(totalsSource.labor_cost_total),
      total_cost: numberValue(totalsSource.cost_total),
      total_sales: numberValue(totalsSource.revenue_total),
      total_margin: numberValue(totalsSource.margin),
      investments_count: investments.length,
    },
    investments,
    alerts: buildAlerts(investments),
    recommendations: buildRecommendations(investments, unmatchedHours),
    top_positive: [...investments]
      .sort((left, right) => right.margin - left.margin)
      .slice(0, 5)
      .map((investment) => ({
        investment_name: investment.report_label,
        sales_revenue: investment.sales,
        material_cost: investment.material_cost,
        margin_value: investment.margin,
      })),
    top_negative: [...investments]
      .sort((left, right) => left.margin - right.margin)
      .slice(0, 5)
      .map((investment) => ({
        investment_name: investment.report_label,
        sales_revenue: investment.sales,
        material_cost: investment.material_cost,
        margin_value: investment.margin,
      })),
    unassigned: {
      cost_invoice_count: Number(unassignedSource.cost_invoice_count || 0),
      cost_net: numberValue(unassignedSource.invoice_cost_total),
      sales_invoice_count: Number(unassignedSource.sales_invoice_count || 0),
      sales_net: numberValue(unassignedSource.revenue_total),
      labor_entries: unmatchedHours.reduce((sum, entry) => sum + numberValue(entry.entries), 0),
      labor_hours: numberValue(unassignedSource.labor_hours_total),
      labor_cost: numberValue(unassignedSource.labor_cost_total),
      margin: numberValue(unassignedSource.margin),
    },
    unassigned_invoices: Array.isArray(payload?.unassigned_invoices) ? payload.unassigned_invoices.map((entry, index) => ({
      id: textValue(entry.id) || `unassigned-${index}`,
      type: String(entry.type || "cost") === "sales" ? "sales" : "cost",
      contract_name: textValue(entry.contract_name),
      issue_date: textValue(entry.issue_date),
      document_number: textValue(entry.document_number),
      party: textValue(entry.party),
      category: textValue(entry.category),
      description: textValue(entry.description),
      net_amount: numberValue(entry.net_amount),
      vat_rate: numberValue(entry.vat_rate),
      gross_amount: numberValue(entry.gross_amount),
    })) : [],
    unmatched_hours: unmatchedHours,
  };
}

function buildDashboardData() {
  const investmentMap = new Map(
    getContracts().map((contract) => [contract.name, createInvestmentRecord(contract)])
  );
  const investmentLookup = buildInvestmentLookup(investmentMap);

  addInvoiceData(investmentMap, investmentLookup);
  const unmatchedHours = addHoursData(investmentMap, investmentLookup);
  const unassignedInvoices = getUnassignedInvoiceEntries(investmentMap, investmentLookup);
  const unassigned = buildUnassignedSummary(unassignedInvoices, unmatchedHours);

  const investments = [...investmentMap.values()]
    .map((investment) => {
      investment.monthly_breakdown = [...investment._monthly.values()]
        .sort((left, right) => left.month_key.localeCompare(right.month_key, "pl"))
        .map((bucket) => ({
          ...bucket,
          total_cost: bucket.material_cost + bucket.labor_cost,
          margin: bucket.sales - (bucket.material_cost + bucket.labor_cost),
        }));

      investment.total_cost = investment.material_cost + investment.labor_cost;
      investment.margin = investment.sales - investment.total_cost;
      investment.margin_percent = investment.sales > 0 ? investment.margin / investment.sales : 0;
      investment.analyses = buildInvestmentAnalyses(investment);
      delete investment._monthly;
      return investment;
    })
    .sort((left, right) => {
      const leftCode = String(left.contract_number || "9999");
      const rightCode = String(right.contract_number || "9999");
      const byCode = leftCode.localeCompare(rightCode, "pl", { numeric: true });
      if (byCode !== 0) return byCode;
      return left.name.localeCompare(right.name, "pl", { sensitivity: "base", numeric: true });
    });

  const totals = investments.reduce((summary, investment) => {
    summary.total_material += investment.material_cost;
    summary.total_labor += investment.labor_cost;
    summary.total_cost += investment.total_cost;
    summary.total_sales += investment.sales;
    summary.total_margin += investment.margin;
    return summary;
  }, {
    total_material: 0,
    total_labor: 0,
    total_cost: 0,
    total_sales: 0,
    total_margin: 0,
    investments_count: investments.length,
  });

  totals.total_material += unassigned.cost_net;
  totals.total_labor += unassigned.labor_cost;
  totals.total_sales += unassigned.sales_net;
  totals.total_cost = totals.total_material + totals.total_labor;
  totals.total_margin = totals.total_sales - totals.total_cost;

  const topPositive = [...investments]
    .sort((left, right) => right.margin - left.margin)
    .slice(0, 5)
    .map((investment) => ({
      investment_name: investment.report_label,
      sales_revenue: investment.sales,
      material_cost: investment.material_cost,
      margin_value: investment.margin,
    }));

  const topNegative = [...investments]
    .sort((left, right) => left.margin - right.margin)
    .slice(0, 5)
    .map((investment) => ({
      investment_name: investment.report_label,
      sales_revenue: investment.sales,
      material_cost: investment.material_cost,
      margin_value: investment.margin,
    }));

  return {
    meta: {
      source_file: "Dane wprowadzone w systemie",
      generated_at: new Date().toISOString(),
    },
    totals,
    investments,
    alerts: buildAlerts(investments),
    recommendations: buildRecommendations(investments, unmatchedHours),
    top_positive: topPositive,
    top_negative: topNegative,
    unassigned,
    unassigned_invoices: unassignedInvoices,
    unmatched_hours: unmatchedHours,
  };
}

function getSelectedInvestment() {
  if (!state.data || !state.data.investments.length) return null;
  return state.data.investments.find((item) => item.id === state.selectedInvestmentId) || state.data.investments[0];
}

async function loadData() {
  if (!window.ClodeAuthClient?.isAuthenticated?.()) {
    state.data = emptyDashboardData();
    state.errorMessage = "";
    window.dispatchEvent(new CustomEvent("dashboard-data-updated", {
      detail: {
        data: state.data,
        errorMessage: state.errorMessage,
      },
    }));
    renderDashboardIfActive();
    return;
  }

  const api = getDashboardApi();
  if (!api?.getDashboardSnapshot) {
    state.data = emptyDashboardData();
    state.errorMessage = "Brak połączenia z backendowym snapshotem dashboardu.";
    window.dispatchEvent(new CustomEvent("dashboard-data-updated", {
      detail: {
        data: state.data,
        errorMessage: state.errorMessage,
      },
    }));
    renderDashboardIfActive();
    return;
  }

  state.loading = true;
  try {
    const payload = await api.getDashboardSnapshot({ includeArchived: false });
    state.data = mapDashboardSnapshot(payload);
    state.errorMessage = "";
  } catch (error) {
    state.data = emptyDashboardData();
    state.errorMessage = error?.message || "Nie udało się pobrać danych dashboardu z backendu.";
  } finally {
    state.loading = false;
  }

  if (!state.selectedInvestmentId && state.data.investments.length) {
    state.selectedInvestmentId = state.data.investments[0].id;
  }
  if (state.selectedInvestmentId && !state.data.investments.some((item) => item.id === state.selectedInvestmentId)) {
    state.selectedInvestmentId = state.data.investments[0]?.id || null;
  }
  window.dispatchEvent(new CustomEvent("dashboard-data-updated", {
    detail: {
      data: state.data,
      errorMessage: state.errorMessage,
    },
  }));
  renderDashboardIfActive();
}

async function triggerRefresh() {
  const button = document.getElementById("refreshButton");
  if (!button) return;

  button.disabled = true;
  button.textContent = "Odświeżanie...";
  try {
    await loadData();
  } finally {
    button.disabled = false;
    button.textContent = "Odśwież dane";
  }
}

function renderRankList(containerId, items, positive) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<p>Brak danych do wyświetlenia.</p>";
    return;
  }

  items.forEach((item) => {
    const el = document.createElement("article");
    el.className = "rank-item";
    el.innerHTML = `
      <strong>${window.ClodeTableUtils.escapeHtml(item.investment_name)}</strong>
      <small>Faktury sprzedażowe: ${formatMoney(item.sales_revenue)} | Faktury kosztowe: ${formatMoney(item.material_cost)}</small>
      <div class="${positive ? "status-good" : "status-bad"}">${formatMoney(item.margin_value)}</div>
    `;
    container.appendChild(el);
  });
}

function renderAlerts() {
  const alerts = document.getElementById("alerts");
  const recommendations = document.getElementById("recommendations");
  if (!alerts || !recommendations) return;

  alerts.innerHTML = "";
  recommendations.innerHTML = "";

  if (!state.data.alerts.length) {
    alerts.innerHTML = "<p>Brak aktywnych alertów w danych systemowych.</p>";
  } else {
    state.data.alerts.forEach((alert) => {
      const el = document.createElement("article");
      el.className = "alert-item";
      el.innerHTML = `
        <strong>${window.ClodeTableUtils.escapeHtml(alert.investment_name)}</strong>
        <small>${window.ClodeTableUtils.escapeHtml(alert.issues.join(", "))}</small>
        <div class="status-bad">${formatMoney(alert.margin_value)}</div>
      `;
      alerts.appendChild(el);
    });
  }

  if (!state.data.recommendations.length) {
    recommendations.innerHTML = "<p>Brak rekomendacji do wyświetlenia.</p>";
    return;
  }

  state.data.recommendations.forEach((text) => {
    const el = document.createElement("article");
    el.className = "recommendation-item";
    el.innerHTML = `<small>${window.ClodeTableUtils.escapeHtml(text)}</small>`;
    recommendations.appendChild(el);
  });
}

function getSortedInvestments() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.data.investments.filter((item) => {
    if (!query) return true;
    return [
      item.report_label,
      item.name,
      item.investor,
      item.contract_number,
      item.status === "completed" ? "zakończony" : "w realizacji",
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
  return window.ClodeTableUtils.sortItems(filtered, state.sorts.investments, investmentColumns);
}

function renderInvestments() {
  const target = document.getElementById("investmentsTable");
  if (!target) return;

  if (state.errorMessage) {
    target.innerHTML = `<p>${window.ClodeTableUtils.escapeHtml(state.errorMessage)}</p>`;
    return;
  }
  if (state.loading && !(state.data?.investments || []).length) {
    target.innerHTML = "<p>Ładowanie danych dashboardu...</p>";
    return;
  }

  const items = getSortedInvestments();
  if (!items.length) {
    target.innerHTML = "<p>Brak kontraktów dla podanego filtra.</p>";
    return;
  }

  if (!items.some((item) => item.id === state.selectedInvestmentId)) {
    state.selectedInvestmentId = items[0].id;
  }

  const shell = document.createElement("div");
  shell.className = "form-table-shell dashboard-table-shell";

  const table = document.createElement("table");
  table.className = "data-table invoice-module-table dashboard-investments-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Lp.</th>
        <th>${window.ClodeTableUtils.renderHeader("Kontrakt", "investments", "name", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Faktury sprzedażowe", "investments", "sales", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Faktury kosztowe", "investments", "material_cost", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Koszt wynagrodzeń", "investments", "labor_cost", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Łączny koszt", "investments", "total_cost", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Godziny", "investments", "labor_hours", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Marża", "investments", "margin", state.sorts.investments)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Trend", "investments", "trend", state.sorts.investments)}</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  items.forEach((item, index) => {
    const row = document.createElement("tr");
    row.className = item.id === state.selectedInvestmentId ? "investment-row is-selected" : "investment-row";
    row.dataset.investmentId = item.id;
    row.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${window.ClodeTableUtils.escapeHtml(item.report_label)}</strong></td>
      <td class="text-right">${formatMoney(item.sales)}</td>
      <td class="text-right">${formatMoney(item.material_cost)}</td>
      <td class="text-right">${formatMoney(item.labor_cost)}</td>
      <td class="text-right">${formatMoney(item.total_cost)}</td>
      <td class="text-right">${formatNumber(item.labor_hours)}</td>
      <td class="text-right ${item.margin < 0 ? "status-bad" : "status-good"}">${formatMoney(item.margin)}</td>
      <td class="text-right">${formatMoney((item.monthly_breakdown || []).slice(-1)[0]?.total_cost || 0)}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  target.innerHTML = "";
  shell.appendChild(table);
  target.appendChild(shell);
}

function renderSummary() {
  if (!state.data) return;
  document.getElementById("totalMaterial").textContent = formatMoney(state.data.totals.total_material);
  document.getElementById("totalLabor").textContent = formatMoney(state.data.totals.total_labor);
  document.getElementById("totalCost").textContent = formatMoney(state.data.totals.total_cost);
  document.getElementById("totalSales").textContent = formatMoney(state.data.totals.total_sales);
  document.getElementById("totalMargin").textContent = formatMoney(state.data.totals.total_margin);
  document.getElementById("investmentsCount").textContent = String(state.data.totals.investments_count || 0);
}

function getFilteredUnassignedInvoices() {
  const query = state.search.trim().toLowerCase();
  const items = state.data?.unassigned_invoices || [];
  if (!query) return items;
  return items.filter((entry) =>
    [
      entry.document_number,
      entry.party,
      entry.category,
      entry.description,
      entry.contract_name || "Brak kontraktu",
      entry.type === "sales" ? "sprzedazowa" : "kosztowa",
    ].some((value) => String(value || "").toLowerCase().includes(query))
  );
}

function getSortedUnassignedInvoices() {
  const filtered = getFilteredUnassignedInvoices();
  return window.ClodeTableUtils.sortItems(filtered, state.sorts.unassignedInvoices, unassignedInvoiceColumns);
}

function getFilteredUnmatchedHours() {
  const query = state.search.trim().toLowerCase();
  const items = state.data?.unmatched_hours || [];
  if (!query) return items;
  return items.filter((entry) =>
    [entry.source_name, entry.entries, entry.labor_hours, entry.labor_cost]
      .some((value) => String(value || "").toLowerCase().includes(query))
  );
}

function getSortedUnmatchedHours() {
  const filtered = getFilteredUnmatchedHours();
  return window.ClodeTableUtils.sortItems(filtered, state.sorts.unmatchedHours, unmatchedHoursColumns);
}

function renderDashboardMode() {
  const investmentsTable = document.getElementById("investmentsTable");
  const unassignedPanel = document.getElementById("dashboardUnassignedPanel");
  const detailSection = document.getElementById("detailSection");
  const searchInput = document.getElementById("searchInput");

  document.querySelectorAll("#dashboardModeTabs [data-dashboard-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.dashboardMode === state.dashboardMode);
  });

  if (searchInput) {
    searchInput.placeholder = state.dashboardMode === "unassigned" ? "Szukaj pozycji" : "Szukaj kontraktu";
  }

  if (investmentsTable) investmentsTable.hidden = state.dashboardMode !== "contracts";
  if (unassignedPanel) unassignedPanel.hidden = state.dashboardMode !== "unassigned";
  if (detailSection) detailSection.hidden = state.dashboardMode !== "contracts";
}

function renderDetailStats(investment) {
  const target = document.getElementById("detailStats");
  if (!target) return;
  target.innerHTML = "";

  [
    ["Faktury sprzedażowe", investment.sales, "money"],
    ["Faktury kosztowe", investment.material_cost, "money"],
    ["Koszt wynagrodzeń", investment.labor_cost, "money"],
    ["Łączny koszt", investment.total_cost, "money"],
    ["Roboczogodziny", investment.labor_hours, "hours"],
    ["Marża", investment.margin, "money"],
  ].forEach(([label, value, type]) => {
    const card = document.createElement("article");
    card.className = "stat";
    card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${formatMetricMarkup(value, type)}</strong>`;
    target.appendChild(card);
  });
}

function renderDetailChart(investment) {
  const target = document.getElementById("detailChart");
  if (!target) return;
  target.innerHTML = "";

  const points = (investment.monthly_breakdown || []).slice(-6);
  if (!points.length) {
    target.innerHTML = "<p>Brak danych miesięcznych dla wybranego kontraktu.</p>";
    return;
  }

  const list = document.createElement("div");
  list.className = "recommendation-list";
  points.forEach((item) => {
    const card = document.createElement("article");
    card.className = "recommendation-item";
    card.innerHTML = `
      <small>
        ${window.ClodeTableUtils.escapeHtml(item.month_label || item.month_key)}:
        faktury sprzedażowe ${formatMoney(item.sales)},
        faktury kosztowe ${formatMoney(item.material_cost)},
        koszt wynagrodzeń ${formatMoney(item.labor_cost)}
      </small>
    `;
    list.appendChild(card);
  });
  target.appendChild(list);
}

function renderDetailAnalyses(investment) {
  const target = document.getElementById("detailAnalyses");
  if (!target) return;
  target.innerHTML = "";

  (investment.analyses || []).forEach((line) => {
    const card = document.createElement("article");
    card.className = "recommendation-item";
    card.innerHTML = `<small>${window.ClodeTableUtils.escapeHtml(line)}</small>`;
    target.appendChild(card);
  });
}

function renderDetailStructureChart(investment) {
  const target = document.getElementById("detailStructureChart");
  if (!target) return;
  target.innerHTML = "";

  const rows = [
    { label: "Faktury kosztowe", value: investment.material_cost, tone: "material" },
    { label: "Koszt wynagrodzeń", value: investment.labor_cost, tone: "labor" },
    { label: "Faktury sprzeda\u017cowe", value: investment.sales, tone: "sales" },
  ];
  const totalValue = rows.reduce((sum, row) => sum + Math.abs(Number(row.value || 0)), 0);

  if (!totalValue) {
    target.innerHTML = "<p>Brak danych finansowych dla wybranego kontraktu.</p>";
    return;
  }

  target.innerHTML = rows.map((row) => {
    const share = totalValue ? Math.round((Math.abs(Number(row.value || 0)) / totalValue) * 1000) / 10 : 0;
    return `
      <article class="detail-structure-row">
        <div class="detail-structure-head">
          <strong>${window.ClodeTableUtils.escapeHtml(row.label)}</strong>
          <span>${formatMoney(row.value)} • ${formatNumber(share)}%</span>
        </div>
        <div class="detail-structure-track">
          <div class="detail-structure-bar tone-${row.tone}" style="width:${Math.max(share, 2)}%"></div>
        </div>
      </article>
    `;
  }).join("");
}

function renderDetailMonthlyChart(investment) {
  const target = document.getElementById("detailMonthlyChart");
  if (!target) return;
  const rows = (investment.monthly_breakdown || []).slice(-12);

  if (!rows.length) {
    target.innerHTML = "<p>Brak danych miesi\u0119cznych dla wybranego kontraktu.</p>";
    return;
  }

  const maxValue = Math.max(...rows.flatMap((row) => [
    Number(row.material_cost || 0),
    Number(row.labor_cost || 0),
    Number(row.sales || 0),
  ]), 1);

  target.innerHTML = `
    <div class="detail-monthly-bars">
      ${rows.map((row) => `
        <article class="detail-monthly-row">
          <div class="detail-monthly-label">${window.ClodeTableUtils.escapeHtml(row.month_label || row.month_key)}</div>
          <div class="detail-monthly-series">
            <span class="detail-monthly-bar tone-material" style="width:${(Number(row.material_cost || 0) / maxValue) * 100}%"></span>
            <span class="detail-monthly-bar tone-labor" style="width:${(Number(row.labor_cost || 0) / maxValue) * 100}%"></span>
            <span class="detail-monthly-bar tone-sales" style="width:${(Number(row.sales || 0) / maxValue) * 100}%"></span>
          </div>
          <div class="detail-monthly-values">
            <div class="detail-monthly-metric">
              <span>Faktury kosztowe</span>
              <strong>${formatMoney(row.material_cost)}</strong>
            </div>
            <div class="detail-monthly-metric">
              <span>Koszt wynagrodzeń</span>
              <strong>${formatMoney(row.labor_cost)}</strong>
            </div>
            <div class="detail-monthly-metric">
              <span>Faktury sprzedażowe</span>
              <strong>${formatMoney(row.sales)}</strong>
            </div>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDetailTable(investment) {
  const target = document.getElementById("detailMonthlyTable");
  if (!target) return;

  const rows = window.ClodeTableUtils.sortItems(
    investment.monthly_breakdown || [],
    state.sorts.detailMonthly,
    detailMonthlyColumns
  );

  if (!rows.length) {
    target.innerHTML = "<p>Brak miesięcznych zapisów dla wybranego kontraktu.</p>";
    return;
  }

  const shell = document.createElement("div");
  shell.className = "form-table-shell dashboard-table-shell";

  const table = document.createElement("table");
  table.className = "data-table invoice-module-table dashboard-detail-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>Lp.</th>
        <th>${window.ClodeTableUtils.renderHeader("Miesiąc", "detailMonthly", "month_key", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Faktury sprzedażowe", "detailMonthly", "sales", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Faktury kosztowe", "detailMonthly", "material_cost", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Koszt wynagrodzeń", "detailMonthly", "labor_cost", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Godziny", "detailMonthly", "labor_hours", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Łączny koszt", "detailMonthly", "total_cost", state.sorts.detailMonthly)}</th>
        <th class="text-right">${window.ClodeTableUtils.renderHeader("Marża", "detailMonthly", "margin", state.sorts.detailMonthly)}</th>
      </tr>
    </thead>
  `;

  const tbody = document.createElement("tbody");
  rows.forEach((item, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${window.ClodeTableUtils.escapeHtml(item.month_label || item.month_key)}</td>
      <td class="text-right">${formatMoney(item.sales)}</td>
      <td class="text-right">${formatMoney(item.material_cost)}</td>
      <td class="text-right">${formatMoney(item.labor_cost)}</td>
      <td class="text-right">${formatNumber(item.labor_hours)}</td>
      <td class="text-right">${formatMoney(item.total_cost)}</td>
      <td class="text-right ${item.margin < 0 ? "status-bad" : "status-good"}">${formatMoney(item.margin)}</td>
    `;
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  target.innerHTML = "";
  shell.appendChild(table);
  target.appendChild(shell);
}

function legacyRenderUnmatchedHours() {
  const target = document.getElementById("unmatchedHours");
  if (!target) return;
  target.innerHTML = "";

  if (!(state.data.unmatched_hours || []).length) {
    target.innerHTML = "<p>Nie wykryto roboczogodzin poza rejestrem kontraktów.</p>";
    return;
  }

  (state.data.unmatched_hours || []).slice(0, 12).forEach((item) => {
    const card = document.createElement("article");
    card.className = "alert-item";
    card.innerHTML = `
      <strong>${window.ClodeTableUtils.escapeHtml(item.source_name)}</strong>
      <small>${window.ClodeTableUtils.escapeHtml(String(item.entries))} zapisów | ${formatNumber(item.labor_hours)} godz.</small>
      <div class="status-bad">${formatMoney(item.labor_cost)}</div>
    `;
    target.appendChild(card);
  });
}

function renderUnassignedStats() {
  const target = document.getElementById("dashboardUnassignedStats");
  if (!target) return;

  if (state.errorMessage) {
    target.innerHTML = `<p>${window.ClodeTableUtils.escapeHtml(state.errorMessage)}</p>`;
    return;
  }

  const invoiceItems = getFilteredUnassignedInvoices();
  const hoursItems = getFilteredUnmatchedHours();
  const costInvoiceCount = invoiceItems.filter((entry) => entry.type === "cost").length;
  const costNet = invoiceItems
    .filter((entry) => entry.type === "cost")
    .reduce((sum, entry) => sum + numberValue(entry.net_amount), 0);
  const salesInvoiceCount = invoiceItems.filter((entry) => entry.type === "sales").length;
  const salesNet = invoiceItems
    .filter((entry) => entry.type === "sales")
    .reduce((sum, entry) => sum + numberValue(entry.net_amount), 0);
  const laborHours = hoursItems.reduce((sum, entry) => sum + numberValue(entry.labor_hours), 0);
  const laborCost = hoursItems.reduce((sum, entry) => sum + numberValue(entry.labor_cost), 0);

  target.innerHTML = `
    <article class="stat"><span>Faktury kosztowe</span><strong>${formatMetricMarkup(costInvoiceCount, "count")}</strong></article>
    <article class="stat"><span>Koszty netto</span><strong>${formatMetricMarkup(costNet, "money")}</strong></article>
    <article class="stat"><span>Faktury sprzedażowe</span><strong>${formatMetricMarkup(salesInvoiceCount, "count")}</strong></article>
    <article class="stat"><span>Faktury sprzedażowe netto</span><strong>${formatMetricMarkup(salesNet, "money")}</strong></article>
    <article class="stat"><span>Godziny poza kontraktami</span><strong>${formatMetricMarkup(laborHours, "hours")}</strong></article>
    <article class="stat"><span>Koszt wynagrodzeń</span><strong>${formatMetricMarkup(laborCost, "money")}</strong></article>
  `;
}

function renderUnassignedInvoices() {
  const target = document.getElementById("dashboardUnassignedInvoices");
  if (!target) return;

  if (state.errorMessage) {
    target.innerHTML = `<p>${window.ClodeTableUtils.escapeHtml(state.errorMessage)}</p>`;
    return;
  }

  const items = getSortedUnassignedInvoices();
  if (!items.length) {
    target.innerHTML = "<p>Brak nieprzypisanych faktur dla bieżącego filtra.</p>";
    return;
  }

  const totalNet = items.reduce((sum, entry) => sum + numberValue(entry.net_amount), 0);
  const totalGross = items.reduce((sum, entry) => sum + numberValue(entry.gross_amount), 0);

  target.innerHTML = `
    <div class="form-table-shell dashboard-table-shell">
      <table class="data-table invoice-module-table">
        <thead>
          <tr>
            <th>Lp.</th>
            <th>${window.ClodeTableUtils.renderHeader("Data wystawienia", "unassignedInvoices", "issue_date", state.sorts.unassignedInvoices)}</th>
            <th>${window.ClodeTableUtils.renderHeader("Typ", "unassignedInvoices", "type", state.sorts.unassignedInvoices)}</th>
            <th>${window.ClodeTableUtils.renderHeader("Numer faktury", "unassignedInvoices", "document_number", state.sorts.unassignedInvoices)}</th>
            <th>${window.ClodeTableUtils.renderHeader("Wpisany kontrakt", "unassignedInvoices", "contract_name", state.sorts.unassignedInvoices)}</th>
            <th>${window.ClodeTableUtils.renderHeader("Kontrahent", "unassignedInvoices", "party", state.sorts.unassignedInvoices)}</th>
            <th>${window.ClodeTableUtils.renderHeader("Kategoria / opis", "unassignedInvoices", "category_or_description", state.sorts.unassignedInvoices)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("Netto", "unassignedInvoices", "net_amount", state.sorts.unassignedInvoices)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("VAT", "unassignedInvoices", "vat_rate", state.sorts.unassignedInvoices)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("Brutto", "unassignedInvoices", "gross_amount", state.sorts.unassignedInvoices)}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((entry, index) => {
            const description = [entry.category, entry.description].filter(Boolean).join(" • ") || "-";
            const net = numberValue(entry.net_amount);
            const gross = numberValue(entry.gross_amount);
            const vatAmount = gross && net ? Math.max(0, gross - net) : 0;
            const vatRateLabel = numberValue(entry.vat_rate) ? `${formatNumber(entry.vat_rate)}%` : "bez VAT";
            return `
              <tr>
                <td>${index + 1}</td>
                <td>${formatDate(entry.issue_date)}</td>
                <td>${entry.type === "sales" ? "Faktura sprzedażowa" : "Faktura kosztowa"}</td>
                <td>${window.ClodeTableUtils.escapeHtml(entry.document_number || "-")}</td>
                <td>${window.ClodeTableUtils.escapeHtml(entry.contract_name || "Brak kontraktu")}</td>
                <td>${window.ClodeTableUtils.escapeHtml(entry.party || "-")}</td>
                <td class="invoice-description-cell">
                  <div class="invoice-description-content">
                    <strong>${window.ClodeTableUtils.escapeHtml(entry.category || "-")}</strong>
                    ${entry.description ? `<small>${window.ClodeTableUtils.escapeHtml(entry.description)}</small>` : ""}
                  </div>
                </td>
                <td class="text-right">${formatMoney(entry.net_amount)}</td>
                <td class="text-right">${vatRateLabel}<br><small>${formatMoney(vatAmount)}</small></td>
                <td class="text-right">${formatMoney(entry.gross_amount)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
        <tfoot>
          <tr class="invoice-summary-row">
            <td colspan="7">Suma dla bieżącego filtra</td>
            <td class="text-right">${formatMoney(totalNet)}</td>
            <td class="text-right">-</td>
            <td class="text-right">${formatMoney(totalGross)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

function renderUnmatchedHours() {
  const target = document.getElementById("dashboardUnmatchedHours");
  if (!target) return;
  target.innerHTML = "";

  if (state.errorMessage) {
    target.innerHTML = `<p>${window.ClodeTableUtils.escapeHtml(state.errorMessage)}</p>`;
    return;
  }

  const items = getSortedUnmatchedHours();
  if (!items.length) {
    target.innerHTML = "<p>Nie wykryto roboczogodzin poza rejestrem kontraktów.</p>";
    return;
  }

  target.innerHTML = `
    <div class="form-table-shell dashboard-table-shell">
      <table class="data-table invoice-module-table">
        <thead>
          <tr>
            <th>Lp.</th>
            <th>${window.ClodeTableUtils.renderHeader("Pozycja", "unmatchedHours", "source_name", state.sorts.unmatchedHours)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("Zapisy", "unmatchedHours", "entries", state.sorts.unmatchedHours)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("Godziny", "unmatchedHours", "labor_hours", state.sorts.unmatchedHours)}</th>
            <th class="text-right">${window.ClodeTableUtils.renderHeader("Koszt wynagrodzeń", "unmatchedHours", "labor_cost", state.sorts.unmatchedHours)}</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${window.ClodeTableUtils.escapeHtml(item.source_name)}</td>
              <td class="text-right">${window.ClodeTableUtils.escapeHtml(String(item.entries))}</td>
              <td class="text-right">${formatNumber(item.labor_hours)}</td>
              <td class="text-right status-bad">${formatMoney(item.labor_cost)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDetail() {
  const investment = getSelectedInvestment();
  if (!investment) {
    document.getElementById("detailName").textContent = "-";
    document.getElementById("detailSubline").textContent = "";
    document.getElementById("detailStats").innerHTML = "";
    document.getElementById("detailStructureChart").innerHTML = "<p>Brak danych do wyświetlenia.</p>";
    document.getElementById("detailMonthlyChart").innerHTML = "<p>Brak danych do wyświetlenia.</p>";
    document.getElementById("detailMonthlyTable").innerHTML = "";
    return;
  }

  const metaParts = [
    investment.investor || "Brak inwestora",
    investment.status === "completed" ? "Zakończony" : "W realizacji",
    investment.contract_value ? `Wartość kontraktu ${formatMoney(investment.contract_value)}` : "Brak wartości kontraktu",
  ];

  document.getElementById("detailName").textContent = investment.report_label;
  document.getElementById("detailSubline").textContent = metaParts.join(" • ");

  renderDetailStats(investment);
  renderDetailStructureChart(investment);
  renderDetailMonthlyChart(investment);
  renderDetailTable(investment);
}

function render() {
  if (!state.data) return;
  renderSummary();
  renderDashboardMode();
  if (state.dashboardMode === "unassigned") {
    renderUnassignedStats();
    renderUnassignedInvoices();
    renderUnmatchedHours();
    return;
  }
  renderInvestments();
  renderDetail();
}

function renderDashboardIfActive() {
  if (typeof window.isAppViewActive === "function" && !window.isAppViewActive("dashboardView")) {
    return;
  }
  render();
}

window.refreshDashboardLocalRegistry = function refreshDashboardLocalRegistry() {
  void loadData();
};

window.getDashboardInvestments = function getDashboardInvestments() {
  return state.data?.investments || [];
};

window.getDashboardSnapshotData = function getDashboardSnapshotData() {
  return state.data || emptyDashboardData();
};

function bindEvents() {
  document.getElementById("searchInput")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
  });

  document.getElementById("dashboardModeTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-dashboard-mode]");
    if (!button) return;
    state.dashboardMode = button.dataset.dashboardMode === "unassigned" ? "unassigned" : "contracts";
    state.search = "";
    const searchInput = document.getElementById("searchInput");
    if (searchInput) searchInput.value = "";
    render();
  });

  document.getElementById("investmentsTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='investments']");
    if (sortButton) {
      state.sorts.investments = window.ClodeTableUtils.nextSort(
        state.sorts.investments,
        sortButton.dataset.sortKey,
        investmentColumns
      );
      renderInvestments();
      renderDetail();
      return;
    }

    const row = event.target.closest("tr[data-investment-id]");
    if (!row) return;
    state.selectedInvestmentId = row.dataset.investmentId;
    renderInvestments();
    renderDetail();
  });

  document.getElementById("detailMonthlyTable")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='detailMonthly']");
    if (!sortButton) return;
    state.sorts.detailMonthly = window.ClodeTableUtils.nextSort(
      state.sorts.detailMonthly,
      sortButton.dataset.sortKey,
      detailMonthlyColumns
    );
    renderDetail();
  });

  document.getElementById("dashboardUnassignedInvoices")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='unassignedInvoices']");
    if (!sortButton) return;
    state.sorts.unassignedInvoices = window.ClodeTableUtils.nextSort(
      state.sorts.unassignedInvoices,
      sortButton.dataset.sortKey,
      unassignedInvoiceColumns
    );
    renderUnassignedInvoices();
  });

  document.getElementById("dashboardUnmatchedHours")?.addEventListener("click", (event) => {
    const sortButton = event.target.closest("button[data-sort-table='unmatchedHours']");
    if (!sortButton) return;
    state.sorts.unmatchedHours = window.ClodeTableUtils.nextSort(
      state.sorts.unmatchedHours,
      sortButton.dataset.sortKey,
      unmatchedHoursColumns
    );
    renderUnmatchedHours();
  });

  ["contract-registry-updated", "hours-registry-updated", "invoice-registry-updated", "clode-auth-changed"].forEach((eventName) => {
    window.addEventListener(eventName, () => {
      void loadData();
    });
  });

  window.addEventListener("app-view-changed", (event) => {
    if (event.detail?.viewId === "dashboardView") {
      void loadData();
    }
  });
}

function init() {
  bindEvents();
  void loadData();
}

init();

