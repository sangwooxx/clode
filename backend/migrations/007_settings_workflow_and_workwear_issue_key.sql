CREATE TABLE IF NOT EXISTS settings_workflow (
    id TEXT PRIMARY KEY,
    vacation_approval_mode TEXT NOT NULL DEFAULT 'permission',
    vacation_notifications TEXT NOT NULL DEFAULT 'on',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
