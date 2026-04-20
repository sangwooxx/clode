from __future__ import annotations

from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qs, urlparse

from clode_backend.auth.sessions import (
    LEGACY_SESSION_HEADER_NAME,
    SESSION_HEADER_NAME,
    read_session_token_from_headers,
)
from clode_backend.services.auth_service import AuthService
from clode_backend.services.contract_service import ContractService
from clode_backend.services.employee_service import EmployeeService
from clode_backend.services.invoice_service import InvoiceService
from clode_backend.services.settings_service import SettingsService
from clode_backend.services.store_service import StoreService
from clode_backend.services.time_entry_service import TimeEntryService
from clode_backend.services.user_service import UserService
from clode_backend.services.workwear_service import WorkwearService


@dataclass(frozen=True)
class ApiServices:
    store_service: StoreService
    auth_service: AuthService
    user_service: UserService
    invoice_service: InvoiceService
    contract_service: ContractService
    employee_service: EmployeeService
    time_entry_service: TimeEntryService
    settings_service: SettingsService
    workwear_service: WorkwearService


@dataclass(frozen=True)
class RequestContext:
    handler: Any
    services: ApiServices
    method: str
    path: str
    query: dict[str, list[str]]
    session_token: str
    current_user: dict[str, Any] | None


def build_request_context(handler, services: ApiServices) -> RequestContext:
    parsed = urlparse(handler.path)
    query = parse_qs(parsed.query or "")
    method = handler.command.upper()
    path = parsed.path.rstrip("/") or "/"
    session_token = read_session_token_from_headers(
        handler.headers.get("Cookie"),
        handler.headers.get(SESSION_HEADER_NAME)
        or handler.headers.get(LEGACY_SESSION_HEADER_NAME),
    )
    current_user = services.auth_service.get_current_user(session_token)
    return RequestContext(
        handler=handler,
        services=services,
        method=method,
        path=path,
        query=query,
        session_token=session_token,
        current_user=current_user,
    )
