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

from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.employee_repository import EmployeeRepository  # noqa: E402
from clode_backend.repositories.store_repository import StoreRepository  # noqa: E402
from clode_backend.repositories.time_entry_repository import TimeEntryRepository  # noqa: E402
from clode_backend.services.employee_service import EmployeeService, EmployeeServiceError  # noqa: E402


class EmployeeRoundTripTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-employee-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.repository = EmployeeRepository(self.settings)
        self.service = EmployeeService(
            self.repository,
            TimeEntryRepository(self.settings),
            StoreRepository(self.settings),
        )
        self.current_user = {"id": "user-admin", "role": "admin"}

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def test_legacy_employee_without_name_parts_round_trips_without_losing_worker_code(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO employees (
                    id,
                    name,
                    first_name,
                    last_name,
                    worker_code,
                    position,
                    status,
                    employment_date,
                    employment_end_date,
                    street,
                    city,
                    phone,
                    medical_exam_valid_until
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "emp-legacy",
                    "Nowak Jan",
                    "",
                    "",
                    "WK-77",
                    "Brygadzista",
                    "active",
                    "2026-01-10",
                    "",
                    "",
                    "",
                    "",
                    "",
                ),
            )
            connection.commit()

        employees = self.service.list_employees(self.current_user)
        employee = next(item for item in employees if item["id"] == "emp-legacy")
        self.assertEqual(employee["first_name"], "Jan")
        self.assertEqual(employee["last_name"], "Nowak")
        self.assertEqual(employee["worker_code"], "WK-77")

        updated = self.service.update_employee(
            "emp-legacy",
            {
                "position": "Kierownik brygady",
                "employment_end_date": "2026-12-31",
            },
            self.current_user,
        )
        self.assertEqual(updated["first_name"], "Jan")
        self.assertEqual(updated["last_name"], "Nowak")
        self.assertEqual(updated["worker_code"], "WK-77")
        self.assertEqual(updated["position"], "Kierownik brygady")
        self.assertEqual(updated["employment_end_date"], "2026-12-31")

    def test_employment_dates_are_validated(self) -> None:
        with self.assertRaises(EmployeeServiceError):
            self.service.create_employee(
                {
                    "first_name": "Jan",
                    "last_name": "Nowak",
                    "employment_date": "2026-12-31",
                    "employment_end_date": "2026-01-01",
                },
                self.current_user,
            )


if __name__ == "__main__":
    unittest.main()
