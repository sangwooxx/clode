from __future__ import annotations

import re
from typing import Any


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def text(value: Any) -> str:
    return str(value or "").strip()


def normalize_employee_status(value: Any) -> str:
    return "inactive" if text(value).lower() == "inactive" else "active"


def validate_iso_date(value: Any, field_name: str, *, required: bool = False) -> str:
    normalized = text(value)
    if not normalized:
        if required:
            raise ValueError(f"Pole {field_name} jest wymagane.")
        return ""
    if not DATE_RE.match(normalized):
        raise ValueError(f"Pole {field_name} musi miec format RRRR-MM-DD.")
    return normalized


def split_legacy_employee_name(value: Any) -> tuple[str, str]:
    normalized = text(value)
    if not normalized:
        return "", ""

    parts = [part for part in normalized.split(" ") if part]
    if len(parts) == 1:
        return "", parts[0]

    return " ".join(parts[:-1]), parts[-1]
