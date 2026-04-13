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


def _ensure_sqlite_database(settings: Settings) -> None:
    if settings.database_seed_path and settings.database_seed_path.exists() and not settings.sqlite_path.exists():
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
