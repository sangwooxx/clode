from __future__ import annotations

import json


def json_response(status: int, payload: dict, headers: dict | None = None) -> tuple[int, dict, dict]:
    return status, payload, headers or {}


class RequestPayloadError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


MAX_JSON_BODY_BYTES = 1_048_576


def parse_json_body(handler) -> dict:
    raw_content_length = str(handler.headers.get("Content-Length", "0") or "0").strip()
    try:
        content_length = int(raw_content_length)
    except ValueError as error:
        raise RequestPayloadError("Nieprawidlowy naglowek Content-Length.") from error

    if content_length < 0:
        raise RequestPayloadError("Nieprawidlowy rozmiar tresci zapytania.")
    if not content_length:
        return {}
    if content_length > MAX_JSON_BODY_BYTES:
        raise RequestPayloadError(
            f"Body requestu przekracza limit {MAX_JSON_BODY_BYTES} bajtow.",
            status_code=413,
        )

    raw = handler.rfile.read(content_length)
    try:
        return json.loads(raw.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise RequestPayloadError("Body requestu musi byc kodowane jako UTF-8.") from error
    except json.JSONDecodeError as error:
        raise RequestPayloadError("Body requestu nie jest poprawnym JSON-em.") from error
