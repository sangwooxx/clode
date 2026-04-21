from __future__ import annotations

from typing import Any

from clode_backend.repositories.planning_repository import PlanningRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.vacation_repository import VacationRepository
from clode_backend.repositories.work_card_repository import WorkCardRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract


class StoreService:
    def __init__(
        self,
        repository: StoreRepository,
        *,
        vacation_repository: VacationRepository | None = None,
        planning_repository: PlanningRepository | None = None,
        work_card_repository: WorkCardRepository | None = None,
    ) -> None:
        self.repository = repository
        self.vacation_repository = vacation_repository
        self.planning_repository = planning_repository
        self.work_card_repository = work_card_repository

    def list_stores(self) -> list[str]:
        return self.repository.list_names()

    def get_store(self, store_name: str, *, connection=None) -> Any | None:
        return self.repository.get(store_name, connection=connection)

    def save_store(self, store_name: str, payload: Any, *, connection=None) -> Any:
        return self.repository.save(store_name, payload, connection=connection)

    def delete_store(self, store_name: str, *, connection=None) -> None:
        self.repository.delete(store_name, connection=connection)

    def bootstrap_legacy_domain_stores(self, *, purge_legacy: bool = False) -> dict[str, int]:
        return {
            "vacations": self._bootstrap_legacy_store(
                "vacations",
                reader=self.get_vacation_store,
                writer=self.save_vacation_store,
                purge_legacy=purge_legacy,
            ),
            "planning": self._bootstrap_legacy_store(
                "planning",
                reader=self.get_planning_store,
                writer=self.save_planning_store,
                purge_legacy=purge_legacy,
            ),
            "work_cards": self._bootstrap_legacy_store(
                "work_cards",
                reader=self.get_work_card_store,
                writer=self.save_work_card_store,
                purge_legacy=purge_legacy,
            ),
        }

    def get_vacation_store(self, *, connection=None) -> dict[str, Any]:
        payload = (
            self.vacation_repository.get_store(connection=connection)
            if self.vacation_repository
            else self.repository.get("vacations", connection=connection)
        )
        if not isinstance(payload, dict):
            payload = {"version": 1, "balances": {}, "requests": []}
        payload.setdefault("version", 1)
        payload.setdefault("balances", {})
        payload.setdefault("requests", [])
        self._validate("vacation_store", payload)
        return payload

    def save_vacation_store(self, payload: Any, *, connection=None) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("version", 1)
        normalized.setdefault("balances", {})
        normalized.setdefault("requests", [])
        self._validate("vacation_store", normalized)
        if self.vacation_repository:
            return self.vacation_repository.replace_store(normalized, connection=connection)
        return self.repository.save("vacations", normalized, connection=connection)

    def get_planning_store(self, *, connection=None) -> dict[str, Any]:
        payload = (
            self.planning_repository.get_store(connection=connection)
            if self.planning_repository
            else self.repository.get("planning", connection=connection)
        )
        if not isinstance(payload, dict):
            payload = {"assignments": {}}
        payload.setdefault("assignments", {})
        self._validate("planning_store", payload)
        return payload

    def save_planning_store(self, payload: Any, *, connection=None) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("assignments", {})
        self._validate("planning_store", normalized)
        if self.planning_repository:
            return self.planning_repository.replace_store(normalized, connection=connection)
        return self.repository.save("planning", normalized, connection=connection)

    def get_work_card_store(self, *, connection=None) -> dict[str, Any]:
        payload = (
            self.work_card_repository.get_store(connection=connection)
            if self.work_card_repository
            else self.repository.get("work_cards", connection=connection)
        )
        if not isinstance(payload, dict):
            payload = {"version": 1, "cards": []}
        payload.setdefault("version", 1)
        payload.setdefault("cards", [])
        self._validate("work_card_store", payload)
        return payload

    def save_work_card_store(self, payload: Any, *, connection=None) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("version", 1)
        normalized.setdefault("cards", [])
        self._validate("work_card_store", normalized)
        if self.work_card_repository:
            return self.work_card_repository.replace_store(normalized, connection=connection)
        return self.repository.save("work_cards", normalized, connection=connection)

    def get_work_card(
        self,
        month_key: str,
        *,
        employee_id: str = "",
        employee_name: str = "",
    ) -> dict[str, Any] | None:
        if self.work_card_repository:
            return self.work_card_repository.get_card(
                month_key,
                employee_id=employee_id,
                employee_name=employee_name,
            )

        normalized_month_key = str(month_key or "").strip()
        normalized_employee_id = str(employee_id or "").strip()
        normalized_employee_name = str(employee_name or "").strip().lower()

        if not normalized_month_key:
            return None

        for card in self.get_work_card_store().get("cards", []):
            if str(card.get("month_key") or "").strip() != normalized_month_key:
                continue

            card_employee_id = str(card.get("employee_id") or "").strip()
            if normalized_employee_id and card_employee_id:
                if card_employee_id == normalized_employee_id:
                    return card
                continue

            if normalized_employee_name and (
                str(card.get("employee_name") or "").strip().lower()
                == normalized_employee_name
            ):
                return card

        return None

    def save_work_card(self, payload: Any, *, connection=None) -> dict[str, Any]:
        normalized_card = dict(payload or {})
        self._validate("work_card_store", {"version": 1, "cards": [normalized_card]})
        if self.work_card_repository:
            return self.work_card_repository.save_card(normalized_card, connection=connection)
        _, next_store = self._build_work_card_store(payload, connection=connection)
        self.repository.save("work_cards", next_store, connection=connection)
        return normalized_card

    def _build_work_card_store(self, payload: Any, *, connection=None) -> tuple[dict[str, Any], dict[str, Any]]:
        normalized_card = dict(payload or {})
        normalized_store = self.get_work_card_store(connection=connection)
        next_cards = list(normalized_store.get("cards") or [])
        existing_index = next(
            (
                index
                for index, card in enumerate(next_cards)
                if str(card.get("id") or "").strip()
                == str(normalized_card.get("id") or "").strip()
            ),
            -1,
        )

        if existing_index >= 0:
            next_cards[existing_index] = normalized_card
        else:
            next_cards.append(normalized_card)

        next_cards.sort(
            key=lambda card: (
                str(card.get("month_key") or "").strip(),
                str(card.get("employee_name") or "").strip().lower(),
            ),
            reverse=True,
        )
        next_store = {
            "version": 1,
            "cards": next_cards,
        }
        self._validate("work_card_store", next_store)
        return normalized_card, next_store

    def list_work_card_history_summaries(self) -> list[dict[str, Any]]:
        summaries: list[dict[str, Any]] = []
        cards = (
            self.work_card_repository.list_cards()
            if self.work_card_repository
            else self.get_work_card_store().get("cards", [])
        )
        for card in cards:
            total_hours = 0.0
            filled_days = 0
            for row in card.get("rows") or []:
                row_hours = sum(float(entry.get("hours") or 0) for entry in row.get("entries") or [])
                total_hours += row_hours
                if row_hours > 0:
                    filled_days += 1

            summaries.append(
                {
                    "card_id": str(card.get("id") or "").strip(),
                    "employee_id": str(card.get("employee_id") or "").strip(),
                    "employee_name": str(card.get("employee_name") or "").strip(),
                    "month_key": str(card.get("month_key") or "").strip(),
                    "month_label": str(card.get("month_label") or "").strip(),
                    "updated_at": str(card.get("updated_at") or "").strip(),
                    "total_hours": round(total_hours, 2),
                    "filled_days": filled_days,
                }
            )

        summaries.sort(
            key=lambda item: (
                str(item.get("month_key") or "").strip(),
                str(item.get("employee_name") or "").strip().lower(),
            ),
            reverse=True,
        )
        return summaries

    @staticmethod
    def _validate(contract_name: str, payload: Any) -> None:
        try:
            validate_shared_contract(contract_name, payload)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error

    def _bootstrap_legacy_store(self, store_name: str, *, reader, writer, purge_legacy: bool) -> int:
        legacy_payload = self.repository.get(store_name)
        if legacy_payload is None:
            return 0

        current_payload = reader()
        has_runtime_data = False
        if isinstance(current_payload, dict):
            if store_name == "vacations":
                has_runtime_data = bool(current_payload.get("balances")) or bool(current_payload.get("requests"))
            elif store_name == "planning":
                has_runtime_data = bool(current_payload.get("assignments"))
            elif store_name == "work_cards":
                has_runtime_data = bool(current_payload.get("cards"))

        if has_runtime_data:
            return 0

        writer(legacy_payload)
        if purge_legacy:
            self.repository.delete(store_name)

        if store_name == "vacations":
            payload = legacy_payload if isinstance(legacy_payload, dict) else {}
            return len(payload.get("requests") or []) + len(payload.get("balances") or {})
        if store_name == "planning":
            payload = legacy_payload if isinstance(legacy_payload, dict) else {}
            assignments = payload.get("assignments") if isinstance(payload.get("assignments"), dict) else {}
            return sum(
                len(employee_assignments)
                for employee_assignments in assignments.values()
                if isinstance(employee_assignments, dict)
            )
        if store_name == "work_cards":
            payload = legacy_payload if isinstance(legacy_payload, dict) else {}
            cards = payload.get("cards") if isinstance(payload.get("cards"), list) else []
            return len(cards)
        return 0
