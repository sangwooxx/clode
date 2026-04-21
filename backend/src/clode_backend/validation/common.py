from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any


def text(value: Any) -> str:
    return str(value or "").strip()


def parse_number(value: Any, *, field_name: str = "Pole liczbowe") -> float:
    normalized = text(value).replace(",", ".")
    if not normalized:
        return 0.0
    try:
        return float(Decimal(normalized))
    except (InvalidOperation, ValueError):
        raise ValueError(f"{field_name} musi byc poprawna liczba.") from None


def validate_iso_date(value: Any, field_name: str, *, required: bool = False) -> str:
    normalized = text(value)
    if not normalized:
        if required:
            raise ValueError(f"Pole {field_name} jest wymagane.")
        return ""
    try:
        return date.fromisoformat(normalized).isoformat()
    except ValueError:
        raise ValueError(f"Pole {field_name} musi miec format RRRR-MM-DD.") from None


def validate_month_key(value: Any, *, field_name: str = "Miesiac") -> str:
    normalized = text(value)
    parts = normalized.split("-", 1)
    if len(parts) != 2 or not parts[0].isdigit() or not parts[1].isdigit():
        raise ValueError(f"{field_name} musi miec format RRRR-MM.")
    year = int(parts[0])
    month = int(parts[1])
    try:
        return date(year, month, 1).strftime("%Y-%m")
    except ValueError:
        raise ValueError(f"{field_name} musi miec format RRRR-MM.") from None
