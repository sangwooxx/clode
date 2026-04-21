from __future__ import annotations

from typing import Any

from clode_backend.validation.common import text, validate_iso_date


def normalize_employee_status(value: Any) -> str:
    return "inactive" if text(value).lower() == "inactive" else "active"


def split_legacy_employee_name(value: Any) -> tuple[str, str]:
    normalized = text(value)
    if not normalized:
        return "", ""

    parts = [part for part in normalized.split(" ") if part]
    if len(parts) == 1:
        return "", parts[0]

    return " ".join(parts[:-1]), parts[-1]
