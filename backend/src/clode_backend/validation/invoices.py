from __future__ import annotations

import re
from datetime import date
from typing import Any


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
INVOICE_TYPES = {"cost", "sales"}
PAYMENT_STATUSES = {"unpaid", "paid", "overdue"}


def text(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def validate_iso_date(value: Any, field_name: str, *, required: bool = False) -> str:
    normalized = text(value)
    if not normalized:
        if required:
            raise ValueError(f"Pole {field_name} jest wymagane.")
        return ""
    if not DATE_RE.match(normalized):
        raise ValueError(f"Pole {field_name} musi mieć format RRRR-MM-DD.")
    return normalized


def normalize_invoice_type(value: Any) -> str:
    normalized = text(value).lower()
    if normalized not in INVOICE_TYPES:
        raise ValueError("Typ faktury musi być ustawiony na cost lub sales.")
    return normalized


def normalize_payment_status(value: Any, *, due_date: str = "", payment_date: str = "") -> str:
    if payment_date:
        return "paid"
    normalized = text(value).lower() or "unpaid"
    if normalized not in PAYMENT_STATUSES:
        normalized = "unpaid"
    if normalized != "paid" and due_date and due_date < date.today().isoformat():
        return "overdue"
    return normalized
