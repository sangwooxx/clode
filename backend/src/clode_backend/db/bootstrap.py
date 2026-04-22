from __future__ import annotations

from pathlib import Path
import shutil
import sqlite3

from clode_backend.config import Settings
from clode_backend.db.connection import connect


def _sqlite_migration_files(settings: Settings) -> list[Path]:
    migration_dir = settings.project_root / "backend" / "migrations"
    return sorted(migration_dir.glob("*.sql"))


def _postgres_schema_file(settings: Settings) -> Path:
    return settings.project_root / "backend" / "schema" / "postgresql.sql"


def _table_count(connection, table_name: str) -> int:
    row = connection.execute(f"SELECT COUNT(*) AS count FROM {table_name}").fetchone()
    return int((row or {}).get("count") or 0)


def _sqlite_column_exists(connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(str(row["name"]) == column_name for row in rows)


def _postgres_column_exists(connection, table_name: str, column_name: str) -> bool:
    row = connection.execute(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = ? AND column_name = ?
        """,
        (table_name, column_name),
    ).fetchone()
    return bool(row)


def _ensure_employee_worker_code_schema(connection, *, is_sqlite: bool) -> None:
    column_exists = (
        _sqlite_column_exists(connection, "employees", "worker_code")
        if is_sqlite
        else _postgres_column_exists(connection, "employees", "worker_code")
    )
    if not column_exists:
        connection.execute(
            "ALTER TABLE employees ADD COLUMN worker_code TEXT NOT NULL DEFAULT ''"
        )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS employees_worker_code_idx ON employees(worker_code)"
    )


def _ensure_workwear_issue_employee_key_schema(connection, *, is_sqlite: bool) -> None:
    column_exists = (
        _sqlite_column_exists(connection, "workwear_issues", "employee_key")
        if is_sqlite
        else _postgres_column_exists(connection, "workwear_issues", "employee_key")
    )
    if not column_exists:
        connection.execute(
            "ALTER TABLE workwear_issues ADD COLUMN employee_key TEXT NOT NULL DEFAULT ''"
        )


def _ensure_column(connection, table_name: str, column_name: str, column_sql: str, *, is_sqlite: bool) -> None:
    column_exists = (
        _sqlite_column_exists(connection, table_name, column_name)
        if is_sqlite
        else _postgres_column_exists(connection, table_name, column_name)
    )
    if not column_exists:
        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}"
        )


def _ensure_runtime_domain_schema(connection, *, is_sqlite: bool) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS vacation_balances (
            employee_id TEXT PRIMARY KEY,
            employee_name TEXT NOT NULL,
            base_days REAL NOT NULL DEFAULT 0,
            carryover_days REAL NOT NULL DEFAULT 0,
            extra_days REAL NOT NULL DEFAULT 0
        )
        """
    )
    connection.execute(
        """
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
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS planning_assignments (
            id TEXT PRIMARY KEY,
            assignment_date TEXT NOT NULL,
            employee_id TEXT,
            employee_name TEXT NOT NULL,
            contract_id TEXT,
            contract_name TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT ''
        )
        """
    )
    _ensure_column(connection, "vacation_balances", "employee_key", "TEXT NOT NULL DEFAULT ''", is_sqlite=is_sqlite)
    _ensure_column(connection, "vacation_requests", "employee_key", "TEXT NOT NULL DEFAULT ''", is_sqlite=is_sqlite)
    _ensure_column(connection, "planning_assignments", "employee_key", "TEXT NOT NULL DEFAULT ''", is_sqlite=is_sqlite)
    _ensure_column(connection, "planning_assignments", "assignment_key", "TEXT NOT NULL DEFAULT ''", is_sqlite=is_sqlite)
    connection.execute(
        "CREATE INDEX IF NOT EXISTS planning_assignments_date_key_idx ON planning_assignments(assignment_date, assignment_key)"
    )
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS work_cards (
            id TEXT PRIMARY KEY,
            employee_id TEXT NOT NULL DEFAULT '',
            employee_name TEXT NOT NULL,
            month_key TEXT NOT NULL,
            month_label TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL,
            rows_json TEXT NOT NULL DEFAULT '[]'
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS work_cards_month_employee_idx ON work_cards(month_key, employee_id, employee_name)"
    )


def _ensure_settings_workflow_schema(connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS settings_workflow (
            id TEXT PRIMARY KEY,
            vacation_approval_mode TEXT NOT NULL DEFAULT 'permission',
            vacation_notifications TEXT NOT NULL DEFAULT 'on',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp)"
    )


def _ensure_contract_control_schema(connection) -> None:
    connection.execute(
        """
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
        )
        """
    )
    connection.execute(
        "CREATE INDEX IF NOT EXISTS contract_controls_updated_at_idx ON contract_controls(updated_at)"
    )


def _ensure_sqlite_database(settings: Settings) -> None:
    if settings.allow_demo_seed_import and settings.database_seed_path and settings.database_seed_path.exists() and not settings.sqlite_path.exists():
        settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(settings.database_seed_path, settings.sqlite_path)

    connection = connect(settings)
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL
            )
            """
        )
        applied_versions = {
            row["version"] for row in connection.execute("SELECT version FROM schema_migrations")
        }
        for migration_path in _sqlite_migration_files(settings):
            if migration_path.name in applied_versions:
                continue
            sql = migration_path.read_text(encoding="utf-8")
            connection.executescript(sql)
            connection.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP)",
                (migration_path.name,),
            )
        _ensure_employee_worker_code_schema(connection, is_sqlite=True)
        _ensure_workwear_issue_employee_key_schema(connection, is_sqlite=True)
        _ensure_runtime_domain_schema(connection, is_sqlite=True)
        _ensure_settings_workflow_schema(connection)
        _ensure_contract_control_schema(connection)
        connection.commit()
    finally:
        connection.close()


def _seed_source_tables() -> list[str]:
    return [
        "store_documents",
        "contracts",
        "employees",
        "workwear_catalog",
        "users",
        "hours_months",
        "vacation_balances",
        "invoices",
        "vacation_requests",
        "planning_assignments",
        "workwear_issues",
        "audit_logs",
        "notifications",
        "time_entries",
    ]


def _seed_missing_legacy_users(source: sqlite3.Connection, target) -> None:
    source_user_ids = {
        str(row[0] or "").strip()
        for row in source.execute("SELECT id FROM users").fetchall()
        if str(row[0] or "").strip()
    }
    referenced_user_ids: set[str] = set()
    for table_name, column_name in (
        ("invoices", "created_by"),
        ("invoices", "updated_by"),
        ("auth_sessions", "user_id"),
    ):
        rows = source.execute(f"SELECT DISTINCT {column_name} FROM {table_name}").fetchall()
        referenced_user_ids.update(
            str(row[0] or "").strip()
            for row in rows
            if str(row[0] or "").strip()
        )

    missing_user_ids = sorted(referenced_user_ids - source_user_ids)
    for user_id in missing_user_ids:
        username_suffix = user_id.removeprefix("user-")[:12] or "legacy"
        target.execute(
            """
            INSERT INTO users (
                id,
                name,
                username,
                email,
                password_hash,
                role,
                status,
                permissions_json,
                can_approve_vacations,
                is_active,
                created_at,
                updated_at,
                last_login_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP::text, CURRENT_TIMESTAMP::text, NULL)
            ON CONFLICT (id) DO NOTHING
            """,
            (
                user_id,
                "Demo Admin",
                f"legacy.{username_suffix}",
                "",
                "",
                "admin",
                "active",
                "{}",
                1,
                1,
            ),
        )


def _import_sqlite_seed_into_postgres(settings: Settings) -> None:
    if not settings.allow_demo_seed_import:
        return
    if not settings.database_seed_path or not settings.database_seed_path.exists():
        return

    target = connect(settings)
    try:
        if _table_count(target, "users") or _table_count(target, "contracts") or _table_count(target, "store_documents"):
            return

        source = sqlite3.connect(str(settings.database_seed_path))
        source.row_factory = sqlite3.Row
        try:
            _seed_missing_legacy_users(source, target)
            for table_name in _seed_source_tables():
                source_rows = source.execute(f"SELECT * FROM {table_name}").fetchall()
                if not source_rows:
                    continue
                columns = list(source_rows[0].keys())
                column_sql = ", ".join(columns)
                placeholder_sql = ", ".join("?" for _ in columns)
                for row in source_rows:
                    values = tuple(row[column] for column in columns)
                    target.execute(
                        f"INSERT INTO {table_name} ({column_sql}) VALUES ({placeholder_sql})",
                        values,
                    )
            target.commit()
        finally:
            source.close()
    finally:
        target.close()


def _ensure_postgres_database(settings: Settings) -> None:
    connection = connect(settings)
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version TEXT PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP::text
            )
            """
        )
        schema_version = "postgresql.sql"
        existing = connection.execute(
            "SELECT version FROM schema_migrations WHERE version = ?",
            (schema_version,),
        ).fetchone()
        if not existing:
            schema_sql = _postgres_schema_file(settings).read_text(encoding="utf-8")
            connection.executescript(schema_sql)
            connection.execute(
                "INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP::text)",
                (schema_version,),
            )
        _ensure_employee_worker_code_schema(connection, is_sqlite=False)
        _ensure_workwear_issue_employee_key_schema(connection, is_sqlite=False)
        _ensure_runtime_domain_schema(connection, is_sqlite=False)
        _ensure_settings_workflow_schema(connection)
        _ensure_contract_control_schema(connection)
        connection.commit()
    finally:
        connection.close()

    _import_sqlite_seed_into_postgres(settings)


def ensure_database(settings: Settings) -> None:
    if settings.is_sqlite:
        _ensure_sqlite_database(settings)
        return
    if settings.is_postgres:
        _ensure_postgres_database(settings)
        return
    raise RuntimeError("Unsupported database configuration.")
