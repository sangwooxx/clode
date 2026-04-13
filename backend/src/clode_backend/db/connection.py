from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import ssl
import sqlite3
from typing import Any, Iterable
from urllib.parse import parse_qs, unquote, urlparse

from clode_backend.config import Settings


def _translate_placeholders(sql: str) -> str:
    result: list[str] = []
    in_single = False
    in_double = False
    index = 0
    while index < len(sql):
        char = sql[index]
        if char == "'" and not in_double:
            in_single = not in_single
            result.append(char)
        elif char == '"' and not in_single:
            in_double = not in_double
            result.append(char)
        elif char == "?" and not in_single and not in_double:
            result.append("%s")
        else:
            result.append(char)
        index += 1
    return "".join(result)


def _split_sql_script(script: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    in_single = False
    in_double = False

    for char in script:
        if char == "'" and not in_double:
            in_single = not in_single
        elif char == '"' and not in_single:
            in_double = not in_double
        if char == ";" and not in_single and not in_double:
            statement = "".join(current).strip()
            if statement:
                statements.append(statement)
            current = []
            continue
        current.append(char)

    tail = "".join(current).strip()
    if tail:
        statements.append(tail)
    return statements


@dataclass
class CursorWrapper:
    cursor: Any
    driver: str

    def _normalize_row(self, row: Any) -> Any:
        if row is None:
            return None
        if self.driver == "sqlite":
            return row
        if isinstance(row, dict):
            return row
        columns = [column[0] for column in (self.cursor.description or [])]
        return {column: value for column, value in zip(columns, row)}

    def fetchone(self) -> Any:
        return self._normalize_row(self.cursor.fetchone())

    def fetchall(self) -> list[Any]:
        return [self._normalize_row(row) for row in self.cursor.fetchall()]

    def __iter__(self):
        if self.driver == "sqlite":
            return iter(self.cursor)
        return iter(self.fetchall())

    @property
    def rowcount(self) -> int:
        return int(getattr(self.cursor, "rowcount", 0) or 0)


class ConnectionWrapper:
    def __init__(self, raw_connection: Any, *, driver: str) -> None:
        self.raw_connection = raw_connection
        self.driver = driver

    def execute(self, sql: str, params: Iterable[Any] = ()) -> CursorWrapper:
        cursor = self.raw_connection.cursor() if self.driver == "postgres" else self.raw_connection.execute(sql, tuple(params))
        if self.driver == "postgres":
            cursor.execute(_translate_placeholders(sql), tuple(params))
        return CursorWrapper(cursor, self.driver)

    def executescript(self, sql: str) -> None:
        if self.driver == "postgres":
            cursor = self.raw_connection.cursor()
            for statement in _split_sql_script(sql):
                cursor.execute(statement)
            return
        self.raw_connection.executescript(sql)

    def commit(self) -> None:
        self.raw_connection.commit()

    def rollback(self) -> None:
        try:
            self.raw_connection.rollback()
        except Exception:
            return

    def close(self) -> None:
        self.raw_connection.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if exc_type:
            self.rollback()
        self.close()


def _connect_sqlite(settings: Settings) -> ConnectionWrapper:
    db_path = settings.sqlite_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(db_path))
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return ConnectionWrapper(connection, driver="sqlite")


def _postgres_connect_kwargs(database_url: str) -> dict[str, Any]:
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query or "", keep_blank_values=True)
    database_name = (parsed.path or "").lstrip("/")
    kwargs: dict[str, Any] = {
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "host": parsed.hostname or "localhost",
        "port": int(parsed.port or 5432),
        "database": unquote(database_name),
        "timeout": 15,
    }
    ssl_mode = str((query.get("sslmode") or [""])[0] or "").strip().lower()
    if ssl_mode in {"require", "verify-ca", "verify-full"}:
        kwargs["ssl_context"] = ssl.create_default_context()
    return kwargs


def _connect_postgres(settings: Settings) -> ConnectionWrapper:
    import pg8000.dbapi

    connection = pg8000.dbapi.connect(**_postgres_connect_kwargs(settings.database_url))
    return ConnectionWrapper(connection, driver="postgres")


def connect(settings: Settings) -> ConnectionWrapper:
    if settings.is_sqlite:
        return _connect_sqlite(settings)
    if settings.is_postgres:
        return _connect_postgres(settings)
    raise RuntimeError(
        "Unsupported database driver. Use sqlite:///... locally or postgresql://... for Vercel/production."
    )
