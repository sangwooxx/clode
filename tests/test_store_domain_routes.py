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

from clode_backend.api.routes import route_request  # noqa: E402
from clode_backend.api.context import ApiServices  # noqa: E402
from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.repositories.employee_repository import EmployeeRepository  # noqa: E402
from clode_backend.repositories.invoice_repository import InvoiceRepository  # noqa: E402
from clode_backend.repositories.settings_repository import SettingsRepository  # noqa: E402
from clode_backend.repositories.session_repository import SessionRepository  # noqa: E402
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


class StoreDomainRoutesTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-store-routes-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)

        store_repository = StoreRepository(self.settings)
        user_repository = UserRepository(self.settings)
        session_repository = SessionRepository(self.settings)
        contract_repository = ContractRepository(self.settings)
        time_entry_repository = TimeEntryRepository(self.settings)

        self.store_repository = store_repository
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
        self.settings_repository = SettingsRepository(self.settings)
        self.workwear_repository = WorkwearRepository(self.settings)
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

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def _route(self, *, method: str, path: str, body: bytes = b""):
        headers = {"Cookie": f"clode_session={self.session_token}"}
        if body:
            headers["Content-Type"] = "application/json"
        handler = _FakeHandler(method=method, path=path, body=body, headers=headers)
        return route_request(handler, self.services)

    def test_settings_bootstrap_and_workflow_routes_round_trip(self) -> None:
        status, payload, _ = self._route(method="GET", path="/api/v1/settings/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(payload["workflow"]["vacationApprovalMode"], "permission")
        self.assertEqual(payload["workflow"]["vacationNotifications"], "on")
        self.assertEqual(payload["users"][0]["displayName"], payload["users"][0]["name"])

        save_status, save_payload, _ = self._route(
            method="PUT",
            path="/api/v1/settings/workflow",
            body=b'{"vacationApprovalMode":"admin","vacationNotifications":"off"}',
        )
        self.assertEqual(save_status, 200)
        self.assertEqual(save_payload["workflow"]["vacationApprovalMode"], "admin")
        self.assertEqual(save_payload["workflow"]["vacationNotifications"], "off")

        read_status, read_payload, _ = self._route(method="GET", path="/api/v1/settings/workflow")
        self.assertEqual(read_status, 200)
        self.assertEqual(read_payload["workflow"]["vacationApprovalMode"], "admin")
        self.assertEqual(read_payload["workflow"]["vacationNotifications"], "off")
        self.assertEqual(
            self.settings_repository.get_workflow()["vacationApprovalMode"],
            "admin",
        )

    def test_settings_workflow_backfills_from_legacy_store_and_clears_store_workflow(self) -> None:
        legacy_users = [{"id": "legacy-user", "name": "Legacy User"}]
        self.store_service.save_store(
            "settings",
            {
                "workflow": {
                    "vacationApprovalMode": "admin",
                    "vacationNotifications": "off",
                },
                "users": legacy_users,
            },
        )

        status, payload, _ = self._route(method="GET", path="/api/v1/settings/workflow")

        self.assertEqual(status, 200)
        self.assertEqual(payload["workflow"]["vacationApprovalMode"], "admin")
        self.assertEqual(payload["workflow"]["vacationNotifications"], "off")
        self.assertEqual(
            self.settings_repository.get_workflow()["vacationApprovalMode"],
            "admin",
        )
        self.assertEqual(self.store_service.get_store("settings"), {"users": legacy_users})

    def test_work_card_state_route_uses_domain_contract(self) -> None:
        save_status, save_payload, _ = self._route(
            method="PUT",
            path="/api/v1/work-cards/state",
            body=(
                b'{"store":{"version":1,"cards":[{"id":"card-1","employee_id":"emp-1","employee_name":"Jan Nowak",'
                b'"month_key":"2026-04","month_label":"kwiecien 2026","updated_at":"2026-04-20T10:00:00Z",'
                b'"rows":[{"date":"2026-04-20","note":"","entries":[{"id":"entry-1","contract_id":"c-1","contract_name":"Kontrakt 1","hours":8}]}]}]}}'
            ),
        )
        self.assertEqual(save_status, 200)
        self.assertEqual(save_payload["store"]["cards"][0]["id"], "card-1")

        read_status, read_payload, _ = self._route(method="GET", path="/api/v1/work-cards/state")
        self.assertEqual(read_status, 200)
        self.assertEqual(read_payload["store"]["cards"][0]["employee_name"], "Jan Nowak")

    def test_work_card_card_and_history_routes_use_lightweight_domain_contract(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO employees
                (id, name, first_name, last_name, worker_code, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('emp-1', 'Jan Nowak', 'Jan', 'Nowak', 'WK-1', 'Brygadzista', 'active', '2026-01-10', '', '', '', '', ''),
                ('emp-2', 'Adam Lis', 'Adam', 'Lis', 'WK-2', 'Monter', 'active', '2026-01-10', '', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-1', '001', 'Kontrakt 1', 'Inwestor A', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-2', '002', 'Kontrakt 2', 'Inwestor B', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
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
                ('te-stale-1', 'hm-2026-04', 'emp-1', 'Jan Nowak', NULL, 'Nieprzypisane', 3, 120)
                """
            )
            connection.commit()

        self._route(
            method="PUT",
            path="/api/v1/work-cards/state",
            body=(
                b'{"store":{"version":1,"cards":[{"id":"card-1","employee_id":"emp-1","employee_name":"Jan Nowak",'
                b'"month_key":"2026-04","month_label":"kwiecien 2026","updated_at":"2026-04-20T10:00:00Z",'
                b'"rows":[{"date":"2026-04-20","note":"","entries":[{"id":"entry-1","contract_id":"c-1","contract_name":"Kontrakt 1","hours":8}]}]},'
                b'{"id":"card-2","employee_id":"emp-2","employee_name":"Adam Lis","month_key":"2026-03",'
                b'"month_label":"marzec 2026","updated_at":"2026-03-18T10:00:00Z","rows":[]}]}}'
            ),
        )

        history_status, history_payload, _ = self._route(
            method="GET",
            path="/api/v1/work-cards/history",
        )
        self.assertEqual(history_status, 200)
        self.assertEqual(history_payload["cards"][0]["card_id"], "card-1")
        self.assertEqual(history_payload["cards"][0]["filled_days"], 1)
        self.assertEqual(history_payload["cards"][0]["total_hours"], 8.0)

        card_status, card_payload, _ = self._route(
            method="GET",
            path="/api/v1/work-cards/card?month=2026-04&employee_id=emp-1",
        )
        self.assertEqual(card_status, 200)
        self.assertEqual(card_payload["card"]["id"], "card-1")

        save_status, save_payload, _ = self._route(
            method="PUT",
            path="/api/v1/work-cards/card",
            body=(
                b'{"card":{"id":"card-1","employee_id":"emp-1","employee_name":"Jan Nowak",'
                b'"month_key":"2026-04","month_label":"kwiecien 2026","updated_at":"2026-04-21T10:00:00Z",'
                b'"rows":[{"date":"2026-04-20","note":"Dzien testowy","entries":[{"id":"entry-1","contract_id":"c-1","contract_name":"Kontrakt 1","hours":6}]}]}}'
            ),
        )
        self.assertEqual(save_status, 200)
        self.assertEqual(save_payload["card"]["rows"][0]["entries"][0]["hours"], 6)
        self.assertNotIn("sync_error", save_payload)

        time_entries_status, time_entries_payload, _ = self._route(
            method="GET",
            path="/api/v1/time-entries?month=2026-04&employee_id=emp-1",
        )
        self.assertEqual(time_entries_status, 200)
        self.assertEqual(len(time_entries_payload["entries"]), 1)
        self.assertEqual(time_entries_payload["entries"][0]["contract_id"], "c-1")
        self.assertEqual(time_entries_payload["entries"][0]["hours"], 6.0)

        state_status, state_payload, _ = self._route(method="GET", path="/api/v1/work-cards/state")
        self.assertEqual(state_status, 200)
        self.assertEqual(len(state_payload["store"]["cards"]), 2)
        self.assertEqual(state_payload["store"]["cards"][0]["id"], "card-1")

    def test_auth_and_user_service_share_same_public_user_shape(self) -> None:
        login_user = self.auth_service.login("admin", "admin")["user"]
        listed_user = self.user_service.list_users()[0]

        self.assertEqual(set(login_user.keys()), set(listed_user.keys()))
        self.assertIn("displayName", login_user)
        self.assertEqual(login_user["displayName"], login_user["name"])

    def test_settings_audit_log_backfills_legacy_store_and_uses_sql_rows(self) -> None:
        legacy_entry = {
            "id": "audit-legacy-1",
            "timestamp": "2026-04-20T10:00:00Z",
            "module": "Administracja",
            "action": "Legacy import",
            "subject": "Workflow",
            "details": "Imported from store_documents",
            "user_id": "user-admin",
            "user_name": "Admin ERP",
        }
        self.store_service.save_store("audit_logs", [legacy_entry])

        status, payload, _ = self._route(method="GET", path="/api/v1/settings/audit-log")
        self.assertEqual(status, 200)
        self.assertEqual(payload["entries"][0]["id"], "audit-legacy-1")
        self.assertIsNone(self.store_service.get_store("audit_logs"))
        self.assertEqual(self.settings_repository.list_audit_logs()[0]["id"], "audit-legacy-1")

        append_status, append_payload, _ = self._route(
            method="POST",
            path="/api/v1/settings/audit-log",
            body=(
                b'{"entry":{"id":"audit-new-1","timestamp":"2026-04-20T12:00:00Z","module":"Administracja",'
                b'"action":"Saved workflow","subject":"Workflow","details":"Updated",'
                b'"user_id":"user-admin","user_name":"Admin ERP"}}'
            ),
        )
        self.assertEqual(append_status, 201)
        self.assertEqual(append_payload["entry"]["id"], "audit-new-1")
        self.assertEqual(self.settings_repository.list_audit_logs()[0]["id"], "audit-new-1")

    def test_workwear_routes_backfill_store_documents_into_sql_tables(self) -> None:
        self.store_service.save_store(
            "workwear_catalog",
            [
                {
                    "id": "ww-cat-1",
                    "name": "Bluza",
                    "category": "Odziez",
                    "notes": "",
                }
            ],
        )
        self.store_service.save_store(
            "workwear_issues",
            [
                {
                    "id": "ww-issue-1",
                    "employee_id": "emp-1",
                    "employee_key": "emp-1",
                    "employee_name": "Jan Nowak",
                    "issue_date": "2026-04-20",
                    "item_id": "ww-cat-1",
                    "item_name": "Bluza",
                    "size": "L",
                    "quantity": 1,
                    "notes": "",
                }
            ],
        )

        catalog_status, catalog_payload, _ = self._route(
            method="GET",
            path="/api/v1/workwear/catalog",
        )
        issues_status, issues_payload, _ = self._route(
            method="GET",
            path="/api/v1/workwear/issues",
        )

        self.assertEqual(catalog_status, 200)
        self.assertEqual(catalog_payload["catalog"][0]["id"], "ww-cat-1")
        self.assertEqual(issues_status, 200)
        self.assertEqual(issues_payload["issues"][0]["employee_key"], "emp-1")
        self.assertIsNone(self.store_service.get_store("workwear_catalog"))
        self.assertIsNone(self.store_service.get_store("workwear_issues"))
        self.assertEqual(self.workwear_repository.list_catalog()[0]["id"], "ww-cat-1")
        self.assertEqual(self.workwear_repository.list_issues()[0]["id"], "ww-issue-1")


if __name__ == "__main__":
    unittest.main()
