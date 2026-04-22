CREATE TABLE IF NOT EXISTS contract_controls (
    contract_id TEXT PRIMARY KEY,
    planned_revenue_total REAL,
    planned_invoice_cost_total REAL,
    planned_labor_cost_total REAL,
    forecast_revenue_total REAL,
    forecast_invoice_cost_total REAL,
    forecast_labor_cost_total REAL,
    note TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS contract_controls_updated_at_idx
ON contract_controls(updated_at);
