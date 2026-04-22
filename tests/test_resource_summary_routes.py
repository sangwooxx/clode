from __future__ import annotations

import io
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

from clode_backend.api.context import ApiServices  # noqa: E402
from clode_backend.api.routes import route_request  # noqa: E402
from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.repositories.employee_repository import EmployeeRepository  # noqa: E402
from clode_backend.repositories.invoice_repository import InvoiceRepository  # noqa: E402
from clode_backend.repositories.session_repository import SessionRepository  # noqa: E402
from clode_backend.repositories.settings_repository import SettingsRepository  # noqa: E402
from clode_backend.repositories.store_repository import StoreRepository  # noqa: E402
from clode_backend.repositories.time_entry_repository import TimeEntryRepository  # noqa: E402
from clode_backend.repositories.user_repository import UserRepository  # noqa: E402
from clode_backend.repositories.workwear_repository import WorkwearRepository  # noqa: E402
from clode_backend.services.auth_service import AuthService  # noqa: E402
from clode_backend.services.contract_service import ContractService  # noqa: E402
from clode_backend.services.employee_service import EmployeeService  # noqa: E402
from clode_backend.services.invoice_service import InvoiceService  # noqa: E402
from clode_backend.services.settings_service import SettingsService  # noqa: E402
from clode_backend.services.store_service import StoreService  # noqa: E402
from clode_backend.services.time_entry_service import TimeEntryService  # noqa: E402
from clode_backend.services.user_service import UserService  # noqa: E402
from clode_backend.services.workwear_service import WorkwearService  # noqa: E402


class _FakeHandler:
    def __init__(
        self,
        *,
        method: str,
        path: str,
        body: bytes = b"",
        headers: dict[str, str] | None = None,
    ) -> None:
        self.command = method
        self.path = path
        self.headers = dict(headers or {})
        self.headers.setdefault("Content-Length", str(len(body)))
        self.rfile = io.BytesIO(body)


class ResourceSummaryRoutesTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = (
            PROJECT_DIR / "backend" / "var" / f"clode-test-resource-summary-{uuid4().hex}.db"
        )
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)

        store_repository = StoreRepository(self.settings)
        user_repository = UserRepository(self.settings)
        session_repository = SessionRepository(self.settings)
        contract_repository = ContractRepository(self.settings)
        time_entry_repository = TimeEntryRepository(self.settings)

        self.store_service = StoreService(store_repository)
        self.user_service = UserService(user_repository, store_repository)
        self.auth_service = AuthService(
            user_repository,
            session_repository,
            self.settings.session_ttl_hours,
            secure_cookies=self.settings.secure_cookies,
        )
        self.invoice_service = InvoiceService(InvoiceRepository(self.settings), contract_repository)
        self.contract_service = ContractService(
            contract_repository,
            ContractMetricsRepository(self.settings),
            time_entry_repository,
        )
        self.employee_service = EmployeeService(
            EmployeeRepository(self.settings),
            time_entry_repository,
            store_repository,
        )
        self.time_entry_service = TimeEntryService(
            time_entry_repository,
            contract_repository,
            EmployeeRepository(self.settings),
        )
        self.settings_service = SettingsService(SettingsRepository(self.settings), store_repository)
        self.workwear_service = WorkwearService(WorkwearRepository(self.settings), store_repository)
        self.services = ApiServices(
            store_service=self.store_service,
            auth_service=self.auth_service,
            user_service=self.user_service,
            invoice_service=self.invoice_service,
            contract_service=self.contract_service,
            employee_service=self.employee_service,
            time_entry_service=self.time_entry_service,
            settings_service=self.settings_service,
            workwear_service=self.workwear_service,
        )

        self.user_service.create_or_update_user(
            {
                "id": "user-admin",
                "name": "Admin ERP",
                "username": "admin",
                "email": "admin@example.com",
                "password": "admin",
                "role": "admin",
                "status": "active",
                "canApproveVacations": True,
            }
        )
        self.session_token = self.auth_service.login("admin", "admin")["token"]
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
                INSERT INTO employees
                (id, name, first_name, last_name, worker_code, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('emp-1', 'Nowak Jan', 'Jan', 'Nowak', 'WK-1', 'Brygadzista', 'active', '2026-01-10', '', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-1', '001', 'Kontrakt 1', 'Inwestor A', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO hours_months
                (id, month_key, month_label, selected, visible_investments_json, finance_json)
                VALUES
                ('hm-2026-04', '2026-04', 'kwiecien 2026', 1, '["c-1"]', '{}')
                """
            )
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-1', 'hm-2026-04', 'emp-1', 'Nowak Jan', 'c-1', 'Kontrakt 1', 8, 320)
                """
            )
            connection.commit()

        self.store_service.save_store(
            "work_cards",
            {
                "version": 1,
                "cards": [
                    {
                        "id": "wc-1",
                        "employee_id": "emp-1",
                        "employee_name": "Nowak Jan",
                        "month_key": "2026-04",
                        "month_label": "kwiecien 2026",
                        "updated_at": "2026-04-20T10:00:00Z",
                        "rows": [
                            {
                                "date": "2026-04-20",
                                "note": "",
                                "entries": [
                                    {
                                        "id": "wce-1",
                                        "contract_id": "c-1",
                                        "contract_name": "Kontrakt 1",
                                        "hours": 8,
                                    }
                                ],
                            }
                        ],
                    }
                ],
            },
        )

    def _route(self, *, method: str, path: str):
        handler = _FakeHandler(
            method=method,
            path=path,
            headers={"Cookie": f"clode_session={self.session_token}"},
        )
        return route_request(handler, self.services)

    def test_employees_summary_route_returns_lightweight_relation_payload(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO employees
                (id, name, first_name, last_name, worker_code, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('emp-2', 'Kowalski Adam', 'Adam', 'Kowalski', 'WK-2', 'Monter', 'inactive', '2026-01-15', '2026-04-01', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-2', 'hm-2026-04', 'emp-2', 'Kowalski Adam', 'c-1', 'Kontrakt 1', 4, 160)
                """
            )
            connection.commit()

        self.store_service.save_store(
            "work_cards",
            {
                "version": 1,
                "cards": [
                    {
                        "id": "wc-1",
                        "employee_id": "emp-1",
                        "employee_name": "Nowak Jan",
                        "month_key": "2026-04",
                        "month_label": "kwiecien 2026",
                        "updated_at": "2026-04-20T10:00:00Z",
                        "rows": [
                            {
                                "date": "2026-04-20",
                                "note": "",
                                "entries": [
                                    {
                                        "id": "wce-1",
                                        "contract_id": "c-1",
                                        "contract_name": "Kontrakt 1",
                                        "hours": 8,
                                    }
                                ],
                            }
                        ],
                    },
                    {
                        "id": "wc-2",
                        "employee_id": "emp-2",
                        "employee_name": "Kowalski Adam",
                        "month_key": "2026-04",
                        "month_label": "kwiecien 2026",
                        "updated_at": "2026-04-20T11:00:00Z",
                        "rows": [
                            {
                                "date": "2026-04-19",
                                "note": "",
                                "entries": [
                                    {
                                        "id": "wce-2",
                                        "contract_id": "c-1",
                                        "contract_name": "Kontrakt 1",
                                        "hours": 4,
                                    }
                                ],
                            }
                        ],
                    },
                    {
                        "id": "wc-legacy",
                        "employee_id": "ghost-emp",
                        "employee_name": "Kowalski Adam",
                        "month_key": "2026-04",
                        "month_label": "kwiecien 2026",
                        "updated_at": "2026-04-20T12:30:00Z",
                        "rows": [],
                    },
                    {
                        "id": "wc-legacy-empty",
                        "employee_id": "",
                        "employee_name": "Legacy Worker",
                        "month_key": "2026-04",
                        "month_label": "kwiecien 2026",
                        "updated_at": "2026-04-20T12:00:00Z",
                        "rows": [],
                    },
                ],
            },
        )

        status, payload, _ = self._route(method="GET", path="/api/v1/employees/summary")

        self.assertEqual(status, 200)
        employees_by_id = {
            employee["id"]: employee
            for employee in payload["employees"]
            if employee.get("id")
        }
        self.assertEqual(employees_by_id["emp-1"]["status"], "active")
        self.assertEqual(employees_by_id["emp-2"]["status"], "inactive")
        operational_by_id = {
            employee.get("id"): employee
            for employee in payload["operational_employees"]
            if employee.get("id")
        }
        self.assertEqual(operational_by_id["emp-1"]["status"], "active")
        self.assertEqual(operational_by_id["emp-2"]["status"], "inactive")
        self.assertEqual(operational_by_id["ghost-emp"]["status"], "inactive")
        legacy_employee = next(
            employee
            for employee in payload["operational_employees"]
            if employee.get("name") == "Legacy Worker"
        )
        self.assertEqual(legacy_employee["status"], "inactive")
        relation_by_id = {
            summary.get("employee_id"): summary
            for summary in payload["relation_summaries"]
            if summary.get("employee_id")
        }
        self.assertEqual(relation_by_id["emp-1"]["hours_entries"], 1)
        self.assertEqual(relation_by_id["emp-1"]["work_cards"], 1)
        self.assertEqual(relation_by_id["emp-2"]["hours_entries"], 1)
        self.assertEqual(relation_by_id["emp-2"]["work_cards"], 1)
        self.assertNotIn("timeEntries", payload)
        self.assertNotIn("workCardStore", payload)

    def test_time_entries_bootstrap_route_returns_only_month_context(self) -> None:
        status, payload, _ = self._route(method="GET", path="/api/v1/time-entries/bootstrap")

        self.assertEqual(status, 200)
        self.assertEqual(payload["selected_month_key"], "2026-04")
        self.assertEqual(payload["months"][0]["month_key"], "2026-04")
        self.assertNotIn("entries", payload)
        self.assertNotIn("aggregates", payload)

    def test_contract_snapshot_route_returns_backend_first_payload(self) -> None:
        status, payload, _ = self._route(method="GET", path="/api/v1/contracts/c-1/snapshot")

        self.assertEqual(status, 200)
        self.assertEqual(payload["contract"]["id"], "c-1")
        self.assertEqual(payload["contract"]["status"], "active")
        self.assertEqual(payload["metrics"]["labor_hours_total"], 8.0)
        self.assertEqual(payload["metrics"]["labor_cost_total"], 320.0)
        self.assertEqual(payload["activity"]["invoice_count"], 0)
        self.assertEqual(payload["activity"]["time_entry_count"], 1)
        self.assertEqual(payload["activity"]["planning_assignment_count"], 0)
        self.assertFalse(payload["activity"]["has_financial_data"])
        self.assertTrue(payload["activity"]["has_operational_data"])
        self.assertTrue(payload["activity"]["has_data"])
        self.assertEqual(payload["monthly_breakdown"][0]["month_key"], "2026-04")


if __name__ == "__main__":
    unittest.main()
