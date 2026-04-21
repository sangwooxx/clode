from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse

from clode_backend.api.cors import resolve_cors_origin
from clode_backend.auth.sessions import LEGACY_SESSION_HEADER_NAME, SESSION_HEADER_NAME
from clode_backend.config import Settings


@dataclass
class ApiRequest:
    method: str
    path: str
    query: dict[str, list[str]]
    headers: dict[str, str]
    _body_reader: Callable[[int], bytes] | None = None
    _body_cache: bytes | None = field(default=None, init=False, repr=False)

    def get_header(self, name: str, default: str | None = None) -> str | None:
        return self.headers.get(str(name or "").strip().lower(), default)

    def read_body(self, content_length: int) -> bytes:
        if self._body_cache is None:
            if self._body_reader is None:
                self._body_cache = b""
            else:
                self._body_cache = self._body_reader(content_length)
        return self._body_cache


def coerce_api_request(source: Any, *, path_override: str | None = None) -> ApiRequest:
    if isinstance(source, ApiRequest):
        if not path_override:
            return source
        parsed = urlparse(path_override)
        return ApiRequest(
            method=source.method,
            path=parsed.path.rstrip("/") or "/",
            query=parse_qs(parsed.query or ""),
            headers=dict(source.headers),
            _body_reader=lambda content_length: source.read_body(content_length),
        )

    raw_path = str(path_override or getattr(source, "path", "") or "/")
    parsed = urlparse(raw_path)
    raw_headers = getattr(source, "headers", {})
    headers = {
        str(key or "").strip().lower(): str(value or "").strip()
        for key, value in getattr(raw_headers, "items", lambda: [])()
    }
    method = str(getattr(source, "command", "GET") or "GET").strip().upper()

    return ApiRequest(
        method=method,
        path=parsed.path.rstrip("/") or "/",
        query=parse_qs(parsed.query or ""),
        headers=headers,
        _body_reader=lambda content_length: getattr(source, "rfile").read(max(content_length, 0)),
    )


def resolve_forwarded_api_path(raw_path: str) -> str:
    parsed = urlparse(str(raw_path or "/"))
    query_pairs = parse_qsl(parsed.query, keep_blank_values=True)
    routed_path = ""
    forwarded_query: list[tuple[str, str]] = []

    for key, value in query_pairs:
        if key == "__clode_path" and not routed_path:
            routed_path = value
            continue
        forwarded_query.append((key, value))

    normalized_path = f"/api/{routed_path.lstrip('/')}" if routed_path else parsed.path
    normalized_query = urlencode(forwarded_query, doseq=True)
    return f"{normalized_path}?{normalized_query}" if normalized_query else normalized_path


def send_handler_json_response(
    handler: Any,
    settings: Settings,
    status: int,
    payload: dict | None = None,
    extra_headers: dict[str, str | list[str] | tuple[str, ...]] | None = None,
) -> None:
    handler.send_response(status)
    cors_origin = resolve_cors_origin(
        settings,
        request_origin=getattr(handler, "headers", {}).get("Origin"),
        request_host=getattr(handler, "headers", {}).get("Host"),
    ) or ""
    if cors_origin:
        handler.send_header("Access-Control-Allow-Origin", cors_origin)
        handler.send_header(
            "Access-Control-Allow-Headers",
            f"Content-Type, {SESSION_HEADER_NAME}, {LEGACY_SESSION_HEADER_NAME}",
        )
        handler.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        handler.send_header("Access-Control-Allow-Credentials", "true")
        handler.send_header("Vary", "Origin")
    for header_name, header_value in (extra_headers or {}).items():
        values = header_value if isinstance(header_value, (list, tuple)) else [header_value]
        for value in values:
            handler.send_header(header_name, value)
    if status != 204:
        body = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8")
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.end_headers()
        handler.wfile.write(body)
        return
    handler.end_headers()
