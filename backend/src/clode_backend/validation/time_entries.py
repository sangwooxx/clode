from __future__ import annotations

import json
import re
from typing import Any


MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")

FINANCE_KEYS = (
    "zus_company_1",
    "zus_company_2",
    "zus_company_3",
    "pit4_company_1",
    "pit4_company_2",
    "pit4_company_3",
    "payouts",
)


def text(value: Any) -> str:
    return str(value or "").strip()


def number(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def validate_month_key(value: Any) -> str:
    normalized = text(value)
    if not MONTH_KEY_RE.match(normalized):
        raise ValueError("Miesiąc musi mieć format RRRR-MM.")
    return normalized


def normalize_hours(value: Any) -> float:
    normalized = round(number(value), 2)
    if normalized < 0:
        raise ValueError("Liczba godzin nie może być ujemna.")
    return normalized


def normalize_contract_id(value: Any) -> str | None:
    normalized = text(value)
    if not normalized or normalized == "unassigned":
        return None
    return normalized


def normalize_employee_name(value: Any) -> str:
    normalized = text(value)
    if not normalized:
        raise ValueError("Pracownik jest wymagany.")
    return normalized


def normalize_visible_investments(values: Any) -> list[str]:
    if isinstance(values, str):
        try:
            values = json.loads(values)
        except Exception:
            values = [values]
    if not isinstance(values, list):
        return []

    result: list[str] = []
    seen = set()
    for item in values:
        contract_id = text(item)
        if not contract_id or contract_id in seen:
            continue
        seen.add(contract_id)
        result.append(contract_id)
    return result


def normalize_finance(value: Any) -> dict[str, float]:
    raw = value
    if isinstance(value, str):
        try:
            raw = json.loads(value)
        except Exception:
            raw = {}
    if not isinstance(raw, dict):
        raw = {}
    return {
        key: round(number(raw.get(key)), 2)
        for key in FINANCE_KEYS
    }
