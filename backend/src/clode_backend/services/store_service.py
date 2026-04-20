from __future__ import annotations

from typing import Any

from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract


class StoreService:
    def __init__(self, repository: StoreRepository) -> None:
        self.repository = repository

    def list_stores(self) -> list[str]:
        return self.repository.list_names()

    def get_store(self, store_name: str) -> Any | None:
        return self.repository.get(store_name)

    def save_store(self, store_name: str, payload: Any) -> Any:
        return self.repository.save(store_name, payload)

    def delete_store(self, store_name: str) -> None:
        self.repository.delete(store_name)

    def get_vacation_store(self) -> dict[str, Any]:
        payload = self.repository.get("vacations")
        if not isinstance(payload, dict):
            payload = {"version": 1, "balances": {}, "requests": []}
        payload.setdefault("version", 1)
        payload.setdefault("balances", {})
        payload.setdefault("requests", [])
        self._validate("vacation_store", payload)
        return payload

    def save_vacation_store(self, payload: Any) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("version", 1)
        normalized.setdefault("balances", {})
        normalized.setdefault("requests", [])
        self._validate("vacation_store", normalized)
        return self.repository.save("vacations", normalized)

    def get_planning_store(self) -> dict[str, Any]:
        payload = self.repository.get("planning")
        if not isinstance(payload, dict):
            payload = {"assignments": {}}
        payload.setdefault("assignments", {})
        self._validate("planning_store", payload)
        return payload

    def save_planning_store(self, payload: Any) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("assignments", {})
        self._validate("planning_store", normalized)
        return self.repository.save("planning", normalized)

    def get_work_card_store(self) -> dict[str, Any]:
        payload = self.repository.get("work_cards")
        if not isinstance(payload, dict):
            payload = {"version": 1, "cards": []}
        payload.setdefault("version", 1)
        payload.setdefault("cards", [])
        self._validate("work_card_store", payload)
        return payload

    def save_work_card_store(self, payload: Any) -> dict[str, Any]:
        normalized = dict(payload or {})
        normalized.setdefault("version", 1)
        normalized.setdefault("cards", [])
        self._validate("work_card_store", normalized)
        return self.repository.save("work_cards", normalized)

    @staticmethod
    def _validate(contract_name: str, payload: Any) -> None:
        try:
            validate_shared_contract(contract_name, payload)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error
