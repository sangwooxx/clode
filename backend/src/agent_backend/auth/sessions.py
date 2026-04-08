from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from http.cookies import SimpleCookie


SESSION_COOKIE_NAME = "agent_session"
SESSION_HEADER_NAME = "X-Agent-Session"


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


def build_session_cookie(token: str, ttl_hours: int) -> str:
    cookie = SimpleCookie()
    cookie[SESSION_COOKIE_NAME] = token
    cookie[SESSION_COOKIE_NAME]["httponly"] = True
    cookie[SESSION_COOKIE_NAME]["path"] = "/"
    cookie[SESSION_COOKIE_NAME]["samesite"] = "Lax"
    cookie[SESSION_COOKIE_NAME]["max-age"] = str(max(int(ttl_hours * 3600), 0))
    return cookie.output(header="").strip()


def build_logout_cookie() -> str:
    cookie = SimpleCookie()
    cookie[SESSION_COOKIE_NAME] = ""
    cookie[SESSION_COOKIE_NAME]["httponly"] = True
    cookie[SESSION_COOKIE_NAME]["path"] = "/"
    cookie[SESSION_COOKIE_NAME]["samesite"] = "Lax"
    cookie[SESSION_COOKIE_NAME]["expires"] = "Thu, 01 Jan 1970 00:00:00 GMT"
    cookie[SESSION_COOKIE_NAME]["max-age"] = "0"
    return cookie.output(header="").strip()


def read_session_token(cookie_header: str | None) -> str:
    if not cookie_header:
        return ""
    cookie = SimpleCookie()
    cookie.load(cookie_header)
    morsel = cookie.get(SESSION_COOKIE_NAME)
    return morsel.value if morsel else ""


def read_session_token_from_headers(cookie_header: str | None, header_token: str | None) -> str:
    header_value = str(header_token or "").strip()
    if header_value:
        return header_value
    return read_session_token(cookie_header)


def session_expiry_iso(ttl_hours: int) -> str:
    expires_at = utc_now() + timedelta(hours=ttl_hours)
    return expires_at.replace(microsecond=0).isoformat().replace("+00:00", "Z")
