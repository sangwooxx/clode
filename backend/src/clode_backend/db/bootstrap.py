from __future__ import annotations

from pathlib import Path

from clode_backend.config import Settings
from clode_backend.db.connection import connect


def _migration_files(settings: Settings) -> list[Path]:
    migration_dir = settings.project_root / "backend" / "migrations"
    return sorted(migration_dir.glob("*.sql"))


def ensure_database(settings: Settings) -> None:
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
        for migration_path in _migration_files(settings):
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

