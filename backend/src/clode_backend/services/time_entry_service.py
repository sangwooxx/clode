from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import normalize_role
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.validation.time_entries import (
    normalize_contract_id,
    normalize_employee_name,
    normalize_finance,
    normalize_hours,
    normalize_visible_investments,
    text,
    validate_month_key,
)


class TimeEntryServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class TimeEntryService:
    def __init__(
        self,
        repository: TimeEntryRepository,
        contract_repository: ContractRepository,
        employee_repository: EmployeeRepository,
    ) -> None:
        self.repository = repository
        self.contract_repository = contract_repository
        self.employee_repository = employee_repository

    def ensure_read_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise TimeEntryServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", normalize_role("ksiegowosc"), "kierownik", "read-only"}:
            raise TimeEntryServiceError("Brak uprawnień do podglądu ewidencji czasu pracy.", status_code=403)

    def ensure_write_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise TimeEntryServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", "kierownik"}:
            raise TimeEntryServiceError("Brak uprawnień do edycji ewidencji czasu pracy.", status_code=403)

    def list_time_entries(self, filters: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        self._normalize_legacy_month_contract_links()
        normalized_filters = self._normalize_filters(filters)
        entries = self.repository.list_entries(normalized_filters)
        months = self.repository.list_months()
        return {
            "entries": entries,
            "months": months,
            "aggregates": self._build_aggregates(entries),
            "filters": normalized_filters,
        }

    def list_employees(self, current_user: dict[str, Any] | None) -> list[dict[str, Any]]:
        self.ensure_read_access(current_user)
        return self.employee_repository.list_all()

    def create_time_entry(self, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized = self._normalize_entry_payload(payload)
        existing = self.repository.find_entry(
            month_key=normalized["month_key"],
            employee_id=normalized.get("employee_id"),
            employee_name=normalized["employee_name"],
            contract_id=normalized.get("contract_id"),
        )
        if existing:
            normalized["id"] = existing["id"]
            normalized["month_id"] = existing["month_id"]
            updated = self.repository.update_entry(existing["id"], normalized)
            self._recalculate_month_costs(normalized["month_key"])
            return self.repository.get_entry(existing["id"]) or updated or normalized

        month = self._ensure_month(normalized["month_key"])
        normalized["id"] = f"time-entry-{uuid4().hex}"
        normalized["month_id"] = month["id"]
        created = self.repository.insert_entry(normalized)
        self._recalculate_month_costs(normalized["month_key"])
        return self.repository.get_entry(created["id"]) or created

    def update_time_entry(self, entry_id: str, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        existing = self.repository.get_entry(entry_id)
        if not existing:
            raise TimeEntryServiceError("Nie znaleziono wpisu czasu pracy.", status_code=404)
        normalized = self._normalize_entry_payload(payload, existing=existing)
        target_month = self._ensure_month(normalized["month_key"])
        normalized["id"] = existing["id"]
        normalized["month_id"] = target_month["id"]
        updated = self.repository.update_entry(entry_id, normalized)
        self._recalculate_month_costs(existing["month_key"])
        if existing["month_key"] != normalized["month_key"]:
            self._recalculate_month_costs(normalized["month_key"])
        return self.repository.get_entry(entry_id) or updated or normalized

    def delete_time_entry(self, entry_id: str, current_user: dict[str, Any] | None) -> None:
        self.ensure_write_access(current_user)
        existing = self.repository.get_entry(entry_id)
        if not existing:
            return
        self.repository.delete_entry(entry_id)
        self._recalculate_month_costs(existing["month_key"])

    def create_month(self, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized = self._normalize_month_payload(payload)
        return self.repository.upsert_month(normalized)

    def update_month(self, month_key: str, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        existing = self.repository.get_month_by_key(month_key)
        if not existing:
            raise TimeEntryServiceError("Nie znaleziono miesiąca.", status_code=404)
        normalized = self._normalize_month_payload({**existing, **payload, "month_key": month_key}, existing=existing)
        updated = self.repository.upsert_month(normalized)
        self._recalculate_month_costs(month_key)
        return updated

    def delete_month(self, month_key: str, current_user: dict[str, Any] | None) -> None:
        self.ensure_write_access(current_user)
        self.repository.delete_month(validate_month_key(month_key))

    def _normalize_filters(self, filters: dict[str, Any]) -> dict[str, Any]:
        month_key = text(filters.get("month"))
        if month_key:
            month_key = validate_month_key(month_key)
        contract_id = text(filters.get("contract_id"))
        if contract_id and contract_id != "unassigned" and not self.contract_repository.get_by_id(contract_id):
            raise TimeEntryServiceError("Nie znaleziono kontraktu dla wskazanego identyfikatora.", status_code=404)
        return {
            "month": month_key,
            "contract_id": contract_id,
            "employee_id": text(filters.get("employee_id")),
            "employee_name": text(filters.get("employee_name")),
            "user": text(filters.get("user")),
        }

    def _normalize_entry_payload(self, payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        month_key = validate_month_key(
            payload.get("month_key") if payload.get("month_key") is not None else existing.get("month_key") if existing else ""
        )
        employee_name = normalize_employee_name(
            payload.get("employee_name") if payload.get("employee_name") is not None else existing.get("employee_name") if existing else ""
        )
        hours = normalize_hours(payload.get("hours") if payload.get("hours") is not None else existing.get("hours") if existing else 0)
        employee_id = text(payload.get("employee_id") if payload.get("employee_id") is not None else existing.get("employee_id") if existing else "") or None
        contract_id = normalize_contract_id(
            payload.get("contract_id") if payload.get("contract_id") is not None else existing.get("contract_id") if existing else ""
        )
        contract_name = text(payload.get("contract_name") if payload.get("contract_name") is not None else existing.get("contract_name") if existing else "")

        if contract_id:
            contract = self.contract_repository.get_by_id(contract_id)
            if not contract:
                raise TimeEntryServiceError("Nie znaleziono kontraktu dla wskazanego identyfikatora.", status_code=404)
            if text(contract.get("status")) == "archived":
                raise TimeEntryServiceError("Nie można przypisać nowych godzin do zarchiwizowanego kontraktu.", status_code=409)
            contract_name = contract["name"]
        else:
            contract_name = contract_name or "Nieprzypisane"

        return {
            "id": existing["id"] if existing else "",
            "month_key": month_key,
            "employee_id": employee_id,
            "employee_name": employee_name,
            "contract_id": contract_id,
            "contract_name": contract_name,
            "hours": hours,
            "cost_amount": float(existing.get("cost_amount") or 0) if existing else 0.0,
        }

    def _normalize_month_payload(self, payload: dict[str, Any], existing: dict[str, Any] | None = None) -> dict[str, Any]:
        month_key = validate_month_key(payload.get("month_key") if payload.get("month_key") is not None else existing.get("month_key") if existing else "")
        visible_investments = normalize_visible_investments(
            payload.get("visible_investments") if payload.get("visible_investments") is not None else existing.get("visible_investments") if existing else []
        )
        active_contract_ids = {
            text(contract.get("id"))
            for contract in self.contract_repository.list_all(include_archived=False)
            if text(contract.get("id"))
        }
        visible_investments = [contract_id for contract_id in visible_investments if contract_id in active_contract_ids]

        return {
            "id": existing.get("id") if existing else payload.get("id"),
            "month_key": month_key,
            "month_label": text(payload.get("month_label") if payload.get("month_label") is not None else existing.get("month_label") if existing else "") or month_key,
            "selected": bool(payload.get("selected") if payload.get("selected") is not None else existing.get("selected") if existing else False),
            "visible_investments": visible_investments,
            "finance": normalize_finance(payload.get("finance") if payload.get("finance") is not None else existing.get("finance") if existing else {}),
        }

    def _ensure_month(self, month_key: str) -> dict[str, Any]:
        existing = self.repository.get_month_by_key(month_key)
        if existing:
            return existing
        return self.repository.upsert_month(
            {
                "month_key": month_key,
                "month_label": month_key,
                "selected": False,
                "visible_investments": [],
                "finance": normalize_finance({}),
            }
        )

    def _recalculate_month_costs(self, month_key: str) -> None:
        month = self.repository.get_month_by_key(month_key)
        if not month:
            return
        entries = self.repository.list_entries_for_month(month_key)
        total_hours = sum(float(entry.get("hours") or 0) for entry in entries)
        finance = normalize_finance(month.get("finance") or {})
        total_cost_pool = (
            finance["payouts"]
            + finance["zus_company_1"]
            + finance["zus_company_2"]
            + finance["zus_company_3"]
            + finance["pit4_company_1"]
            + finance["pit4_company_2"]
            + finance["pit4_company_3"]
        )
        hourly_cost = (total_cost_pool / total_hours) if total_hours else 0.0
        for entry in entries:
            self.repository.update_entry_cost_amount(entry["id"], round(float(entry.get("hours") or 0) * hourly_cost, 2))

    def _build_aggregates(self, entries: list[dict[str, Any]]) -> dict[str, Any]:
        per_contract: dict[str, dict[str, Any]] = {}
        per_month: dict[str, dict[str, Any]] = {}
        for entry in entries:
            contract_key = entry["contract_id"] or "unassigned"
            month_key = entry["month_key"]
            contract_bucket = per_contract.setdefault(
                contract_key,
                {
                    "contract_id": contract_key if contract_key != "unassigned" else "",
                    "contract_name": entry["contract_name"] or "Nieprzypisane",
                    "hours_total": 0.0,
                    "cost_total": 0.0,
                    "entries_count": 0,
                },
            )
            contract_bucket["hours_total"] += float(entry["hours"] or 0)
            contract_bucket["cost_total"] += float(entry["cost_amount"] or 0)
            contract_bucket["entries_count"] += 1

            month_bucket = per_month.setdefault(
                month_key,
                {
                    "month_key": month_key,
                    "month_label": entry["month_label"] or month_key,
                    "hours_total": 0.0,
                    "cost_total": 0.0,
                    "entries_count": 0,
                },
            )
            month_bucket["hours_total"] += float(entry["hours"] or 0)
            month_bucket["cost_total"] += float(entry["cost_amount"] or 0)
            month_bucket["entries_count"] += 1

        return {
            "per_contract": [
                {
                    **bucket,
                    "hours_total": round(bucket["hours_total"], 2),
                    "cost_total": round(bucket["cost_total"], 2),
                }
                for bucket in per_contract.values()
            ],
            "per_month": [
                {
                    **bucket,
                    "hours_total": round(bucket["hours_total"], 2),
                    "cost_total": round(bucket["cost_total"], 2),
                }
                for bucket in sorted(per_month.values(), key=lambda item: item["month_key"], reverse=True)
            ],
        }

    def _normalize_legacy_month_contract_links(self) -> None:
        contracts = self.contract_repository.list_all(include_archived=True)
        valid_ids = {text(contract.get("id")) for contract in contracts if text(contract.get("id"))}
        name_to_ids: dict[str, set[str]] = {}
        for contract in contracts:
            contract_name = text(contract.get("name"))
            contract_id = text(contract.get("id"))
            if not contract_name or not contract_id:
                continue
            name_to_ids.setdefault(contract_name, set()).add(contract_id)

        unique_name_map = {
            name: next(iter(ids))
            for name, ids in name_to_ids.items()
            if len(ids) == 1
        }

        normalized_rows: list[dict[str, Any]] = []
        changed = False
        for month in self.repository.list_months():
            current_values = normalize_visible_investments(month.get("visible_investments"))
            next_values: list[str] = []
            seen = set()
            for value in current_values:
                contract_id = value if value in valid_ids else unique_name_map.get(value)
                if not contract_id or contract_id in seen:
                    if contract_id != value:
                        changed = True
                    continue
                if contract_id != value:
                    changed = True
                seen.add(contract_id)
                next_values.append(contract_id)
            if next_values != current_values:
                changed = True
            normalized_rows.append(
                {
                    **month,
                    "visible_investments": next_values,
                }
            )

        if changed:
            self.repository.normalize_month_visible_investments(normalized_rows)

