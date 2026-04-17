from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from clode_backend.auth.sessions import LEGACY_SESSION_HEADER_NAME, SESSION_HEADER_NAME
from clode_backend.api.routes import route_request
from clode_backend.config import load_settings
from clode_backend.db.bootstrap import ensure_database
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.invoice_repository import InvoiceRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.user_repository import UserRepository
from clode_backend.services.auth_service import AuthService
from clode_backend.services.contract_service import ContractService
from clode_backend.services.employee_service import EmployeeService
from clode_backend.services.invoice_service import InvoiceService
from clode_backend.services.store_service import StoreService
from clode_backend.services.time_entry_service import TimeEntryService
from clode_backend.services.user_service import UserService


def create_runtime_context():
    settings = load_settings()
    ensure_database(settings)
    store_repository = StoreRepository(settings)
    employee_repository = EmployeeRepository(settings)
    time_entry_repository = TimeEntryRepository(settings)
    store_service = StoreService(store_repository)
    user_service = UserService(UserRepository(settings), store_repository)
    user_service.ensure_bootstrap_users()
    auth_service = AuthService(UserRepository(settings), SessionRepository(settings), settings.session_ttl_hours)
    contract_repository = ContractRepository(settings)
    invoice_service = InvoiceService(InvoiceRepository(settings), contract_repository)
    contract_service = ContractService(contract_repository, ContractMetricsRepository(settings))
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

    return {
        "settings": settings,
        "store_service": store_service,
        "auth_service": auth_service,
        "user_service": user_service,
        "invoice_service": invoice_service,
        "contract_service": contract_service,
        "employee_service": employee_service,
        "time_entry_service": time_entry_service,
    }


def create_server():
    runtime = create_runtime_context()
    settings = runtime["settings"]
    store_service = runtime["store_service"]
    auth_service = runtime["auth_service"]
    user_service = runtime["user_service"]
    invoice_service = runtime["invoice_service"]
    contract_service = runtime["contract_service"]
    employee_service = runtime["employee_service"]
    time_entry_service = runtime["time_entry_service"]

    class ClodeRequestHandler(BaseHTTPRequestHandler):
        server_version = "ClodeBackend/0.1"

        def _cors_origin(self) -> str:
            origin = self.headers.get("Origin", "")
            if origin in settings.allowed_origins:
                return origin
            return settings.allowed_origins[0] if settings.allowed_origins else "*"

        def _send(self, status: int, payload: dict | None = None, extra_headers: dict[str, str] | None = None) -> None:
            self.send_response(status)
            self.send_header("Access-Control-Allow-Origin", self._cors_origin())
            self.send_header("Access-Control-Allow-Headers", f"Content-Type, {SESSION_HEADER_NAME}, {LEGACY_SESSION_HEADER_NAME}")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
            for header_name, header_value in (extra_headers or {}).items():
                self.send_header(header_name, header_value)
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

        def do_GET(self) -> None:  # noqa: N802
            status, payload, headers = route_request(self, store_service, auth_service, user_service, invoice_service, contract_service, employee_service, time_entry_service)
            self._send(status, payload, headers)

        def do_POST(self) -> None:  # noqa: N802
            status, payload, headers = route_request(self, store_service, auth_service, user_service, invoice_service, contract_service, employee_service, time_entry_service)
            self._send(status, payload, headers)

        def do_PUT(self) -> None:  # noqa: N802
            status, payload, headers = route_request(self, store_service, auth_service, user_service, invoice_service, contract_service, employee_service, time_entry_service)
            self._send(status, payload, headers)

        def do_DELETE(self) -> None:  # noqa: N802
            status, payload, headers = route_request(self, store_service, auth_service, user_service, invoice_service, contract_service, employee_service, time_entry_service)
            self._send(status, payload, headers)

        def log_message(self, format_string: str, *args) -> None:
            return

    return ThreadingHTTPServer((settings.host, settings.port), ClodeRequestHandler)

