from __future__ import annotations

from datetime import date
from typing import Any

from clode_backend.validation.common import parse_number, text, validate_iso_date


INVOICE_TYPES = {"cost", "sales"}
PAYMENT_STATUSES = {"unpaid", "paid", "overdue"}


def number(value: Any) -> float:
    return parse_number(value)


def normalize_invoice_type(value: Any) -> str:
    normalized = text(value).lower()
    if normalized not in INVOICE_TYPES:
        raise ValueError("Typ faktury musi byc ustawiony na cost lub sales.")
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
