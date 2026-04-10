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
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.repositories.time_entry_repository import TimeEntryRepository  # noqa: E402
from clode_backend.services.time_entry_service import TimeEntryService, TimeEntryServiceError  # noqa: E402


class TimeEntriesBackendFirstTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-time-entries-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.contract_repository = ContractRepository(self.settings)
        self.repository = TimeEntryRepository(self.settings)
        self.service = TimeEntryService(self.repository, self.contract_repository)
        self.current_user = {"id": "user-manager", "role": "kierownik"}
        self._seed_data()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def _seed_data(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO users
                (id, name, username, email, password_hash, role, status, permissions_json, can_approve_vacations, is_active, created_at, updated_at, last_login_at)
                VALUES
                ('user-manager', 'Kierownik', 'manager', 'manager@example.com', 'hash', 'kierownik', 'active', '{}', 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
                """
            )
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-active', '001', 'Kontrakt Aktywny', 'Inwestor A', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-archived', '002', 'Kontrakt Archiwalny', 'Inwestor B', '2026-01-02', '', 2000, 'archived', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO employees
                (id, name, first_name, last_name, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('e-1', 'Nowak Jan', 'Jan', 'Nowak', '', 'active', '', '', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT INTO hours_months
                (id, month_key, month_label, selected, visible_investments_json, finance_json)
                VALUES
                ('hm-2026-03', '2026-03', 'marzec 2026', 1, '["Kontrakt Aktywny", "Kontrakt Archiwalny"]', '{"payouts": 1000, "zus_company_1": 100}')
                """
            )
            connection.commit()

    def test_create_update_delete_time_entry_and_aggregate(self) -> None:
        created = self.service.create_time_entry(
            {
                "month_key": "2026-03",
                "employee_id": "e-1",
                "employee_name": "Nowak Jan",
                "contract_id": "c-active",
                "hours": 10,
            },
            self.current_user,
        )
        self.assertEqual(created["contract_id"], "c-active")

        updated = self.service.update_time_entry(
            created["id"],
            {
                "month_key": "2026-03",
                "employee_id": "e-1",
                "employee_name": "Nowak Jan",
                "contract_id": "c-active",
                "hours": 12,
            },
            self.current_user,
        )
        self.assertEqual(updated["hours"], 12.0)

        listing = self.service.list_time_entries({"month": "2026-03", "contract_id": "c-active"}, self.current_user)
        self.assertEqual(len(listing["entries"]), 1)
        self.assertEqual(round(listing["aggregates"]["per_contract"][0]["hours_total"], 2), 12.0)

        self.service.delete_time_entry(created["id"], self.current_user)
        listing_after_delete = self.service.list_time_entries({"month": "2026-03", "contract_id": "c-active"}, self.current_user)
        self.assertEqual(len(listing_after_delete["entries"]), 0)

    def test_missing_contract_id_stays_unassigned(self) -> None:
        created = self.service.create_time_entry(
            {
                "month_key": "2026-03",
                "employee_name": "Nowak Jan",
                "hours": 8,
            },
            self.current_user,
        )
        self.assertEqual(created["contract_id"], "")
        self.assertEqual(created["contract_name"], "Nieprzypisane")

        listing = self.service.list_time_entries({"month": "2026-03", "contract_id": "unassigned"}, self.current_user)
        self.assertEqual(len(listing["entries"]), 1)
        self.assertEqual(listing["aggregates"]["per_contract"][0]["hours_total"], 8.0)

    def test_invalid_contract_id_raises_error(self) -> None:
        with self.assertRaises(TimeEntryServiceError):
            self.service.create_time_entry(
                {
                    "month_key": "2026-03",
                    "employee_name": "Nowak Jan",
                    "contract_id": "missing-contract",
                    "hours": 5,
                },
                self.current_user,
            )

    def test_archived_contract_id_is_rejected_for_new_entries(self) -> None:
        with self.assertRaises(TimeEntryServiceError):
            self.service.create_time_entry(
                {
                    "month_key": "2026-03",
                    "employee_name": "Nowak Jan",
                    "contract_id": "c-archived",
                    "hours": 5,
                },
                self.current_user,
            )

    def test_archived_contract_id_is_rejected_on_update(self) -> None:
        created = self.service.create_time_entry(
            {
                "month_key": "2026-03",
                "employee_name": "Nowak Jan",
                "contract_id": "c-active",
                "hours": 5,
            },
            self.current_user,
        )

        with self.assertRaises(TimeEntryServiceError):
            self.service.update_time_entry(
                created["id"],
                {
                    "month_key": "2026-03",
                    "employee_name": "Nowak Jan",
                    "contract_id": "c-archived",
                    "hours": 6,
                },
                self.current_user,
            )

    def test_user_filter_returns_matching_entries(self) -> None:
        self.service.create_time_entry(
            {
                "month_key": "2026-03",
                "employee_id": "e-1",
                "employee_name": "Nowak Jan",
                "contract_id": "c-active",
                "hours": 7,
            },
            self.current_user,
        )
        self.service.create_time_entry(
            {
                "month_key": "2026-03",
                "employee_name": "Kowalski Adam",
                "hours": 5,
            },
            self.current_user,
        )

        by_user_id = self.service.list_time_entries({"month": "2026-03", "user": "e-1"}, self.current_user)
        self.assertEqual(len(by_user_id["entries"]), 1)
        self.assertEqual(by_user_id["entries"][0]["employee_name"], "Nowak Jan")

        by_user_name = self.service.list_time_entries({"month": "2026-03", "user": "Kowalski Adam"}, self.current_user)
        self.assertEqual(len(by_user_name["entries"]), 1)
        self.assertEqual(by_user_name["entries"][0]["contract_id"], "")

    def test_legacy_month_visibility_is_materialized_only_to_ids(self) -> None:
        listing = self.service.list_time_entries({"month": "2026-03"}, self.current_user)
        month = next(item for item in listing["months"] if item["month_key"] == "2026-03")
        self.assertEqual(month["visible_investments"], ["c-active", "c-archived"])

    def test_archived_contract_is_filtered_from_operational_month_but_history_can_stay(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-archived-history', 'hm-2026-03', 'e-1', 'Nowak Jan', 'c-archived', 'Kontrakt Archiwalny', 6, 0)
                """
            )
            connection.commit()

        updated_month = self.service.update_month(
            "2026-03",
            {
                "visible_investments": ["c-active", "c-archived"],
            },
            self.current_user,
        )
        self.assertEqual(updated_month["visible_investments"], ["c-active"])

        listing = self.service.list_time_entries({"month": "2026-03"}, self.current_user)
        archived_entries = [item for item in listing["entries"] if item["contract_id"] == "c-archived"]
        self.assertEqual(len(archived_entries), 1)


if __name__ == "__main__":
    unittest.main()

