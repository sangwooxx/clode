from __future__ import annotations

from typing import Any

from clode_backend.repositories.settings_repository import SettingsRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract


class SettingsService:
    AUDIT_LOG_LIMIT = 1500

    def __init__(
        self,
        repository: SettingsRepository,
        legacy_store_repository: StoreRepository,
    ) -> None:
        self.repository = repository
        self.legacy_store_repository = legacy_store_repository

    def get_workflow(self) -> dict[str, Any]:
        workflow = self.repository.get_workflow()
        if workflow:
            normalized = self._normalize_workflow(workflow)
            self._validate_workflow(normalized)
            return normalized

        legacy_store = self.legacy_store_repository.get("settings")
        workflow_source = legacy_store if isinstance(legacy_store, dict) else {}
        workflow_payload = (
            workflow_source.get("workflow")
            if isinstance(workflow_source.get("workflow"), dict)
            else workflow_source
        )
        normalized = self._normalize_workflow(workflow_payload)
        self._validate_workflow(normalized)
        self.repository.save_workflow(normalized)
        self._drop_legacy_workflow()
        return normalized

    def save_workflow(self, payload: Any) -> dict[str, Any]:
        normalized = self._normalize_workflow(payload)
        self._validate_workflow(normalized)
        saved = self.repository.save_workflow(normalized)
        self._drop_legacy_workflow()
        return self._normalize_workflow(saved)

    def list_audit_logs(self) -> list[dict[str, Any]]:
        entries = self.repository.list_audit_logs(limit=self.AUDIT_LOG_LIMIT)
        if entries:
            self._validate_audit_entries(entries)
            return entries

        legacy_payload = self.legacy_store_repository.get("audit_logs")
        legacy_entries = legacy_payload if isinstance(legacy_payload, list) else []
        normalized = self._normalize_audit_entries(legacy_entries)
        if normalized:
            self.repository.replace_audit_logs(normalized)
            self.legacy_store_repository.delete("audit_logs")
            return self.repository.list_audit_logs(limit=self.AUDIT_LOG_LIMIT)
        return []

    def append_audit_log(self, payload: Any) -> dict[str, Any]:
        normalized = self._normalize_audit_entry(payload)
        self._validate_audit_entries([normalized])
        self.repository.append_audit_log(normalized)
        self._prune_audit_log_limit()
        self.legacy_store_repository.delete("audit_logs")
        return normalized

    def replace_audit_logs(self, payload: Any) -> list[dict[str, Any]]:
        normalized = self._normalize_audit_entries(payload if isinstance(payload, list) else [])
        self._validate_audit_entries(normalized)
        saved = self.repository.replace_audit_logs(normalized)
        self._prune_audit_log_limit()
        self.legacy_store_repository.delete("audit_logs")
        return saved[: self.AUDIT_LOG_LIMIT]

    def _prune_audit_log_limit(self) -> None:
        current = self.repository.list_audit_logs(limit=self.AUDIT_LOG_LIMIT + 500)
        if len(current) <= self.AUDIT_LOG_LIMIT:
            return
        self.repository.replace_audit_logs(current[: self.AUDIT_LOG_LIMIT])

    def _drop_legacy_workflow(self) -> None:
        legacy_store = self.legacy_store_repository.get("settings")
        if not isinstance(legacy_store, dict):
            return

        if "workflow" not in legacy_store:
            return

        next_store = dict(legacy_store)
        next_store.pop("workflow", None)
        if next_store:
            self.legacy_store_repository.save("settings", next_store)
            return

        self.legacy_store_repository.delete("settings")

    @staticmethod
    def _normalize_workflow(payload: Any) -> dict[str, Any]:
        workflow = payload if isinstance(payload, dict) else {}
        return {
            "vacationApprovalMode": (
                "admin"
                if str(workflow.get("vacationApprovalMode") or "").strip() == "admin"
                else "permission"
            ),
            "vacationNotifications": (
                "off"
                if str(workflow.get("vacationNotifications") or "").strip() == "off"
                else "on"
            ),
        }

    @staticmethod
    def _normalize_audit_entry(payload: Any) -> dict[str, Any]:
        entry = payload if isinstance(payload, dict) else {}
        return {
            "id": str(entry.get("id") or "").strip(),
            "timestamp": str(entry.get("timestamp") or "").strip(),
            "module": str(entry.get("module") or "").strip(),
            "action": str(entry.get("action") or "").strip(),
            "subject": str(entry.get("subject") or "").strip(),
            "details": str(entry.get("details") or "").strip(),
            "user_id": str(entry.get("user_id") or "").strip(),
            "user_name": str(entry.get("user_name") or "").strip(),
        }

    def _normalize_audit_entries(self, payload: list[Any]) -> list[dict[str, Any]]:
        return [self._normalize_audit_entry(entry) for entry in payload if isinstance(entry, dict)]

    @staticmethod
    def _validate_workflow(payload: dict[str, Any]) -> None:
        try:
            validate_shared_contract("settings_workflow", payload)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error

    @staticmethod
    def _validate_audit_entries(entries: list[dict[str, Any]]) -> None:
        try:
            validate_shared_contract("settings_audit_log", entries)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error
