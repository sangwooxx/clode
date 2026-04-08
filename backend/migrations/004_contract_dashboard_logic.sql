ALTER TABLE contracts ADD COLUMN created_at TEXT NOT NULL DEFAULT '';
ALTER TABLE contracts ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';

UPDATE contracts
SET status = CASE
    WHEN lower(trim(COALESCE(status, ''))) IN ('archived', 'completed', 'inactive', 'deleted') THEN 'archived'
    ELSE 'active'
END;

UPDATE contracts
SET created_at = CURRENT_TIMESTAMP
WHERE trim(COALESCE(created_at, '')) = '';

UPDATE contracts
SET updated_at = CURRENT_TIMESTAMP
WHERE trim(COALESCE(updated_at, '')) = '';

ALTER TABLE invoices ADD COLUMN cost_category TEXT NOT NULL DEFAULT 'other';

UPDATE invoices
SET cost_category = CASE
    WHEN type <> 'cost' THEN ''
    WHEN lower(trim(COALESCE(category_or_description, ''))) IN ('materials', 'labor', 'equipment', 'transport', 'services', 'other')
        THEN lower(trim(category_or_description))
    ELSE 'other'
END;

CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_updated_at_idx ON contracts(updated_at);
CREATE INDEX IF NOT EXISTS time_entries_contract_id_idx ON time_entries(contract_id);
CREATE INDEX IF NOT EXISTS hours_months_month_key_idx ON hours_months(month_key);
CREATE INDEX IF NOT EXISTS planning_assignments_contract_id_idx ON planning_assignments(contract_id);
CREATE INDEX IF NOT EXISTS planning_assignments_assignment_date_idx ON planning_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS invoices_cost_category_idx ON invoices(cost_category);
