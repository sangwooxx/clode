from __future__ import annotations

from clode_backend.api.context import RequestContext
from clode_backend.api.http import json_response, parse_json_body


BLOCKED_LEGACY_STORE_ROUTES = {
    "audit_logs",
    "contracts",
    "contracts_deleted",
    "employees",
    "hours",
    "invoices",
    "planning",
    "settings",
    "vacations",
    "work_cards",
    "workwear_catalog",
    "workwear_issues",
}


def handle_store_domain_route(context: RequestContext):
    method = context.method
    path = context.path
    query = context.query
    current_user = context.current_user
    auth_service = context.services.auth_service
    store_service = context.services.store_service
    time_entry_service = context.services.time_entry_service
    user_service = context.services.user_service
    settings_service = context.services.settings_service
    workwear_service = context.services.workwear_service

    if path == "/api/v1/settings/bootstrap" and method == "GET":
        auth_service.ensure_view_access(current_user, "settingsView")
        return json_response(
            200,
            {
                "ok": True,
                "users": user_service.list_users(),
                "workflow": settings_service.get_workflow(),
                "audit_log": settings_service.list_audit_logs(),
            },
        )

    if path == "/api/v1/settings/workflow":
        if method == "GET":
            auth_service.ensure_view_access(current_user, "settingsView")
            return json_response(200, {"ok": True, "workflow": settings_service.get_workflow()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "settings")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "workflow": settings_service.save_workflow(body, current_user=current_user)},
            )

    if path == "/api/v1/settings/audit-log":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "audit_logs")
            return json_response(200, {"ok": True, "entries": settings_service.list_audit_logs()})
        if method == "POST":
            auth_service.ensure_store_write_access(current_user, "audit_logs")
            body = parse_json_body(context.handler)
            return json_response(
                201,
                {
                    "ok": True,
                    "entry": settings_service.append_audit_log(
                        body.get("entry"),
                        current_user=current_user,
                    ),
                },
            )

    if path == "/api/v1/vacations/state":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "vacations")
            return json_response(200, {"ok": True, "vacation_store": store_service.get_vacation_store()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "vacations")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "vacation_store": store_service.save_vacation_store(body.get("vacation_store"))},
            )

    if path == "/api/v1/planning/state":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "planning")
            return json_response(200, {"ok": True, "planning_store": store_service.get_planning_store()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "planning")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "planning_store": store_service.save_planning_store(body.get("planning_store"))},
            )

    if path == "/api/v1/work-cards/state":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "work_cards")
            return json_response(200, {"ok": True, "store": store_service.get_work_card_store()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "work_cards")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "store": store_service.save_work_card_store(body.get("store"))},
            )

    if path == "/api/v1/work-cards/history" and method == "GET":
        auth_service.ensure_store_read_access(current_user, "work_cards")
        return json_response(
            200,
            {"ok": True, "cards": store_service.list_work_card_history_summaries()},
        )

    if path == "/api/v1/work-cards/card":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "work_cards")
            month_key = (query.get("month") or [""])[0]
            employee_id = (query.get("employee_id") or [""])[0]
            employee_name = (query.get("employee_name") or [""])[0]
            card = store_service.get_work_card(
                month_key,
                employee_id=employee_id,
                employee_name=employee_name,
            )
            return json_response(200, {"ok": True, "card": card})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "work_cards")
            body = parse_json_body(context.handler)
            with store_service.repository.connect() as connection:
                saved_card = store_service.save_work_card(body.get("card"), connection=connection)
                time_entry_service.sync_work_card_entries(saved_card, current_user, connection=connection)
                connection.commit()
            return json_response(
                200,
                {
                    "ok": True,
                    "card": saved_card,
                },
            )

    if path == "/api/v1/workwear/catalog":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "workwear_catalog")
            return json_response(200, {"ok": True, "catalog": workwear_service.get_catalog()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "workwear_catalog")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "catalog": workwear_service.save_catalog(body.get("catalog"))},
            )

    if path == "/api/v1/workwear/issues":
        if method == "GET":
            auth_service.ensure_store_read_access(current_user, "workwear_issues")
            return json_response(200, {"ok": True, "issues": workwear_service.get_issues()})
        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, "workwear_issues")
            body = parse_json_body(context.handler)
            return json_response(
                200,
                {"ok": True, "issues": workwear_service.save_issues(body.get("issues"))},
            )

    if path.startswith("/api/v1/stores/"):
        store_name = path.split("/api/v1/stores/", 1)[1]
        if not store_name:
            return json_response(400, {"ok": False, "error": "Missing store name."})
        if store_name in BLOCKED_LEGACY_STORE_ROUTES:
            return json_response(
                410,
                {"ok": False, "error": "This store is available only through its dedicated domain endpoint."},
            )

        if method == "GET":
            auth_service.ensure_store_read_access(current_user, store_name)
            payload = store_service.get_store(store_name)
            if payload is None:
                return json_response(404, {"ok": False, "error": "Store not found."})
            return json_response(200, {"ok": True, "store": store_name, "payload": payload})

        if method == "PUT":
            auth_service.ensure_store_write_access(current_user, store_name)
            body = parse_json_body(context.handler)
            payload = body.get("payload")
            saved = store_service.save_store(store_name, payload)
            return json_response(200, {"ok": True, "store": store_name, "payload": saved})

        if method == "DELETE":
            auth_service.ensure_store_write_access(current_user, store_name)
            store_service.delete_store(store_name)
            return json_response(204, {})

    return None
