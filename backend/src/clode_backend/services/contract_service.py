from __future__ import annotations

from calendar import monthrange
from datetime import date
from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import can_access_view, can_manage_view
from clode_backend.auth.sessions import utc_now_iso
from clode_backend.repositories.contract_control_repository import ContractControlRepository
from clode_backend.repositories.contract_metrics_repository import ALLOWED_COST_CATEGORIES, ContractMetricsRepository
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract
from clode_backend.validation.common import text
from clode_backend.validation.contracts import normalize_contract_status, normalize_time_scope, number
from clode_backend.validation.invoices import validate_iso_date


ACTUAL_COST_WARNING_RATIO = 0.03
ACTUAL_COST_CRITICAL_RATIO = 0.10
OVERDUE_CRITICAL_DAYS = 30
STALE_FINANCIAL_DAYS = 30
STALE_OPERATIONAL_DAYS = 21


class ContractServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _normalize_optional_number(value: Any, *, field_name: str) -> float | None:
    normalized = text(value).replace(",", ".")
    if not normalized:
        return None
    parsed = number(normalized)
    if parsed < 0:
        raise ContractServiceError(f"{field_name} nie może być ujemny.")
    return round(parsed, 2)


def _safe_iso_date(value: Any) -> date | None:
    normalized = text(value)
    if not normalized:
        return None
    try:
        return date.fromisoformat(normalized[:10])
    except ValueError:
        return None


def _month_key_to_period_end(value: str | None) -> date | None:
    normalized = text(value)
    if not normalized:
        return None
    parts = normalized.split("-", 1)
    if len(parts) != 2:
        return None
    try:
        year = int(parts[0])
        month = int(parts[1])
        return date(year, month, monthrange(year, month)[1])
    except ValueError:
        return None


def _round_money(value: float | None) -> float | None:
    if value is None:
        return None
    return round(float(value or 0), 2)


def _calculate_margin_percent(*, revenue_total: float | None, margin: float | None) -> float | None:
    if revenue_total is None or margin is None:
        return None
    if abs(revenue_total) < 0.005:
        return None
    return round((margin / revenue_total) * 100, 2)


class ContractService:
    def __init__(
        self,
        repository: ContractRepository,
        metrics_repository: ContractMetricsRepository,
        time_entry_repository: TimeEntryRepository | None = None,
        control_repository: ContractControlRepository | None = None,
    ) -> None:
        self.repository = repository
        self.metrics_repository = metrics_repository
        self.time_entry_repository = time_entry_repository
        self.control_repository = control_repository

    def ensure_read_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise ContractServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_access_view(current_user.get("role"), current_user.get("permissions"), "contractsView"):
            raise ContractServiceError("Brak uprawnień do podglądu kontraktów.", status_code=403)

    def ensure_write_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise ContractServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_manage_view(current_user.get("role"), current_user.get("permissions"), "contractsView"):
            raise ContractServiceError("Brak uprawnień do zarządzania kontraktami.", status_code=403)

    def list_contracts(self, current_user: dict[str, Any] | None, *, include_archived: bool = True) -> list[dict[str, Any]]:
        self.ensure_read_access(current_user)
        return self.repository.list_all(include_archived=include_archived)

    def create_contract(self, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized = self._normalize_payload(payload)
        with self.repository.connect() as connection:
            created = self.repository.insert(normalized, connection=connection)
            self._sync_contract_visibility(
                created["id"],
                make_visible=normalize_contract_status(created.get("status")) == "active",
                connection=connection,
            )
            connection.commit()
        return created

    def update_contract(self, contract_id: str, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        existing = self.repository.get_by_id(contract_id)
        if not existing:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        normalized = self._normalize_payload(payload, existing=existing)
        with self.repository.connect() as connection:
            updated = self.repository.update(contract_id, normalized, connection=connection)
            if not updated:
                raise ContractServiceError("Nie udało się zapisać kontraktu.", status_code=500)
            self._sync_contract_visibility(
                updated["id"],
                make_visible=normalize_contract_status(updated.get("status")) == "active",
                connection=connection,
            )
            connection.commit()
        return updated

    def get_contract(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        return contract

    def get_contract_snapshot(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)

        normalized_range = {"scope": "all", "year": "", "month": ""}
        with self.repository.connect() as connection:
            contract = self.repository.get_by_id(contract_id, connection=connection)
            if not contract:
                raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
            metrics = self.metrics_repository.calculate_contract_metrics(contract_id, normalized_range, connection)
            monthly_breakdown = self.metrics_repository.list_contract_monthly_breakdown(contract_id, normalized_range, connection)
            activity_dates = self.metrics_repository.get_contract_activity_dates(contract_id, connection)
            usage_counts = self.repository.get_usage_counts(contract_id, connection=connection)
            control = (
                self.control_repository.get_by_contract_id(contract_id, connection=connection)
                if self.control_repository
                else None
            )

        actual = self._build_actual(metrics)
        control_state = self._build_control_state(contract, control)
        plan = self._build_plan(contract, control_state)
        forecast = self._build_forecast(contract, control_state, plan)
        variance = self._build_variance(plan, actual)
        activity = self._build_activity(metrics, usage_counts)
        freshness = self._build_freshness(activity_dates)
        alerts = self._build_alerts(
            contract=contract,
            actual=actual,
            plan=plan,
            forecast=forecast,
            activity=activity,
            freshness=freshness,
        )
        health = self._build_health(alerts)

        return {
            "contract": contract,
            "metrics": metrics,
            "activity": activity,
            "monthly_breakdown": monthly_breakdown,
            "control": control_state,
            "plan": plan,
            "actual": actual,
            "forecast": forecast,
            "variance": variance,
            "freshness": freshness,
            "health": health,
            "alerts": alerts,
            "snapshot_generated_at": utc_now_iso(),
        }

    def update_contract_control(
        self,
        contract_id: str,
        payload: dict[str, Any],
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        if not self.control_repository:
            raise ContractServiceError("Repozytorium kontroli kontraktu nie jest skonfigurowane.", status_code=500)

        existing_contract = self.repository.get_by_id(contract_id)
        if not existing_contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)

        normalized = self._normalize_control_payload(
            contract_id,
            payload,
            existing=self.control_repository.get_by_contract_id(contract_id),
            current_user=current_user,
        )
        with self.repository.connect() as connection:
            self.control_repository.upsert(normalized, connection=connection)
            connection.commit()
        return self.get_contract_snapshot(contract_id, current_user)

    def archive_contract(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        with self.repository.connect() as connection:
            archived = self.repository.archive(contract_id, updated_at=utc_now_iso(), connection=connection)
            if not archived:
                raise ContractServiceError("Nie udało się zarchiwizować kontraktu.", status_code=500)
            self._sync_contract_visibility(contract_id, make_visible=False, connection=connection)
            connection.commit()
        return archived

    def delete_contract(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        if normalize_contract_status(contract.get("status")) != "archived":
            raise ContractServiceError("Kontrakt musi zostać najpierw zarchiwizowany.", status_code=400)
        usage = self.repository.get_usage_counts(contract_id)
        if any(int(usage.get(key) or 0) > 0 for key in ("hours_entries", "invoices", "planning")):
            raise ContractServiceError(
                "Nie można trwale usunąć zarchiwizowanego kontraktu z danymi historycznymi. Pozostaw go jako zarchiwizowany albo usuń najpierw powiązane dane.",
                status_code=409,
            )
        with self.repository.connect() as connection:
            deleted = self.repository.delete(contract_id, deleted_at=utc_now_iso(), connection=connection)
            if not deleted:
                raise ContractServiceError("Nie udało się usunąć kontraktu.", status_code=500)
            self._sync_contract_visibility(contract_id, make_visible=False, connection=connection)
            connection.commit()
        return {
            "id": contract_id,
            "deleted": True,
        }

    def bulk_archive_contracts(self, contract_ids: list[str], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized_ids = [text(contract_id) for contract_id in contract_ids if text(contract_id)]
        if not normalized_ids:
            return {"archived_count": 0, "contracts": []}

        with self.repository.connect() as connection:
            archived_count = self.repository.bulk_archive(normalized_ids, updated_at=utc_now_iso(), connection=connection)
            for contract_id in normalized_ids:
                self._sync_contract_visibility(contract_id, make_visible=False, connection=connection)
            refreshed = self.repository.list_all(include_archived=True, connection=connection)
            connection.commit()
        archived = [contract for contract in refreshed if contract["id"] in set(normalized_ids)]
        return {
            "archived_count": archived_count,
            "contracts": archived,
        }

    def get_contract_usage(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        usage_counts = self.repository.get_usage_counts(contract_id)
        metrics = self.metrics_repository.calculate_contract_metrics(
            contract_id,
            {"scope": "all", "year": "", "month": ""},
        )
        usage = {
            "invoices": int(usage_counts.get("invoices") or 0),
            "hours": round(float(metrics.get("labor_hours_total") or 0), 2),
            "hours_entries": int(usage_counts.get("hours_entries") or 0),
            "planning": int(usage_counts.get("planning") or 0),
        }
        return {
            "contract": contract,
            "usage": usage,
            "has_operational_data": any(
                [
                    usage["invoices"] > 0,
                    usage["hours_entries"] > 0,
                    usage["planning"] > 0,
                ]
            ),
        }

    def calculate_contract_metrics(
        self,
        contract_id: str,
        time_range: dict[str, Any],
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        normalized_range = normalize_time_scope(
            time_range.get("scope"),
            time_range.get("year"),
            time_range.get("month"),
        )
        if contract_id != "unassigned":
            contract = self.repository.get_by_id(contract_id)
            if not contract:
                raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        else:
            contract = {
                "id": "unassigned",
                "name": "unassigned",
                "status": "active",
            }
        metrics = self.metrics_repository.calculate_contract_metrics(contract_id, normalized_range)
        return {
            "contract": contract,
            "range": normalized_range,
            "metrics": metrics,
        }

    def calculate_dashboard_snapshot(
        self,
        time_range: dict[str, Any],
        current_user: dict[str, Any] | None,
        *,
        include_archived: bool = False,
    ) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        normalized_range = normalize_time_scope(
            time_range.get("scope"),
            time_range.get("year"),
            time_range.get("month"),
        )
        contracts = self.repository.list_all(include_archived=include_archived)
        contract_items = []
        with self.metrics_repository.connect() as connection:
            for contract in contracts:
                metrics = self.metrics_repository.calculate_contract_metrics(contract["id"], normalized_range, connection)
                monthly_breakdown = self.metrics_repository.list_contract_monthly_breakdown(contract["id"], normalized_range, connection)
                contract_items.append({
                    "contract": contract,
                    "metrics": metrics,
                    "monthly_breakdown": monthly_breakdown,
                })
            totals = {
                "revenue_total": round(sum(float(item["metrics"].get("revenue_total") or 0) for item in contract_items), 2),
                "invoice_cost_total": round(sum(float(item["metrics"].get("invoice_cost_total") or 0) for item in contract_items), 2),
                "labor_cost_total": round(sum(float(item["metrics"].get("labor_cost_total") or 0) for item in contract_items), 2),
                "labor_hours_total": round(sum(float(item["metrics"].get("labor_hours_total") or 0) for item in contract_items), 2),
                "cost_total": round(sum(float(item["metrics"].get("cost_total") or 0) for item in contract_items), 2),
                "margin": round(sum(float(item["metrics"].get("margin") or 0) for item in contract_items), 2),
                "invoice_count": int(sum(int(item["metrics"].get("invoice_count") or 0) for item in contract_items)),
                "cost_invoice_count": int(sum(int(item["metrics"].get("cost_invoice_count") or 0) for item in contract_items)),
                "sales_invoice_count": int(sum(int(item["metrics"].get("sales_invoice_count") or 0) for item in contract_items)),
                "cost_by_category": {
                    category: round(
                        sum(float(item["metrics"].get("cost_by_category", {}).get(category) or 0) for item in contract_items),
                        2,
                    )
                    for category in ALLOWED_COST_CATEGORIES
                },
            }
            unassigned = self.metrics_repository.calculate_contract_metrics("unassigned", normalized_range, connection)
            unassigned_invoices = self.metrics_repository.list_unassigned_invoices(normalized_range, connection)
            unmatched_hours = self.metrics_repository.list_unmatched_hours(normalized_range, connection)
        return {
            "range": normalized_range,
            "contracts": contract_items,
            "unassigned": unassigned,
            "unassigned_invoices": unassigned_invoices,
            "unmatched_hours": unmatched_hours,
            "totals": totals,
        }

    def _normalize_payload(self, payload: dict[str, Any], *, existing: dict[str, Any] | None = None) -> dict[str, Any]:
        name = text(payload.get("name") if payload.get("name") is not None else existing.get("name") if existing else "")
        if not name:
            raise ContractServiceError("Nazwa kontraktu jest wymagana.")

        signed_date = validate_iso_date(
            payload.get("signed_date") if payload.get("signed_date") is not None else existing.get("signed_date") if existing else "",
            "Data podpisania",
            required=False,
        )
        end_date = validate_iso_date(
            payload.get("end_date") if payload.get("end_date") is not None else existing.get("end_date") if existing else "",
            "Termin zakonczenia",
            required=False,
        )
        if signed_date and end_date and end_date < signed_date:
            raise ContractServiceError("Termin zakończenia nie może być wcześniejszy niż data podpisania.")

        contract_value = number(payload.get("contract_value") if payload.get("contract_value") is not None else existing.get("contract_value") if existing else 0)
        if contract_value < 0:
            raise ContractServiceError("Kwota kontraktu nie może być ujemna.")

        timestamp = utc_now_iso()
        record = {
            "id": existing["id"] if existing else f"contract-{uuid4().hex}",
            "contract_number": text(payload.get("contract_number") if payload.get("contract_number") is not None else existing.get("contract_number") if existing else ""),
            "name": name,
            "investor": text(payload.get("investor") if payload.get("investor") is not None else existing.get("investor") if existing else ""),
            "signed_date": signed_date,
            "end_date": end_date,
            "contract_value": round(contract_value, 2),
            "status": normalize_contract_status(payload.get("status") if payload.get("status") is not None else existing.get("status") if existing else "active"),
            "created_at": existing.get("created_at") if existing else timestamp,
            "updated_at": timestamp,
        }
        try:
            validate_shared_contract("contract", record)
        except ContractValidationError as error:
            raise ContractServiceError(str(error)) from error
        return record

    def _normalize_control_payload(
        self,
        contract_id: str,
        payload: dict[str, Any],
        *,
        existing: dict[str, Any] | None = None,
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        current = existing or {}
        return {
            "contract_id": contract_id,
            "planned_revenue_total": _normalize_optional_number(
                payload.get("planned_revenue_total", current.get("planned_revenue_total")),
                field_name="Planowany przychód",
            ),
            "planned_invoice_cost_total": _normalize_optional_number(
                payload.get("planned_invoice_cost_total", current.get("planned_invoice_cost_total")),
                field_name="Planowany koszt fakturowy",
            ),
            "planned_labor_cost_total": _normalize_optional_number(
                payload.get("planned_labor_cost_total", current.get("planned_labor_cost_total")),
                field_name="Planowany koszt pracy",
            ),
            "forecast_revenue_total": _normalize_optional_number(
                payload.get("forecast_revenue_total", current.get("forecast_revenue_total")),
                field_name="Forecast przychodu",
            ),
            "forecast_invoice_cost_total": _normalize_optional_number(
                payload.get("forecast_invoice_cost_total", current.get("forecast_invoice_cost_total")),
                field_name="Forecast kosztu fakturowego",
            ),
            "forecast_labor_cost_total": _normalize_optional_number(
                payload.get("forecast_labor_cost_total", current.get("forecast_labor_cost_total")),
                field_name="Forecast kosztu pracy",
            ),
            "note": text(payload.get("note") if payload.get("note") is not None else current.get("note")),
            "updated_at": utc_now_iso(),
            "updated_by": text(
                (current_user or {}).get("displayName")
                or (current_user or {}).get("name")
                or (current_user or {}).get("username")
                or (current_user or {}).get("id")
            ),
        }

    def _build_control_state(self, contract: dict[str, Any], control: dict[str, Any] | None) -> dict[str, Any]:
        return {
            "contract_id": contract["id"],
            "planned_revenue_total": control.get("planned_revenue_total") if control else None,
            "planned_invoice_cost_total": control.get("planned_invoice_cost_total") if control else None,
            "planned_labor_cost_total": control.get("planned_labor_cost_total") if control else None,
            "forecast_revenue_total": control.get("forecast_revenue_total") if control else None,
            "forecast_invoice_cost_total": control.get("forecast_invoice_cost_total") if control else None,
            "forecast_labor_cost_total": control.get("forecast_labor_cost_total") if control else None,
            "note": control.get("note") if control else "",
            "updated_at": control.get("updated_at") if control else "",
            "updated_by": control.get("updated_by") if control else "",
        }

    def _build_actual(self, metrics: dict[str, Any]) -> dict[str, Any]:
        revenue_total = round(float(metrics.get("revenue_total") or 0), 2)
        invoice_cost_total = round(float(metrics.get("invoice_cost_total") or 0), 2)
        labor_cost_total = round(float(metrics.get("labor_cost_total") or 0), 2)
        total_cost = round(float(metrics.get("cost_total") or 0), 2)
        margin = round(float(metrics.get("margin") or 0), 2)
        return {
            "revenue_total": revenue_total,
            "invoice_cost_total": invoice_cost_total,
            "labor_cost_total": labor_cost_total,
            "total_cost": total_cost,
            "margin": margin,
            "margin_percent": _calculate_margin_percent(revenue_total=revenue_total, margin=margin),
            "labor_hours_total": round(float(metrics.get("labor_hours_total") or 0), 2),
            "invoice_count": int(metrics.get("invoice_count") or 0),
        }

    def _build_plan(self, contract: dict[str, Any], control: dict[str, Any]) -> dict[str, Any]:
        planned_revenue_total = _round_money(control.get("planned_revenue_total"))
        revenue_source = "manual"
        if planned_revenue_total is None:
            contract_value = round(float(contract.get("contract_value") or 0), 2)
            if contract_value > 0:
                planned_revenue_total = contract_value
                revenue_source = "contract_value"
            else:
                revenue_source = "missing"

        planned_invoice_cost_total = _round_money(control.get("planned_invoice_cost_total"))
        planned_labor_cost_total = _round_money(control.get("planned_labor_cost_total"))
        is_configured = (
            planned_revenue_total is not None
            and planned_invoice_cost_total is not None
            and planned_labor_cost_total is not None
        )
        planned_total_cost = (
            round((planned_invoice_cost_total or 0) + (planned_labor_cost_total or 0), 2)
            if is_configured
            else None
        )
        planned_margin = (
            round((planned_revenue_total or 0) - (planned_total_cost or 0), 2) if is_configured else None
        )
        return {
            "is_configured": is_configured,
            "revenue_total": planned_revenue_total,
            "invoice_cost_total": planned_invoice_cost_total,
            "labor_cost_total": planned_labor_cost_total,
            "total_cost": planned_total_cost,
            "margin": planned_margin,
            "margin_percent": _calculate_margin_percent(
                revenue_total=planned_revenue_total,
                margin=planned_margin,
            ),
            "revenue_source": revenue_source,
        }

    def _build_forecast(
        self,
        contract: dict[str, Any],
        control: dict[str, Any],
        plan: dict[str, Any],
    ) -> dict[str, Any]:
        forecast_invoice_cost_total = _round_money(control.get("forecast_invoice_cost_total"))
        forecast_labor_cost_total = _round_money(control.get("forecast_labor_cost_total"))
        forecast_revenue_total = _round_money(control.get("forecast_revenue_total"))
        revenue_source = "manual"
        if forecast_revenue_total is None:
            if plan.get("revenue_total") is not None:
                forecast_revenue_total = plan.get("revenue_total")
                revenue_source = "planned_revenue"
            else:
                contract_value = round(float(contract.get("contract_value") or 0), 2)
                if contract_value > 0:
                    forecast_revenue_total = contract_value
                    revenue_source = "contract_value"
                else:
                    revenue_source = "missing"

        is_configured = (
            forecast_revenue_total is not None
            and forecast_invoice_cost_total is not None
            and forecast_labor_cost_total is not None
        )
        forecast_total_cost = (
            round((forecast_invoice_cost_total or 0) + (forecast_labor_cost_total or 0), 2)
            if is_configured
            else None
        )
        forecast_margin = (
            round((forecast_revenue_total or 0) - (forecast_total_cost or 0), 2) if is_configured else None
        )
        return {
            "is_configured": is_configured,
            "revenue_total": forecast_revenue_total,
            "invoice_cost_total": forecast_invoice_cost_total,
            "labor_cost_total": forecast_labor_cost_total,
            "total_cost": forecast_total_cost,
            "margin": forecast_margin,
            "margin_percent": _calculate_margin_percent(
                revenue_total=forecast_revenue_total,
                margin=forecast_margin,
            ),
            "revenue_source": revenue_source,
            "is_manual": bool(
                forecast_invoice_cost_total is not None or forecast_labor_cost_total is not None or control.get("forecast_revenue_total") is not None
            ),
        }

    def _build_variance(self, plan: dict[str, Any], actual: dict[str, Any]) -> dict[str, Any]:
        if not plan.get("is_configured"):
            return {
                "status": "missing",
                "label": "Brak planu",
                "cost_total": None,
                "margin": None,
                "margin_percent": None,
            }

        plan_total_cost = float(plan.get("total_cost") or 0)
        actual_total_cost = float(actual.get("total_cost") or 0)
        cost_variance = round(actual_total_cost - plan_total_cost, 2)
        margin_variance = round(float(actual.get("margin") or 0) - float(plan.get("margin") or 0), 2)
        margin_percent_variance = None
        if plan.get("margin_percent") is not None and actual.get("margin_percent") is not None:
            margin_percent_variance = round(
                float(actual.get("margin_percent") or 0) - float(plan.get("margin_percent") or 0),
                2,
            )

        if plan_total_cost <= 0:
            status = "warning" if cost_variance > 0 else "on_track"
        else:
            cost_ratio = actual_total_cost / plan_total_cost
            if cost_ratio >= 1 + ACTUAL_COST_CRITICAL_RATIO:
                status = "critical"
            elif cost_ratio > 1:
                status = "warning"
            else:
                status = "on_track"

        label = {
            "critical": "Przekroczenie",
            "warning": "Ostrzeżenie",
            "on_track": "Zgodnie z planem",
            "missing": "Brak planu",
        }[status]
        return {
            "status": status,
            "label": label,
            "cost_total": cost_variance,
            "margin": margin_variance,
            "margin_percent": margin_percent_variance,
        }

    def _build_activity(self, metrics: dict[str, Any], usage_counts: dict[str, int]) -> dict[str, Any]:
        invoice_count = int(metrics.get("invoice_count") or usage_counts.get("invoices") or 0)
        time_entry_count = int(usage_counts.get("hours_entries") or 0)
        planning_assignment_count = int(usage_counts.get("planning") or 0)
        has_financial_data = invoice_count > 0 or abs(float(metrics.get("revenue_total") or 0)) > 0.005 or abs(float(metrics.get("invoice_cost_total") or 0)) > 0.005
        has_operational_data = time_entry_count > 0 or planning_assignment_count > 0
        return {
            "invoice_count": invoice_count,
            "time_entry_count": time_entry_count,
            "planning_assignment_count": planning_assignment_count,
            "has_financial_data": has_financial_data,
            "has_operational_data": has_operational_data,
            "has_data": has_financial_data or has_operational_data,
        }

    def _build_freshness(self, activity_dates: dict[str, Any]) -> dict[str, Any]:
        today = date.today()
        last_invoice_date = _safe_iso_date(activity_dates.get("last_invoice_date"))
        last_financial_activity_at = _safe_iso_date(activity_dates.get("last_financial_activity_at"))
        last_time_entry_month = text(activity_dates.get("last_time_entry_month")) or None
        last_time_entry_at = _month_key_to_period_end(last_time_entry_month)
        last_planning_date = _safe_iso_date(activity_dates.get("last_planning_date"))

        operational_candidates = [candidate for candidate in (last_time_entry_at, last_planning_date) if candidate]
        last_operational_activity_at = max(operational_candidates) if operational_candidates else None

        def days_since(value: date | None) -> int | None:
            if value is None:
                return None
            return max((today - value).days, 0)

        return {
            "snapshot_generated_at": utc_now_iso(),
            "last_invoice_date": last_invoice_date.isoformat() if last_invoice_date else None,
            "last_financial_activity_at": last_financial_activity_at.isoformat() if last_financial_activity_at else None,
            "last_time_entry_month": last_time_entry_month,
            "last_planning_date": last_planning_date.isoformat() if last_planning_date else None,
            "last_operational_activity_at": (
                last_operational_activity_at.isoformat() if last_operational_activity_at else None
            ),
            "days_since_financial_activity": days_since(last_financial_activity_at),
            "days_since_operational_activity": days_since(last_operational_activity_at),
        }

    def _build_alerts(
        self,
        *,
        contract: dict[str, Any],
        actual: dict[str, Any],
        plan: dict[str, Any],
        forecast: dict[str, Any],
        activity: dict[str, Any],
        freshness: dict[str, Any],
    ) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        is_active = normalize_contract_status(contract.get("status")) == "active"
        today = date.today()
        end_date = _safe_iso_date(contract.get("end_date"))

        def append_alert(level: str, code: str, title: str, description: str, *, context: str | None = None) -> None:
            alerts.append(
                {
                    "level": level,
                    "code": code,
                    "title": title,
                    "description": description,
                    "context": context,
                }
            )

        if float(actual.get("margin") or 0) < 0:
            append_alert(
                "critical",
                "actual-negative-margin",
                "Marża aktualna jest ujemna.",
                "Kontrakt na dziś generuje stratę na podstawie zarejestrowanej sprzedaży i kosztów.",
            )

        if forecast.get("is_configured") and float(forecast.get("margin") or 0) < 0:
            append_alert(
                "critical",
                "forecast-negative-margin",
                "Forecast marży jest ujemny.",
                "Prognoza końcowa wskazuje stratę kontraktu przy obecnym forecastcie kosztów.",
            )

        if is_active and not plan.get("is_configured"):
            append_alert(
                "warning",
                "missing-plan",
                "Brak planu kosztów kontraktu.",
                "Aktywny kontrakt nie ma kompletnego planu kosztu fakturowego i kosztu pracy.",
            )

        if is_active and not forecast.get("is_configured"):
            append_alert(
                "warning",
                "missing-forecast",
                "Brak forecastu kosztów kontraktu.",
                "Aktywny kontrakt nie ma kompletnego forecastu kosztu fakturowego i kosztu pracy.",
            )

        if plan.get("is_configured") and plan.get("total_cost") is not None:
            actual_total_cost = float(actual.get("total_cost") or 0)
            planned_total_cost = float(plan.get("total_cost") or 0)
            if planned_total_cost > 0 and actual_total_cost > planned_total_cost:
                ratio = actual_total_cost / planned_total_cost
                level = "critical" if ratio >= 1 + ACTUAL_COST_CRITICAL_RATIO else "warning"
                append_alert(
                    level,
                    "cost-over-plan",
                    "Koszt rzeczywisty przekracza plan.",
                    "Aktualny łączny koszt jest wyższy od planu dla kontraktu.",
                    context=f"Koszt aktualny {actual_total_cost:.2f} wobec planu {planned_total_cost:.2f}.",
                )

        if is_active and end_date and today > end_date:
            overdue_days = (today - end_date).days
            append_alert(
                "critical" if overdue_days > OVERDUE_CRITICAL_DAYS else "warning",
                "contract-overdue",
                "Aktywny kontrakt jest po terminie zakończenia.",
                "Termin zakończenia minął, a kontrakt nadal jest oznaczony jako aktywny.",
                context=f"Opóźnienie: {overdue_days} dni.",
            )

        if activity.get("has_operational_data") and not activity.get("has_financial_data"):
            append_alert(
                "warning",
                "operational-without-finance",
                "Brak danych finansowych mimo aktywności operacyjnej.",
                "System widzi planowanie lub czas pracy, ale nie widzi jeszcze faktur lub sprzedaży dla kontraktu.",
            )

        financial_stale_days = freshness.get("days_since_financial_activity")
        if is_active and financial_stale_days is not None and int(financial_stale_days) > STALE_FINANCIAL_DAYS:
            append_alert(
                "warning",
                "stale-financial-data",
                "Dane finansowe nie są świeże.",
                "Ostatnia aktywność finansowa dla kontraktu jest zbyt stara, żeby ufać bieżącemu obrazowi bez weryfikacji.",
                context=f"Ostatnia aktywność finansowa {financial_stale_days} dni temu.",
            )

        operational_stale_days = freshness.get("days_since_operational_activity")
        signed_date = _safe_iso_date(contract.get("signed_date"))
        if is_active and operational_stale_days is not None and int(operational_stale_days) > STALE_OPERATIONAL_DAYS:
            append_alert(
                "warning",
                "stale-operational-data",
                "Brak świeżej aktywności operacyjnej.",
                "Ostatnia aktywność operacyjna dla kontraktu jest zbyt stara w relacji do aktywnego statusu kontraktu.",
                context=f"Ostatnia aktywność operacyjna {operational_stale_days} dni temu.",
            )
        elif (
            is_active
            and operational_stale_days is None
            and signed_date
            and (today - signed_date).days > STALE_OPERATIONAL_DAYS
        ):
            append_alert(
                "warning",
                "missing-operational-activity",
                "Brak aktywności operacyjnej dla aktywnego kontraktu.",
                "Kontrakt jest aktywny, ale system nie widzi jeszcze planowania ani ewidencji czasu.",
            )

        return alerts

    def _build_health(self, alerts: list[dict[str, Any]]) -> dict[str, Any]:
        critical_alerts = [alert for alert in alerts if alert["level"] == "critical"]
        warning_alerts = [alert for alert in alerts if alert["level"] == "warning"]
        if critical_alerts:
            return {
                "level": "critical",
                "summary": critical_alerts[0]["title"],
                "reasons": [alert["title"] for alert in critical_alerts[:4]],
            }
        if warning_alerts:
            return {
                "level": "attention",
                "summary": warning_alerts[0]["title"],
                "reasons": [alert["title"] for alert in warning_alerts[:4]],
            }
        return {
            "level": "good",
            "summary": "Kontrakt nie pokazuje obecnie sygnałów ostrzegawczych.",
            "reasons": [],
        }

    def _sync_contract_visibility(self, contract_id: str, *, make_visible: bool, connection=None) -> None:
        normalized_contract_id = text(contract_id)
        if not normalized_contract_id or not self.time_entry_repository:
            return

        self.time_entry_repository.sync_contract_visibility(
            normalized_contract_id,
            visible=make_visible,
            connection=connection,
        )
