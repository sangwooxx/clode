CREATE TABLE IF NOT EXISTS store_documents (
    store_name TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT,
    name TEXT NOT NULL,
    investor TEXT NOT NULL DEFAULT '',
    signed_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    contract_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    deleted_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
);

CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    employment_date TEXT NOT NULL DEFAULT '',
    employment_end_date TEXT NOT NULL DEFAULT '',
    street TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    medical_exam_valid_until TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hours_months (
    id TEXT PRIMARY KEY,
    month_key TEXT NOT NULL UNIQUE,
    month_label TEXT NOT NULL DEFAULT '',
    selected INTEGER NOT NULL DEFAULT 0,
    visible_investments_json TEXT NOT NULL DEFAULT '[]',
    finance_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '{}',
    can_approve_vacations INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL CHECK (type IN ('cost', 'sales')),
    issue_date TEXT NOT NULL DEFAULT '',
    invoice_number TEXT NOT NULL DEFAULT '',
    counterparty_name TEXT NOT NULL DEFAULT '',
    category_or_description TEXT NOT NULL DEFAULT '',
    cost_category TEXT NOT NULL DEFAULT 'other',
    amount_net DOUBLE PRECISION NOT NULL DEFAULT 0,
    vat_rate DOUBLE PRECISION NOT NULL DEFAULT 0,
    amount_vat DOUBLE PRECISION NOT NULL DEFAULT 0,
    amount_gross DOUBLE PRECISION NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL DEFAULT '',
    payment_date TEXT NOT NULL DEFAULT '',
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'overdue')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    created_by TEXT,
    updated_by TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (contract_id) REFERENCES contracts(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    month_id TEXT NOT NULL,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    hours DOUBLE PRECISION NOT NULL DEFAULT 0,
    cost_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    FOREIGN KEY (month_id) REFERENCES hours_months(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE IF NOT EXISTS vacation_balances (
    employee_id TEXT PRIMARY KEY,
    employee_name TEXT NOT NULL,
    base_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    carryover_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    extra_days DOUBLE PRECISION NOT NULL DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS vacation_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    request_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS planning_assignments (
    id TEXT PRIMARY KEY,
    assignment_date TEXT NOT NULL,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE IF NOT EXISTS workwear_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workwear_issues (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    issue_date TEXT NOT NULL,
    item_id TEXT,
    item_name TEXT NOT NULL DEFAULT '',
    size TEXT NOT NULL DEFAULT '',
    quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (item_id) REFERENCES workwear_catalog(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    subject TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    notification_type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    meta_json TEXT NOT NULL DEFAULT '{}',
    read INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique_idx ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email) WHERE email <> '';
CREATE INDEX IF NOT EXISTS auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_expires_idx ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);
CREATE INDEX IF NOT EXISTS contracts_updated_at_idx ON contracts(updated_at);
CREATE INDEX IF NOT EXISTS invoices_contract_id_idx ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS invoices_contract_name_idx ON invoices(contract_name);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS invoices_type_idx ON invoices(type);
CREATE INDEX IF NOT EXISTS invoices_payment_status_idx ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS invoices_active_scope_idx ON invoices(is_deleted, type, issue_date);
CREATE INDEX IF NOT EXISTS invoices_cost_category_idx ON invoices(cost_category);
CREATE INDEX IF NOT EXISTS time_entries_contract_id_idx ON time_entries(contract_id);
CREATE INDEX IF NOT EXISTS time_entries_month_id_idx ON time_entries(month_id);
CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS time_entries_month_contract_idx ON time_entries(month_id, contract_id);
CREATE INDEX IF NOT EXISTS time_entries_month_employee_idx ON time_entries(month_id, employee_id);
CREATE INDEX IF NOT EXISTS hours_months_month_key_idx ON hours_months(month_key);
CREATE INDEX IF NOT EXISTS planning_assignments_contract_id_idx ON planning_assignments(contract_id);
CREATE INDEX IF NOT EXISTS planning_assignments_assignment_date_idx ON planning_assignments(assignment_date);
