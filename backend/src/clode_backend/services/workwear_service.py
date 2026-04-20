from __future__ import annotations

from typing import Any

from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.workwear_repository import WorkwearRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract


class WorkwearService:
    def __init__(
        self,
        repository: WorkwearRepository,
        legacy_store_repository: StoreRepository,
    ) -> None:
        self.repository = repository
        self.legacy_store_repository = legacy_store_repository

    def get_catalog(self) -> list[dict[str, Any]]:
        catalog = self.repository.list_catalog()
        if catalog:
            self._validate_catalog(catalog)
            return catalog

        legacy_payload = self.legacy_store_repository.get("workwear_catalog")
        normalized = legacy_payload if isinstance(legacy_payload, list) else []
        self._validate_catalog(normalized)
        if normalized:
            self.repository.replace_catalog(normalized)
            self.legacy_store_repository.delete("workwear_catalog")
            return self.repository.list_catalog()
        return []

    def save_catalog(self, payload: Any) -> list[dict[str, Any]]:
        normalized = payload if isinstance(payload, list) else []
        self._validate_catalog(normalized)
        saved = self.repository.replace_catalog(normalized)
        self.legacy_store_repository.delete("workwear_catalog")
        return saved

    def get_issues(self) -> list[dict[str, Any]]:
        issues = self.repository.list_issues()
        if issues:
            self._validate_issues(issues)
            return issues

        legacy_payload = self.legacy_store_repository.get("workwear_issues")
        normalized = legacy_payload if isinstance(legacy_payload, list) else []
        self._validate_issues(normalized)
        if normalized:
            self.repository.replace_issues(normalized)
            self.legacy_store_repository.delete("workwear_issues")
            return self.repository.list_issues()
        return []

    def save_issues(self, payload: Any) -> list[dict[str, Any]]:
        normalized = payload if isinstance(payload, list) else []
        self._validate_issues(normalized)
        saved = self.repository.replace_issues(normalized)
        self.legacy_store_repository.delete("workwear_issues")
        return saved

    @staticmethod
    def _validate_catalog(payload: list[dict[str, Any]]) -> None:
        try:
            validate_shared_contract("workwear_catalog", payload)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error

    @staticmethod
    def _validate_issues(payload: list[dict[str, Any]]) -> None:
        try:
            validate_shared_contract("workwear_issues", payload)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error
