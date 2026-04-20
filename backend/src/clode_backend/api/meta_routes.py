from __future__ import annotations

from clode_backend.api.context import RequestContext
from clode_backend.api.http import json_response


def handle_meta_route(context: RequestContext):
    if context.method == "GET" and context.path == "/api/health":
        return json_response(200, {"ok": True, "service": "clode-backend"})

    if context.method == "GET" and context.path == "/api/v1/meta":
        return json_response(
            200,
            {
                "ok": True,
                "mode": "transition",
                "storage": "sql + reduced transitional store_documents",
                "stores": context.services.store_service.list_stores(),
            },
        )

    return None
