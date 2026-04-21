from __future__ import annotations

from clode_backend.api.auth_routes import handle_auth_route
from clode_backend.api.context import ApiServices, build_request_context
from clode_backend.api.http import RequestPayloadError, json_response
from clode_backend.api.meta_routes import handle_meta_route
from clode_backend.api.resource_routes import handle_resource_route
from clode_backend.api.store_domain_routes import handle_store_domain_route
from clode_backend.services.auth_service import AuthServiceError
from clode_backend.services.contract_service import ContractServiceError
from clode_backend.services.employee_service import EmployeeServiceError
from clode_backend.services.invoice_service import InvoiceServiceError
from clode_backend.services.time_entry_service import TimeEntryServiceError
from clode_backend.services.user_service import UserServiceError


ROUTE_HANDLERS = (
    handle_meta_route,
    handle_auth_route,
    handle_store_domain_route,
    handle_resource_route,
)


def route_request(handler, services: ApiServices):
    context = build_request_context(handler, services)

    try:
        for route_handler in ROUTE_HANDLERS:
            response = route_handler(context)
            if response is not None:
                return response
    except AuthServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except UserServiceError as error:
        return json_response(400, {"ok": False, "error": str(error)})
    except ContractServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except EmployeeServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except InvoiceServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except TimeEntryServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except RequestPayloadError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except ValueError as error:
        return json_response(400, {"ok": False, "error": str(error)})
    except Exception:
        return json_response(500, {"ok": False, "error": "Internal server error."})

    return json_response(404, {"ok": False, "error": "Route not found."})
