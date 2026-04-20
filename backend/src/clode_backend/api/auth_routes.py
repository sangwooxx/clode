from __future__ import annotations

from clode_backend.api.context import RequestContext
from clode_backend.api.http import json_response, parse_json_body
from clode_backend.auth.sessions import (
    build_legacy_logout_cookie,
    build_logout_cookies,
    build_session_cookie,
)


def handle_auth_route(context: RequestContext):
    auth_service = context.services.auth_service

    if context.method == "POST" and context.path == "/api/v1/auth/login":
        body = parse_json_body(context.handler)
        result = auth_service.login(body.get("username"), body.get("password"))
        return json_response(
            200,
            {"ok": True, "user": result["user"]},
            {
                "Set-Cookie": (
                    build_session_cookie(
                        result["token"],
                        auth_service.session_ttl_hours,
                        secure=auth_service.secure_cookies,
                    ),
                    build_legacy_logout_cookie(secure=auth_service.secure_cookies),
                )
            },
        )

    if context.method == "POST" and context.path == "/api/v1/auth/logout":
        auth_service.logout(context.session_token)
        return json_response(
            200,
            {"ok": True},
            {"Set-Cookie": build_logout_cookies(secure=auth_service.secure_cookies)},
        )

    if context.path == "/api/v1/auth/session" and context.method == "GET":
        if not context.current_user:
            return json_response(401, {"ok": False, "error": "No active session."})
        return json_response(204, {})

    if context.method == "GET" and context.path == "/api/v1/auth/me":
        if not context.current_user:
            return json_response(401, {"ok": False, "error": "No active session."})
        return json_response(200, {"ok": True, "user": context.current_user})

    if context.method == "POST" and context.path == "/api/v1/auth/password-reset-request":
        body = parse_json_body(context.handler)
        result = auth_service.request_password_reset(body.get("username"))
        return json_response(200, {"ok": True, **result})

    return None
