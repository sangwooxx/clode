from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from clode_backend.api.context import ApiServices
from clode_backend.auth.sessions import LEGACY_SESSION_HEADER_NAME, SESSION_HEADER_NAME
from clode_backend.api.routes import route_request
from clode_backend.config import load_settings
from clode_backend.db.bootstrap import ensure_database
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.invoice_repository import InvoiceRepository
from clode_backend.repositories.settings_repository import SettingsRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.user_repository import UserRepository
from clode_backend.repositories.workwear_repository import WorkwearRepository
from clode_backend.services.auth_service import AuthService
from clode_backend.services.contract_service import ContractService
from clode_backend.services.employee_service import EmployeeService
from clode_backend.services.invoice_service import InvoiceService
from clode_backend.services.settings_service import SettingsService
from clode_backend.services.store_service import StoreService
from clode_backend.services.time_entry_service import TimeEntryService
from clode_backend.services.user_service import UserService
from clode_backend.services.workwear_service import WorkwearService


def create_runtime_context():
    settings = load_settings()
    ensure_database(settings)
    store_repository = StoreRepository(settings)
    employee_repository = EmployeeRepository(settings)
    time_entry_repository = TimeEntryRepository(settings)
    user_repository = UserRepository(settings)
    store_service = StoreService(store_repository)
    settings_service = SettingsService(SettingsRepository(settings), store_repository)
    workwear_service = WorkwearService(WorkwearRepository(settings), store_repository)
    user_service = UserService(user_repository, store_repository)
    user_service.ensure_bootstrap_users()
    auth_service = AuthService(
        user_repository,
        SessionRepository(settings),
        settings.session_ttl_hours,
        secure_cookies=settings.secure_cookies,
    )
    contract_repository = ContractRepository(settings)
    invoice_service = InvoiceService(InvoiceRepository(settings), contract_repository)
    contract_service = ContractService(
        contract_repository,
        ContractMetricsRepository(settings),
        time_entry_repository,
    )
    employee_service = EmployeeService(
        employee_repository,
        time_entry_repository,
        store_repository,
    )
    time_entry_service = TimeEntryService(
        time_entry_repository,
        contract_repository,
        employee_repository,
    )
    services = ApiServices(
        store_service=store_service,
        auth_service=auth_service,
        user_service=user_service,
        invoice_service=invoice_service,
        contract_service=contract_service,
        employee_service=employee_service,
        time_entry_service=time_entry_service,
        settings_service=settings_service,
        workwear_service=workwear_service,
    )

    return {
        "settings": settings,
        "services": services,
    }


def create_server():
    runtime = create_runtime_context()
    settings = runtime["settings"]
    services = runtime["services"]

    class ClodeRequestHandler(BaseHTTPRequestHandler):
        server_version = "ClodeBackend/0.1"

        def _cors_origin(self) -> str:
            origin = self.headers.get("Origin", "")
            if origin in settings.allowed_origins:
                return origin
            return settings.allowed_origins[0] if settings.allowed_origins else "*"

        def _send(
            self,
            status: int,
            payload: dict | None = None,
            extra_headers: dict[str, str | list[str] | tuple[str, ...]] | None = None,
        ) -> None:
            self.send_response(status)
            self.send_header("Access-Control-Allow-Origin", self._cors_origin())
            self.send_header("Access-Control-Allow-Headers", f"Content-Type, {SESSION_HEADER_NAME}, {LEGACY_SESSION_HEADER_NAME}")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
            for header_name, header_value in (extra_headers or {}).items():
                values = (
                    header_value
                    if isinstance(header_value, (list, tuple))
                    else [header_value]
                )
                for value in values:
                    self.send_header(header_name, value)
            if status != 204:
                body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.end_headers()

        def do_OPTIONS(self) -> None:  # noqa: N802
            self._send(204)

        def _dispatch(self) -> None:
            status, payload, headers = route_request(self, services)
            self._send(status, payload, headers)

        def do_GET(self) -> None:  # noqa: N802
            self._dispatch()

        def do_POST(self) -> None:  # noqa: N802
            self._dispatch()

        def do_PUT(self) -> None:  # noqa: N802
            self._dispatch()

        def do_DELETE(self) -> None:  # noqa: N802
            self._dispatch()

        def log_message(self, format_string: str, *args) -> None:
            return

    return ThreadingHTTPServer((settings.host, settings.port), ClodeRequestHandler)

