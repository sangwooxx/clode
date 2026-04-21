from __future__ import annotations

import json
import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.api.routes import route_request
from clode_backend.api.transport import (
    coerce_api_request,
    resolve_forwarded_api_path,
    send_handler_json_response,
)
from clode_backend.app import create_runtime_context


@lru_cache(maxsize=1)
def get_runtime():
    return create_runtime_context()


class handler(BaseHTTPRequestHandler):
    server_version = "ClodeVercel/0.1"

    def _runtime(self):
        return get_runtime()

    def _settings(self):
        return self._runtime()["settings"]

    def _dispatch(self) -> None:
        runtime = self._runtime()
        request = coerce_api_request(self, path_override=resolve_forwarded_api_path(self.path))
        status, payload, headers = route_request(request, runtime["services"])
        send_handler_json_response(self, self._settings(), status, payload, headers)

    def do_OPTIONS(self) -> None:  # noqa: N802
        send_handler_json_response(self, self._settings(), 204)

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
