from __future__ import annotations

from urllib.parse import urlparse

from clode_backend.config import Settings


def resolve_cors_origin(
    settings: Settings,
    *,
    request_origin: str | None,
    request_host: str | None = None,
) -> str | None:
    origin = str(request_origin or "").strip()
    if not origin:
        return None

    origin_host = urlparse(origin).netloc.lower()
    host = str(request_host or "").strip().lower()

    if host and origin_host == host:
        return origin
    if origin in settings.allowed_origins:
        return origin
    return None
