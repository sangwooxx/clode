from __future__ import annotations

import sqlite3

from clode_backend.config import Settings


def connect(settings: Settings) -> sqlite3.Connection:
    if not settings.database_url.startswith("sqlite:///"):
        raise RuntimeError(
            "This Stage 2 backend runs with SQLite for now. PostgreSQL is the target production database in Stage 3."
        )

    db_path = settings.sqlite_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection

