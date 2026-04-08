PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS invoices_new (
    id TEXT PRIMARY KEY,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL CHECK (type IN ('cost', 'sales')),
    issue_date TEXT NOT NULL DEFAULT '',
    invoice_number TEXT NOT NULL DEFAULT '',
    counterparty_name TEXT NOT NULL DEFAULT '',
    category_or_description TEXT NOT NULL DEFAULT '',
    amount_net REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0,
    amount_vat REAL NOT NULL DEFAULT 0,
    amount_gross REAL NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL DEFAULT '',
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'overdue')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

INSERT INTO invoices_new (
    id, contract_id, contract_name, type, issue_date, invoice_number,
    counterparty_name, category_or_description, amount_net, vat_rate,
    amount_vat, amount_gross, due_date, payment_date, payment_status,
    notes, created_at, updated_at, created_by, updated_by, is_deleted
)
SELECT
    id,
    contract_id,
    COALESCE(contract_name, ''),
    COALESCE(invoice_type, 'cost'),
    COALESCE(issue_date, ''),
    COALESCE(document_number, ''),
    COALESCE(party, ''),
    CASE
        WHEN trim(COALESCE(category, '')) <> '' THEN trim(category)
        ELSE trim(COALESCE(description, ''))
    END,
    COALESCE(net_amount, 0),
    COALESCE(vat_rate, 0),
    ROUND(COALESCE(gross_amount, ROUND(COALESCE(net_amount, 0) * (1 + COALESCE(vat_rate, 0) / 100.0), 2)) - COALESCE(net_amount, 0), 2),
    COALESCE(gross_amount, ROUND(COALESCE(net_amount, 0) * (1 + COALESCE(vat_rate, 0) / 100.0), 2)),
    '',
    '',
    'unpaid',
    COALESCE(description, ''),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    NULL,
    NULL,
    0
FROM invoices;

DROP TABLE invoices;
ALTER TABLE invoices_new RENAME TO invoices;

CREATE INDEX IF NOT EXISTS invoices_contract_id_idx ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS invoices_contract_name_idx ON invoices(contract_name);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS invoices_type_idx ON invoices(type);
CREATE INDEX IF NOT EXISTS invoices_payment_status_idx ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS invoices_active_scope_idx ON invoices(is_deleted, type, issue_date);

PRAGMA foreign_keys = ON;
