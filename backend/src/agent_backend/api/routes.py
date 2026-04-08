from __future__ import annotations

import json
from urllib.parse import parse_qs, urlparse

from agent_backend.auth.sessions import (
    build_logout_cookie,
    build_session_cookie,
    read_session_token_from_headers,
)
from agent_backend.services.auth_service import AuthService, AuthServiceError
from agent_backend.services.contract_service import ContractService, ContractServiceError
from agent_backend.services.invoice_service import InvoiceService, InvoiceServiceError
from agent_backend.services.store_service import StoreService
from agent_backend.services.time_entry_service import TimeEntryService, TimeEntryServiceError
from agent_backend.services.user_service import UserService, UserServiceError


def json_response(status: int, payload: dict, headers: dict | None = None) -> tuple[int, dict, dict]:
    return status, payload, headers or {}


def parse_json_body(handler) -> dict:
    content_length = int(handler.headers.get("Content-Length", "0") or "0")
    if not content_length:
        return {}
    raw = handler.rfile.read(content_length)
    return json.loads(raw.decode("utf-8"))


def route_request(
    handler,
    store_service: StoreService,
    auth_service: AuthService,
    user_service: UserService,
    invoice_service: InvoiceService,
    contract_service: ContractService,
    time_entry_service: TimeEntryService,
):
    parsed = urlparse(handler.path)
    query = parse_qs(parsed.query or "")
    method = handler.command.upper()
    path = parsed.path.rstrip("/") or "/"
    session_token = read_session_token_from_headers(
        handler.headers.get("Cookie"),
        handler.headers.get("X-Agent-Session"),
    )
    current_user = auth_service.get_current_user(session_token)

    def require_admin():
        auth_service.ensure_admin(current_user)

    def require_store_access(store_name: str):
        auth_service.ensure_store_access(current_user, store_name)

    if method == "GET" and path == "/api/health":
        return json_response(200, {"ok": True, "service": "agent-backend"})

    if method == "GET" and path == "/api/v1/meta":
        return json_response(
            200,
            {
                "ok": True,
                "mode": "transition",
                "storage": "sql + transitional store_documents",
                "stores": store_service.list_stores(),
            },
        )

    try:
        if method == "POST" and path == "/api/v1/auth/login":
            body = parse_json_body(handler)
            result = auth_service.login(body.get("username"), body.get("password"))
            return json_response(
                200,
                {"ok": True, "user": result["user"], "session_token": result["token"]},
                {"Set-Cookie": build_session_cookie(result["token"], auth_service.session_ttl_hours)},
            )

        if method == "POST" and path == "/api/v1/auth/logout":
            auth_service.logout(session_token)
            return json_response(200, {"ok": True}, {"Set-Cookie": build_logout_cookie()})

        if method == "GET" and path == "/api/v1/auth/me":
            if not current_user:
                return json_response(401, {"ok": False, "error": "No active session."})
            return json_response(200, {"ok": True, "user": current_user})

        if method == "POST" and path == "/api/v1/auth/password-reset-request":
            body = parse_json_body(handler)
            result = auth_service.request_password_reset(body.get("username"))
            return json_response(200, {"ok": True, **result})

        if path == "/api/v1/users":
            require_admin()
            if method == "GET":
                return json_response(200, {"ok": True, "users": user_service.list_users()})
            if method == "POST":
                body = parse_json_body(handler)
                created = user_service.create_or_update_user(body)
                return json_response(201, {"ok": True, "user": created})

        if path.startswith("/api/v1/users/"):
            require_admin()
            user_id = path.split("/api/v1/users/", 1)[1]
            if not user_id:
                return json_response(400, {"ok": False, "error": "Missing user id."})
            if method == "PUT":
                body = parse_json_body(handler)
                body["id"] = user_id
                updated = user_service.create_or_update_user(body)
                return json_response(200, {"ok": True, "user": updated})
            if method == "DELETE":
                user_service.delete_user(user_id, actor_user_id=current_user["id"] if current_user else None)
                return json_response(204, {})

        if method == "GET" and path == "/api/v1/contracts":
            include_archived = (query.get("include_archived") or ["1"])[0]
            contracts = contract_service.list_contracts(
                current_user,
                include_archived=str(include_archived).strip().lower() in {"1", "true", "yes"},
            )
            return json_response(200, {"ok": True, "contracts": contracts})

        if method == "POST" and path == "/api/v1/contracts":
            body = parse_json_body(handler)
            created = contract_service.create_contract(body, current_user)
            return json_response(201, {"ok": True, "contract": created})

        if method == "POST" and path == "/api/v1/contracts/bulk-archive":
            body = parse_json_body(handler)
            result = contract_service.bulk_archive_contracts(body.get("ids") or [], current_user)
            return json_response(200, {"ok": True, **result})

        if method == "GET" and path == "/api/v1/dashboard/contracts":
            payload = contract_service.calculate_dashboard_snapshot(
                {
                    "scope": (query.get("scope") or ["all"])[0],
                    "year": (query.get("year") or [""])[0],
                    "month": (query.get("month") or [""])[0],
                },
                current_user,
                include_archived=str((query.get("include_archived") or ["0"])[0]).strip().lower() in {"1", "true", "yes"},
            )
            return json_response(200, {"ok": True, **payload})

        if path.startswith("/api/v1/contracts/"):
            contract_path = path.split("/api/v1/contracts/", 1)[1]
            if contract_path.endswith("/metrics"):
                contract_id = contract_path.rsplit("/metrics", 1)[0]
                payload = contract_service.calculate_contract_metrics(
                    contract_id,
                    {
                        "scope": (query.get("scope") or ["all"])[0],
                        "year": (query.get("year") or [""])[0],
                        "month": (query.get("month") or [""])[0],
                    },
                    current_user,
                )
                return json_response(200, {"ok": True, **payload})

            if contract_path.endswith("/usage"):
                contract_id = contract_path.rsplit("/usage", 1)[0]
                payload = contract_service.get_contract_usage(contract_id, current_user)
                return json_response(200, {"ok": True, **payload})

            contract_id = contract_path
            if not contract_id:
                return json_response(400, {"ok": False, "error": "Missing contract id."})
            if method == "GET":
                contract = contract_service.get_contract(contract_id, current_user)
                return json_response(200, {"ok": True, "contract": contract})
            if method == "PUT":
                body = parse_json_body(handler)
                updated = contract_service.update_contract(contract_id, body, current_user)
                return json_response(200, {"ok": True, "contract": updated})
            if method == "DELETE":
                archived = contract_service.archive_contract(contract_id, current_user)
                return json_response(200, {"ok": True, "contract": archived})

        if path == "/api/v1/invoices":
            if method == "GET":
                filters = {
                    "contract_id": (query.get("contract_id") or [""])[0],
                    "unassigned": (query.get("unassigned") or [""])[0],
                    "scope": (query.get("scope") or ["all"])[0],
                    "year": (query.get("year") or [""])[0],
                    "month": (query.get("month") or [""])[0],
                    "type": (query.get("type") or ["cost"])[0],
                    "payment_status": (query.get("payment_status") or [""])[0],
                }
                payload = invoice_service.list_invoices(filters, current_user)
                return json_response(200, {"ok": True, **payload})
            if method == "POST":
                body = parse_json_body(handler)
                created = invoice_service.create_invoice(body, current_user)
                return json_response(201, {"ok": True, "invoice": created})

        if method == "POST" and path == "/api/v1/invoices/bulk-delete":
            body = parse_json_body(handler)
            deleted_count = invoice_service.bulk_delete(body.get("ids") or [], current_user)
            return json_response(200, {"ok": True, "deleted_count": deleted_count})

        if method == "POST" and path == "/api/v1/invoices/import-legacy":
            body = parse_json_body(handler)
            result = invoice_service.import_legacy_entries(
                body.get("entries") or [],
                current_user,
            )
            return json_response(200, {"ok": True, **result})

        if path.startswith("/api/v1/invoices/"):
            invoice_id = path.split("/api/v1/invoices/", 1)[1]
            if not invoice_id:
                return json_response(400, {"ok": False, "error": "Missing invoice id."})
            if method == "GET":
                invoice = invoice_service.get_invoice(invoice_id, current_user)
                return json_response(200, {"ok": True, "invoice": invoice})
            if method == "PUT":
                body = parse_json_body(handler)
                updated = invoice_service.update_invoice(invoice_id, body, current_user)
                return json_response(200, {"ok": True, "invoice": updated})
            if method == "DELETE":
                invoice_service.delete_invoice(invoice_id, current_user)
                return json_response(204, {})

        if path == "/api/v1/time-entries":
            if method == "GET":
                filters = {
                    "month": (query.get("month") or [""])[0],
                    "contract_id": (query.get("contract_id") or [""])[0],
                    "employee_id": (query.get("employee_id") or [""])[0],
                    "employee_name": (query.get("employee_name") or [""])[0],
                    "user": (query.get("user") or [""])[0],
                }
                payload = time_entry_service.list_time_entries(filters, current_user)
                return json_response(200, {"ok": True, **payload})
            if method == "POST":
                body = parse_json_body(handler)
                created = time_entry_service.create_time_entry(body, current_user)
                return json_response(201, {"ok": True, "time_entry": created})

        if path == "/api/v1/time-months":
            if method == "POST":
                body = parse_json_body(handler)
                created = time_entry_service.create_month(body, current_user)
                return json_response(201, {"ok": True, "month": created})

        if path.startswith("/api/v1/time-months/"):
            month_key = path.split("/api/v1/time-months/", 1)[1]
            if not month_key:
                return json_response(400, {"ok": False, "error": "Missing month key."})
            if method == "PUT":
                body = parse_json_body(handler)
                updated = time_entry_service.update_month(month_key, body, current_user)
                return json_response(200, {"ok": True, "month": updated})
            if method == "DELETE":
                time_entry_service.delete_month(month_key, current_user)
                return json_response(204, {})

        if path.startswith("/api/v1/time-entries/"):
            entry_id = path.split("/api/v1/time-entries/", 1)[1]
            if not entry_id:
                return json_response(400, {"ok": False, "error": "Missing time entry id."})
            if method == "PUT":
                body = parse_json_body(handler)
                updated = time_entry_service.update_time_entry(entry_id, body, current_user)
                return json_response(200, {"ok": True, "time_entry": updated})
            if method == "DELETE":
                time_entry_service.delete_time_entry(entry_id, current_user)
                return json_response(204, {})
    except AuthServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except UserServiceError as error:
        return json_response(400, {"ok": False, "error": str(error)})
    except ContractServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except InvoiceServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except TimeEntryServiceError as error:
        return json_response(error.status_code, {"ok": False, "error": str(error)})
    except ValueError as error:
        return json_response(400, {"ok": False, "error": str(error)})

    if path.startswith("/api/v1/stores/"):
        store_name = path.split("/api/v1/stores/", 1)[1]
        if not store_name:
            return json_response(400, {"ok": False, "error": "Missing store name."})
        try:
            require_store_access(store_name)
        except AuthServiceError as error:
            return json_response(error.status_code, {"ok": False, "error": str(error)})

        if method == "GET":
            payload = store_service.get_store(store_name)
            if payload is None:
                return json_response(404, {"ok": False, "error": "Store not found."})
            return json_response(200, {"ok": True, "store": store_name, "payload": payload})

        if method == "PUT":
            body = parse_json_body(handler)
            payload = body.get("payload")
            saved = store_service.save_store(store_name, payload)
            return json_response(200, {"ok": True, "store": store_name, "payload": saved})

        if method == "DELETE":
            store_service.delete_store(store_name)
            return 204, {}, {}

    return json_response(404, {"ok": False, "error": "Route not found."})
