from __future__ import annotations

from typing import Any


ALLOWED_CONTRACT_STATUSES = {"active", "archived"}
ALLOWED_COST_CATEGORIES = {"materials", "labor", "equipment", "transport", "services", "other"}
ALLOWED_TIME_SCOPES = {"all", "year", "month"}


def text(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def normalize_contract_status(value: Any) -> str:
    normalized = text(value).lower()
    if normalized in {"completed", "inactive", "deleted"}:
        return "archived"
    if normalized not in ALLOWED_CONTRACT_STATUSES:
        return "active"
    return normalized


def normalize_cost_category(value: Any, *, invoice_type: Any = "cost") -> str:
    if text(invoice_type).lower() != "cost":
        return ""
    normalized = text(value).lower()
    return normalized if normalized in ALLOWED_COST_CATEGORIES else "other"


def normalize_time_scope(scope: Any, year: Any = "", month: Any = "") -> dict[str, str]:
    normalized_scope = text(scope).lower() or "all"
    if normalized_scope not in ALLOWED_TIME_SCOPES:
        normalized_scope = "all"

    normalized_year = text(year)
    normalized_month = text(month).zfill(2) if text(month) else ""

    if normalized_scope == "month" and (not normalized_year or not normalized_month):
        raise ValueError("Zakres month wymaga podania roku i miesiaca.")
    if normalized_scope == "year" and not normalized_year:
        raise ValueError("Zakres year wymaga podania roku.")

    return {
        "scope": normalized_scope,
        "year": normalized_year,
        "month": normalized_month,
    }
