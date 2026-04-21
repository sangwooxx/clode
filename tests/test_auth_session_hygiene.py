from __future__ import annotations

import io
import os
import sys
import unittest
from http.cookies import SimpleCookie
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


class AuthSessionHygieneTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-auth-{uuid4().hex}.db"
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
                "name": "Admin",
                "username": "admin",
                "email": "admin@example.com",
                "password": "admin",
                "role": "admin",
                "status": "active",
                "canApproveVacations": True,
            }
        )

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def test_login_response_uses_cookie_only_and_logout_clears_current_and_legacy_cookie(self) -> None:
        login_body = b'{"username":"admin","password":"admin"}'
        login_handler = _FakeHandler(
            method="POST",
            path="/api/v1/auth/login",
            body=login_body,
            headers={"Content-Type": "application/json"},
        )

        status, payload, headers = route_request(login_handler, self.services)

        self.assertEqual(status, 200)
        self.assertNotIn("session_token", payload)
        set_cookies = headers.get("Set-Cookie")
        self.assertIsInstance(set_cookies, tuple)
        self.assertEqual(len(set_cookies), 2)
        self.assertIn("clode_session=", set_cookies[0])
        self.assertIn("agent_session=", set_cookies[1])
        self.assertIn("Max-Age=0", set_cookies[1])

        cookie = SimpleCookie()
        cookie.load(set_cookies[0])
        session_token = cookie["clode_session"].value

        logout_handler = _FakeHandler(
            method="POST",
            path="/api/v1/auth/logout",
            headers={"Cookie": f"clode_session={session_token}"},
        )
        logout_status, logout_payload, logout_headers = route_request(logout_handler, self.services)

        self.assertEqual(logout_status, 200)
        self.assertTrue(logout_payload["ok"])
        logout_cookies = logout_headers.get("Set-Cookie")
        self.assertEqual(len(logout_cookies), 2)
        self.assertTrue(all("Max-Age=0" in cookie_value for cookie_value in logout_cookies))

    def test_auth_session_route_rejects_invalid_token_and_accepts_valid_session(self) -> None:
        valid_login = self.auth_service.login("admin", "admin")
        session_cookie = SimpleCookie()
        cookie_header = f"clode_session={valid_login['token']}; agent_session=legacy-session"
        session_cookie.load(cookie_header)
        self.assertIn("clode_session", session_cookie)

        invalid_handler = _FakeHandler(
            method="GET",
            path="/api/v1/auth/session",
            headers={"Cookie": "clode_session=invalid-token"},
        )
        invalid_status, invalid_payload, _ = route_request(invalid_handler, self.services)
        self.assertEqual(invalid_status, 401)
        self.assertFalse(invalid_payload["ok"])

        valid_handler = _FakeHandler(
            method="GET",
            path="/api/v1/auth/session",
            headers={"Cookie": cookie_header},
        )
        valid_status, valid_payload, _ = route_request(valid_handler, self.services)
        self.assertEqual(valid_status, 204)
        self.assertEqual(valid_payload, {})

    def test_stateless_sessions_survive_without_session_repository_storage(self) -> None:
        stateless_auth = AuthService(
            self.user_service.repository,
            SessionRepository(self.settings),
            self.settings.session_ttl_hours,
            secure_cookies=self.settings.secure_cookies,
            session_secret="test-session-secret",
            use_stateless_sessions=True,
        )

        login_payload = stateless_auth.login("admin", "admin")
        current_user = stateless_auth.get_current_user(login_payload["token"])

        self.assertIsNotNone(current_user)
        self.assertEqual(current_user["username"], "admin")


if __name__ == "__main__":
    unittest.main()
