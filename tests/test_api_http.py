from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.api.http import MAX_JSON_BODY_BYTES, RequestPayloadError, parse_json_body  # noqa: E402


class _FakeHandler:
    def __init__(self, body: bytes, *, headers: dict[str, str] | None = None) -> None:
        self.headers = dict(headers or {})
        self.headers.setdefault("Content-Length", str(len(body)))
        self.rfile = io.BytesIO(body)


class ApiHttpTestCase(unittest.TestCase):
    def test_parse_json_body_returns_empty_dict_for_empty_body(self) -> None:
        handler = _FakeHandler(b"")
        self.assertEqual(parse_json_body(handler), {})

    def test_parse_json_body_rejects_invalid_content_length(self) -> None:
        handler = _FakeHandler(b"{}", headers={"Content-Length": "not-a-number"})
        with self.assertRaisesRegex(RequestPayloadError, "Content-Length"):
            parse_json_body(handler)

    def test_parse_json_body_rejects_oversized_request_body(self) -> None:
        handler = _FakeHandler(
            b"{}",
            headers={"Content-Length": str(MAX_JSON_BODY_BYTES + 1)},
        )
        with self.assertRaisesRegex(RequestPayloadError, "przekracza limit"):
            parse_json_body(handler)

    def test_parse_json_body_rejects_non_utf8_payloads(self) -> None:
        handler = _FakeHandler(b"\xff", headers={"Content-Length": "1"})
        with self.assertRaisesRegex(RequestPayloadError, "UTF-8"):
            parse_json_body(handler)

    def test_parse_json_body_rejects_invalid_json(self) -> None:
        handler = _FakeHandler(b"{", headers={"Content-Length": "1"})
        with self.assertRaisesRegex(RequestPayloadError, "JSON-em"):
            parse_json_body(handler)


if __name__ == "__main__":
    unittest.main()
