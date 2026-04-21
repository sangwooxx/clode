from __future__ import annotations

import os
import sqlite3
import sys
import unittest
from pathlib import Path
from uuid import uuid4


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402


class BootstrapLegacySchemaTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-bootstrap-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"

        connection = sqlite3.connect(self.test_db_path)
        try:
            connection.executescript(
                """
                CREATE TABLE schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );

                CREATE TABLE employees (
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

                CREATE TABLE workwear_issues (
                    id TEXT PRIMARY KEY,
                    employee_id TEXT,
                    employee_name TEXT NOT NULL,
                    issue_date TEXT NOT NULL,
                    item_id TEXT,
                    item_name TEXT NOT NULL DEFAULT '',
                    size TEXT NOT NULL DEFAULT '',
                    quantity REAL NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE audit_logs (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    module TEXT NOT NULL,
                    action TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    details TEXT NOT NULL DEFAULT '',
                    user_id TEXT NOT NULL,
                    user_name TEXT NOT NULL
                );
                """
            )
            for version in (
                "001_initial.sql",
                "002_auth_sessions.sql",
                "003_invoice_module.sql",
                "004_contract_dashboard_logic.sql",
                "005_time_entries_backend_first.sql",
            ):
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, CURRENT_TIMESTAMP)",
                    (version,),
                )
            connection.commit()
        finally:
            connection.close()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def test_ensure_database_upgrades_legacy_sqlite_schema(self) -> None:
        settings = load_settings()
        ensure_database(settings)

        connection = sqlite3.connect(self.test_db_path)
        try:
            employee_columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(employees)").fetchall()
            }
            workwear_issue_columns = {
                row[1]
                for row in connection.execute("PRAGMA table_info(workwear_issues)").fetchall()
            }
            indexes = {
                row[1]
                for row in connection.execute("PRAGMA index_list(employees)").fetchall()
            }
            settings_workflow_table = connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'settings_workflow'"
            ).fetchone()
        finally:
            connection.close()

        self.assertIn("worker_code", employee_columns)
        self.assertIn("employee_key", workwear_issue_columns)
        self.assertIn("employees_worker_code_idx", indexes)
        self.assertIsNotNone(settings_workflow_table)


if __name__ == "__main__":
    unittest.main()
