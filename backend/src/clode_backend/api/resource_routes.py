from __future__ import annotations

from clode_backend.api.context import RequestContext
from clode_backend.api.http import json_response, parse_json_body


def handle_resource_route(context: RequestContext):
    method = context.method
    path = context.path
    query = context.query
    current_user = context.current_user
    auth_service = context.services.auth_service
    user_service = context.services.user_service
    employee_service = context.services.employee_service
    contract_service = context.services.contract_service
    invoice_service = context.services.invoice_service
    time_entry_service = context.services.time_entry_service

    def require_settings_view():
        auth_service.ensure_view_access(current_user, "settingsView")

    def require_settings_manage():
        auth_service.ensure_manage_access(current_user, "settingsView")

    if path == "/api/v1/users":
        if method == "GET":
            require_settings_view()
            return json_response(200, {"ok": True, "users": user_service.list_users()})
        if method == "POST":
            require_settings_manage()
            body = parse_json_body(context.handler)
            created = user_service.create_or_update_user(body)
            return json_response(201, {"ok": True, "user": created})

    if path == "/api/v1/employees":
        if method == "GET":
            employees = employee_service.list_employees(current_user)
            return json_response(200, {"ok": True, "employees": employees})
        if method == "POST":
            body = parse_json_body(context.handler)
            created = employee_service.create_employee(body, current_user)
            return json_response(201, {"ok": True, "employee": created})

    if method == "GET" and path == "/api/v1/employees/summary":
        payload = employee_service.list_employee_summary(current_user)
        return json_response(200, {"ok": True, **payload})

    if path.startswith("/api/v1/employees/"):
        employee_id = path.split("/api/v1/employees/", 1)[1]
        if not employee_id:
            return json_response(400, {"ok": False, "error": "Missing employee id."})
        if method == "PUT":
            body = parse_json_body(context.handler)
            updated = employee_service.update_employee(employee_id, body, current_user)
            return json_response(200, {"ok": True, "employee": updated})
        if method == "DELETE":
            employee_service.delete_employee(employee_id, current_user)
            return json_response(204, {})

    if path.startswith("/api/v1/users/"):
        user_id = path.split("/api/v1/users/", 1)[1]
        if not user_id:
            return json_response(400, {"ok": False, "error": "Missing user id."})
        if method == "PUT":
            require_settings_manage()
            body = parse_json_body(context.handler)
            body["id"] = user_id
            updated = user_service.create_or_update_user(body)
            return json_response(200, {"ok": True, "user": updated})
        if method == "DELETE":
            require_settings_manage()
            user_service.delete_user(
                user_id,
                actor_user_id=current_user["id"] if current_user else None,
            )
            return json_response(204, {})

    if method == "GET" and path == "/api/v1/contracts":
        include_archived = (query.get("include_archived") or ["1"])[0]
        contracts = contract_service.list_contracts(
            current_user,
            include_archived=str(include_archived).strip().lower() in {"1", "true", "yes"},
        )
        return json_response(200, {"ok": True, "contracts": contracts})

    if method == "POST" and path == "/api/v1/contracts":
        body = parse_json_body(context.handler)
        created = contract_service.create_contract(body, current_user)
        return json_response(201, {"ok": True, "contract": created})

    if method == "POST" and path == "/api/v1/contracts/bulk-archive":
        body = parse_json_body(context.handler)
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
            include_archived=str((query.get("include_archived") or ["0"])[0]).strip().lower()
            in {"1", "true", "yes"},
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

        if contract_path.endswith("/snapshot"):
            contract_id = contract_path.rsplit("/snapshot", 1)[0]
            payload = contract_service.get_contract_snapshot(contract_id, current_user)
            return json_response(200, {"ok": True, **payload})

        contract_id = contract_path
        if not contract_id:
            return json_response(400, {"ok": False, "error": "Missing contract id."})
        if method == "GET":
            contract = contract_service.get_contract(contract_id, current_user)
            return json_response(200, {"ok": True, "contract": contract})
        if method == "PUT":
            body = parse_json_body(context.handler)
            updated = contract_service.update_contract(contract_id, body, current_user)
            return json_response(200, {"ok": True, "contract": updated})
        if method == "DELETE":
            permanent = str((query.get("permanent") or ["0"])[0]).strip().lower() in {
                "1",
                "true",
                "yes",
            }
            if permanent:
                contract_service.delete_contract(contract_id, current_user)
                return json_response(204, {})
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
            body = parse_json_body(context.handler)
            created = invoice_service.create_invoice(body, current_user)
            return json_response(201, {"ok": True, "invoice": created})

    if method == "POST" and path == "/api/v1/invoices/bulk-delete":
        body = parse_json_body(context.handler)
        deleted_count = invoice_service.bulk_delete(body.get("ids") or [], current_user)
        return json_response(200, {"ok": True, "deleted_count": deleted_count})

    if method == "POST" and path == "/api/v1/invoices/import-legacy":
        body = parse_json_body(context.handler)
        result = invoice_service.import_legacy_entries(body.get("entries") or [], current_user)
        return json_response(200, {"ok": True, **result})

    if path.startswith("/api/v1/invoices/"):
        invoice_id = path.split("/api/v1/invoices/", 1)[1]
        if not invoice_id:
            return json_response(400, {"ok": False, "error": "Missing invoice id."})
        if method == "GET":
            invoice = invoice_service.get_invoice(invoice_id, current_user)
            return json_response(200, {"ok": True, "invoice": invoice})
        if method == "PUT":
            body = parse_json_body(context.handler)
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
            body = parse_json_body(context.handler)
            created = time_entry_service.create_time_entry(body, current_user)
            return json_response(201, {"ok": True, "time_entry": created})

    if method == "GET" and path == "/api/v1/time-entries/bootstrap":
        payload = time_entry_service.get_time_entries_bootstrap(current_user)
        return json_response(200, {"ok": True, **payload})

    if path == "/api/v1/time-months" and method == "POST":
        body = parse_json_body(context.handler)
        created = time_entry_service.create_month(body, current_user)
        return json_response(201, {"ok": True, "month": created})

    if path.startswith("/api/v1/time-months/"):
        month_key = path.split("/api/v1/time-months/", 1)[1]
        if not month_key:
            return json_response(400, {"ok": False, "error": "Missing month key."})
        if method == "PUT":
            body = parse_json_body(context.handler)
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
            body = parse_json_body(context.handler)
            updated = time_entry_service.update_time_entry(entry_id, body, current_user)
            return json_response(200, {"ok": True, "time_entry": updated})
        if method == "DELETE":
            time_entry_service.delete_time_entry(entry_id, current_user)
            return json_response(204, {})

    return None
