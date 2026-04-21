from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.app import create_runtime_context, run_runtime_maintenance  # noqa: E402
from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.employee_repository import EmployeeRepository  # noqa: E402
from clode_backend.repositories.settings_repository import SettingsRepository  # noqa: E402
from clode_backend.repositories.store_repository import StoreRepository  # noqa: E402
from clode_backend.repositories.time_entry_repository import TimeEntryRepository  # noqa: E402
from clode_backend.repositories.workwear_repository import WorkwearRepository  # noqa: E402


class RuntimeStartupCleanTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-runtime-clean-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.store_repository = StoreRepository(self.settings)

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def test_create_runtime_context_does_not_import_or_purge_legacy_payloads(self) -> None:
        self.store_repository.save(
            "employees",
            [
                {
                    "id": "emp-legacy",
                    "name": "Jan Nowak",
                    "first_name": "Jan",
                    "last_name": "Nowak",
                    "position": "Monter",
                    "status": "active",
                    "employment_date": "2026-01-10",
                    "employment_end_date": "",
                    "street": "",
                    "city": "",
                    "phone": "",
                    "medical_exam_valid_until": "",
                    "worker_code": "WK-1",
                }
            ],
        )
        self.store_repository.save(
            "settings",
            {
                "workflow": {
                    "vacationApprovalMode": "admin",
                    "vacationNotifications": "off",
                }
            },
        )
        self.store_repository.save(
            "audit_logs",
            [
                {
                    "id": "audit-legacy-1",
                    "timestamp": "2026-04-21T09:00:00Z",
                    "module": "settings",
                    "action": "legacy.import",
                    "subject": "workflow",
                    "details": "legacy",
                    "user_id": "user-1",
                    "user_name": "Admin",
                }
            ],
        )
        self.store_repository.save(
            "workwear_catalog",
            [
                {
                    "id": "catalog-1",
                    "name": "Bluza",
                    "category": "Odziez",
                    "notes": "",
                }
            ],
        )

        runtime = create_runtime_context()
        employee_repository = EmployeeRepository(runtime["settings"])
        settings_repository = SettingsRepository(runtime["settings"])
        workwear_repository = WorkwearRepository(runtime["settings"])

        self.assertEqual(employee_repository.list_all(), [])
        self.assertIsNone(settings_repository.get_workflow())
        self.assertEqual(settings_repository.list_audit_logs(), [])
        self.assertEqual(workwear_repository.list_catalog(), [])
        self.assertIsNotNone(self.store_repository.get("employees"))
        self.assertIsNotNone(self.store_repository.get("settings"))
        self.assertIsNotNone(self.store_repository.get("audit_logs"))
        self.assertIsNotNone(self.store_repository.get("workwear_catalog"))

        report = run_runtime_maintenance(
            runtime["services"],
            import_legacy_employees=True,
            import_legacy_settings=True,
            import_legacy_workwear=True,
            purge_imported_legacy=True,
        )

        self.assertEqual(report["legacy_employees_imported"], 1)
        self.assertEqual(report["legacy_settings_import"]["workflow_imported"], 1)
        self.assertEqual(report["legacy_settings_import"]["audit_logs_imported"], 1)
        self.assertEqual(report["legacy_workwear_import"]["catalog_imported"], 1)
        self.assertEqual(employee_repository.list_all()[0]["id"], "emp-legacy")
        self.assertEqual(settings_repository.get_workflow()["vacationApprovalMode"], "admin")
        self.assertEqual(settings_repository.list_audit_logs()[0]["id"], "audit-legacy-1")
        self.assertEqual(workwear_repository.list_catalog()[0]["id"], "catalog-1")
        self.assertIsNone(self.store_repository.get("employees"))
        self.assertIsNone(self.store_repository.get("audit_logs"))
        self.assertIsNone(self.store_repository.get("workwear_catalog"))
        self.assertIsNone(self.store_repository.get("settings"))

    def test_create_runtime_context_does_not_repair_time_entries_until_requested(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-1', '001', 'Kontrakt 1', 'Inwestor', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO hours_months
                (id, month_key, month_label, selected, visible_investments_json, finance_json)
                VALUES
                ('hm-2026-03', '2026-03', 'marzec 2026', 1, '["Kontrakt 1"]', '{}')
                """
            )
            connection.commit()

        runtime = create_runtime_context()
        repository = TimeEntryRepository(runtime["settings"])

        self.assertEqual(
            repository.get_month_by_key("2026-03")["visible_investments"],
            ["Kontrakt 1"],
        )

        report = run_runtime_maintenance(runtime["services"], repair_time_entries=True)

        self.assertEqual(report["time_entry_repair"]["month_visibility_rows"], 1)
        self.assertEqual(
            repository.get_month_by_key("2026-03")["visible_investments"],
            ["c-1"],
        )


if __name__ == "__main__":
    unittest.main()
