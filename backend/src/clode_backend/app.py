from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from clode_backend.api.context import ApiServices
from clode_backend.api.routes import route_request
from clode_backend.api.transport import coerce_api_request, send_handler_json_response
from clode_backend.config import load_settings
from clode_backend.db.bootstrap import ensure_database
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository
from clode_backend.repositories.contract_control_repository import ContractControlRepository
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.invoice_repository import InvoiceRepository
from clode_backend.repositories.planning_repository import PlanningRepository
from clode_backend.repositories.settings_repository import SettingsRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.user_repository import UserRepository
from clode_backend.repositories.vacation_repository import VacationRepository
from clode_backend.repositories.work_card_repository import WorkCardRepository
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
    session_repository = SessionRepository(settings)
    vacation_repository = VacationRepository(settings)
    planning_repository = PlanningRepository(settings)
    work_card_repository = WorkCardRepository(settings)
    store_service = StoreService(
        store_repository,
        vacation_repository=vacation_repository,
        planning_repository=planning_repository,
        work_card_repository=work_card_repository,
    )
    settings_service = SettingsService(SettingsRepository(settings), store_repository)
    workwear_service = WorkwearService(WorkwearRepository(settings), store_repository)
    user_service = UserService(user_repository, store_repository, session_repository)
    auth_service = AuthService(
        user_repository,
        session_repository,
        settings.session_ttl_hours,
        secure_cookies=settings.secure_cookies,
        session_secret=settings.session_secret,
        use_stateless_sessions=settings.use_stateless_sessions,
    )
    contract_repository = ContractRepository(settings)
    invoice_service = InvoiceService(InvoiceRepository(settings), contract_repository)
    contract_service = ContractService(
        contract_repository,
        ContractMetricsRepository(settings),
        time_entry_repository,
        ContractControlRepository(settings),
    )
    employee_service = EmployeeService(
        employee_repository,
        time_entry_repository,
        store_repository,
        work_card_repository,
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


def run_runtime_maintenance(
    services: ApiServices,
    *,
    bootstrap_admin: bool = False,
    import_legacy_employees: bool = False,
    import_legacy_domains: bool = False,
    import_legacy_settings: bool = False,
    import_legacy_workwear: bool = False,
    repair_time_entries: bool = False,
    purge_imported_legacy: bool = False,
) -> dict[str, object]:
    report: dict[str, object] = {
        "bootstrap_admin": False,
        "legacy_employees_imported": 0,
        "legacy_domain_imports": {},
        "legacy_settings_import": {},
        "legacy_workwear_import": {},
        "time_entry_repair": {},
    }

    if bootstrap_admin:
        before_count = services.user_service.repository.count()
        services.user_service.ensure_bootstrap_users()
        after_count = services.user_service.repository.count()
        report["bootstrap_admin"] = after_count > before_count

    if import_legacy_employees:
        report["legacy_employees_imported"] = services.employee_service.repository.import_legacy_store(
            purge_legacy=purge_imported_legacy
        )

    if import_legacy_domains:
        report["legacy_domain_imports"] = services.store_service.bootstrap_legacy_domain_stores(
            purge_legacy=purge_imported_legacy
        )

    if import_legacy_settings:
        report["legacy_settings_import"] = services.settings_service.bootstrap_legacy_settings(
            purge_legacy=purge_imported_legacy
        )

    if import_legacy_workwear:
        report["legacy_workwear_import"] = services.workwear_service.bootstrap_legacy_store(
            purge_legacy=purge_imported_legacy
        )

    if repair_time_entries:
        report["time_entry_repair"] = services.time_entry_service.repair_legacy_state()

    return report


def create_server():
    runtime = create_runtime_context()
    settings = runtime["settings"]
    services = runtime["services"]

    class ClodeRequestHandler(BaseHTTPRequestHandler):
        server_version = "ClodeBackend/0.1"

        def do_OPTIONS(self) -> None:  # noqa: N802
            send_handler_json_response(self, settings, 204)

        def _dispatch(self) -> None:
            request = coerce_api_request(self)
            status, payload, headers = route_request(request, services)
            send_handler_json_response(self, settings, status, payload, headers)

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

