from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import normalize_role
from clode_backend.auth.sessions import utc_now_iso
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.validation.contracts import normalize_contract_status, normalize_time_scope, number, text


class ContractServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class ContractService:
    def __init__(self, repository: ContractRepository, metrics_repository: ContractMetricsRepository) -> None:
        self.repository = repository
        self.metrics_repository = metrics_repository

    def ensure_read_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise ContractServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", normalize_role("ksiegowosc"), "kierownik", "read-only"}:
            raise ContractServiceError("Brak uprawnień do podglądu kontraktów.", status_code=403)

    def ensure_write_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise ContractServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) != "admin":
            raise ContractServiceError("Brak uprawnień do zarządzania kontraktami.", status_code=403)

    def list_contracts(self, current_user: dict[str, Any] | None, *, include_archived: bool = True) -> list[dict[str, Any]]:
        self.ensure_read_access(current_user)
        return self.repository.list_all(include_archived=include_archived)

    def create_contract(self, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized = self._normalize_payload(payload)
        return self.repository.insert(normalized)

    def update_contract(self, contract_id: str, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        existing = self.repository.get_by_id(contract_id)
        if not existing:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        normalized = self._normalize_payload(payload, existing=existing)
        updated = self.repository.update(contract_id, normalized)
        if not updated:
            raise ContractServiceError("Nie udało się zapisać kontraktu.", status_code=500)
        return updated

    def get_contract(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        return contract

    def archive_contract(self, contract_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        contract = self.repository.get_by_id(contract_id)
        if not contract:
            raise ContractServiceError("Nie znaleziono kontraktu.", status_code=404)
        archived = self.repository.archive(contract_id, updated_at=utc_now_iso())
        if not archived:
            raise ContractServiceError("Nie udało się zarchiwizować kontraktu.", status_code=500)
        return archived

    def bulk_archive_contracts(self, contract_ids: list[str], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized_ids = [text(contract_id) for contract_id in contract_ids if text(contract_id)]
        if not normalized_ids:
            return {"archived_count": 0, "contracts": []}

        archived_count = self.repository.bulk_archive(normalized_ids, updated_at=utc_now_iso())
        refreshed = self.repository.list_all(include_archived=True)
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
        usage = self.repository.get_usage_counts(contract_id)
        return {
            "contract": contract,
            "usage": usage,
            "has_operational_data": any(usage.values()),
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
            global_metrics = self.metrics_repository.calculate_global_metrics(normalized_range, connection)
            unassigned_invoices = self.metrics_repository.list_unassigned_invoices(normalized_range, connection)
            unmatched_hours = self.metrics_repository.list_unmatched_hours(normalized_range, connection)
        return {
            "range": normalized_range,
            "contracts": contract_items,
            "unassigned": global_metrics["unassigned"],
            "unassigned_invoices": unassigned_invoices,
            "unmatched_hours": unmatched_hours,
            "totals": global_metrics["totals"],
        }

    def _normalize_payload(self, payload: dict[str, Any], *, existing: dict[str, Any] | None = None) -> dict[str, Any]:
        name = text(payload.get("name") if payload.get("name") is not None else existing.get("name") if existing else "")
        if not name:
            raise ContractServiceError("Nazwa kontraktu jest wymagana.")

        signed_date = text(payload.get("signed_date") if payload.get("signed_date") is not None else existing.get("signed_date") if existing else "")
        end_date = text(payload.get("end_date") if payload.get("end_date") is not None else existing.get("end_date") if existing else "")
        if signed_date and end_date and end_date < signed_date:
            raise ContractServiceError("Termin zakończenia nie może być wcześniejszy niż data podpisania.")

        contract_value = number(payload.get("contract_value") if payload.get("contract_value") is not None else existing.get("contract_value") if existing else 0)
        if contract_value < 0:
            raise ContractServiceError("Kwota kontraktu nie może być ujemna.")

        timestamp = utc_now_iso()
        return {
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

