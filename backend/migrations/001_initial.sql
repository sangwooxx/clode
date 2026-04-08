CREATE TABLE IF NOT EXISTS store_documents (
    store_name TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    contract_number TEXT,
    name TEXT NOT NULL,
    investor TEXT NOT NULL DEFAULT '',
    signed_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    contract_value REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    deleted_at TEXT
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

CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    invoice_type TEXT NOT NULL,
    issue_date TEXT NOT NULL DEFAULT '',
    document_number TEXT NOT NULL DEFAULT '',
    party TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    net_amount REAL NOT NULL DEFAULT 0,
    vat_rate REAL NOT NULL DEFAULT 0,
    gross_amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE IF NOT EXISTS hours_months (
    id TEXT PRIMARY KEY,
    month_key TEXT NOT NULL UNIQUE,
    month_label TEXT NOT NULL DEFAULT '',
    selected INTEGER NOT NULL DEFAULT 0,
    visible_investments_json TEXT NOT NULL DEFAULT '[]',
    finance_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    month_id TEXT NOT NULL,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    contract_id TEXT,
    contract_name TEXT NOT NULL DEFAULT '',
    hours REAL NOT NULL DEFAULT 0,
    cost_amount REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (month_id) REFERENCES hours_months(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (contract_id) REFERENCES contracts(id)
);

CREATE TABLE IF NOT EXISTS vacation_balances (
    employee_id TEXT PRIMARY KEY,
    employee_name TEXT NOT NULL,
    base_days REAL NOT NULL DEFAULT 0,
    carryover_days REAL NOT NULL DEFAULT 0,
    extra_days REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE IF NOT EXISTS vacation_requests (
    id TEXT PRIMARY KEY,
    employee_id TEXT,
    employee_name TEXT NOT NULL,
    request_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    days REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    requested_by TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
    quantity REAL NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (item_id) REFERENCES workwear_catalog(id)
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
    can_approve_vacations INTEGER NOT NULL DEFAULT 0
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
