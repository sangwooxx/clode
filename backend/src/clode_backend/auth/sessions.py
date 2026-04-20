from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from http.cookies import SimpleCookie


SESSION_COOKIE_NAME = "clode_session"
SESSION_HEADER_NAME = "X-Clode-Session"
LEGACY_SESSION_COOKIE_NAME = "agent_session"
LEGACY_SESSION_HEADER_NAME = "X-Agent-Session"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_now_iso() -> str:
    return utc_now().replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _apply_cookie_security(cookie, cookie_name: str, secure: bool) -> None:
    cookie[cookie_name]["httponly"] = True
    cookie[cookie_name]["path"] = "/"
    cookie[cookie_name]["samesite"] = "Lax"
    if secure:
        cookie[cookie_name]["secure"] = True


def build_session_cookie(token: str, ttl_hours: int, *, secure: bool = False) -> str:
    cookie = SimpleCookie()
    cookie[SESSION_COOKIE_NAME] = token
    _apply_cookie_security(cookie, SESSION_COOKIE_NAME, secure)
    cookie[SESSION_COOKIE_NAME]["max-age"] = str(max(int(ttl_hours * 3600), 0))
    return cookie.output(header="").strip()


def _build_logout_cookie(cookie_name: str, *, secure: bool = False) -> str:
    cookie = SimpleCookie()
    cookie[cookie_name] = ""
    _apply_cookie_security(cookie, cookie_name, secure)
    cookie[cookie_name]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
    cookie[cookie_name]["max-age"] = "0"
    return cookie.output(header="").strip()


def build_logout_cookies(*, secure: bool = False) -> tuple[str, ...]:
    return (
        _build_logout_cookie(SESSION_COOKIE_NAME, secure=secure),
        _build_logout_cookie(LEGACY_SESSION_COOKIE_NAME, secure=secure),
    )


def build_legacy_logout_cookie(*, secure: bool = False) -> str:
    return _build_logout_cookie(LEGACY_SESSION_COOKIE_NAME, secure=secure)


def read_session_token(cookie_header: str | None) -> str:
    if not cookie_header:
        return ""
    cookie = SimpleCookie()
    cookie.load(cookie_header)
    morsel = cookie.get(SESSION_COOKIE_NAME) or cookie.get(LEGACY_SESSION_COOKIE_NAME)
    return morsel.value if morsel else ""


def read_session_token_from_headers(cookie_header: str | None, header_token: str | None) -> str:
    header_value = str(header_token or "").strip()
    if header_value:
        return header_value
    return read_session_token(cookie_header)


def session_expiry_iso(ttl_hours: int) -> str:
    expires_at = utc_now() + timedelta(hours=ttl_hours)
    return expires_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")

