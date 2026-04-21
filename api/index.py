from __future__ import annotations

import json
import sys
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = PROJECT_ROOT / "backend" / "src"
if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.api.routes import route_request
from clode_backend.api.cors import resolve_cors_origin
from clode_backend.app import create_runtime_context
from clode_backend.auth.sessions import LEGACY_SESSION_HEADER_NAME, SESSION_HEADER_NAME


@lru_cache(maxsize=1)
def get_runtime():
    return create_runtime_context()


class handler(BaseHTTPRequestHandler):
    server_version = "ClodeVercel/0.1"

    def _runtime(self):
        return get_runtime()

    def _settings(self):
        return self._runtime()["settings"]

    def _cors_origin(self) -> str:
        return resolve_cors_origin(
            self._settings(),
            request_origin=self.headers.get("Origin"),
            request_host=self.headers.get("Host"),
        ) or ""

    def _effective_path(self) -> str:
        parsed = urlparse(self.path)
        query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
        routed_path = ""
        forwarded_query: list[tuple[str, str]] = []

        for key, value in query_pairs:
            if key == "__clode_path" and not routed_path:
                routed_path = value
                continue
            forwarded_query.append((key, value))

        if routed_path:
            normalized_path = f"/api/{routed_path.lstrip('/')}"
        else:
            normalized_path = parsed.path

        normalized_query = urlencode(forwarded_query, doseq=True)
        return f"{normalized_path}?{normalized_query}" if normalized_query else normalized_path

    def _send(
        self,
        status: int,
        payload: dict | None = None,
        extra_headers: dict[str, str | list[str] | tuple[str, ...]] | None = None,
    ) -> None:
        self.send_response(status)
        cors_origin = self._cors_origin()
        if cors_origin:
            self.send_header("Access-Control-Allow-Origin", cors_origin)
            self.send_header(
                "Access-Control-Allow-Headers",
                f"Content-Type, {SESSION_HEADER_NAME}, {LEGACY_SESSION_HEADER_NAME}",
            )
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
            self.send_header("Access-Control-Allow-Credentials", "true")
            self.send_header("Vary", "Origin")
        for header_name, header_value in (extra_headers or {}).items():
            values = (
                header_value
                if isinstance(header_value, (list, tuple))
                else [header_value]
            )
            for value in values:
                self.send_header(header_name, value)
        if status != 204:
            body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.end_headers()

    def _dispatch(self) -> None:
        runtime = self._runtime()
        original_path = self.path
        self.path = self._effective_path()
        try:
            status, payload, headers = route_request(
                self,
                runtime["services"],
            )
        finally:
            self.path = original_path
        self._send(status, payload, headers)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204)

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
