from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.sessions import utc_now_iso
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
        normalized = self._normalize_workflow({})
        self._validate_workflow(normalized)
        return normalized

    def save_workflow(
        self,
        payload: Any,
        *,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized = self._normalize_workflow(payload)
        self._validate_workflow(normalized)
        saved = self.repository.save_workflow(normalized)
        self._drop_legacy_workflow()
        if current_user:
            self.append_audit_log(
                {
                    "module": "settings.workflow",
                    "action": "workflow.updated",
                    "subject": "vacations",
                    "details": (
                        "Updated workflow: "
                        f"vacationApprovalMode={normalized['vacationApprovalMode']}, "
                        f"vacationNotifications={normalized['vacationNotifications']}"
                    ),
                },
                current_user=current_user,
            )
        return self._normalize_workflow(saved)

    def list_audit_logs(self) -> list[dict[str, Any]]:
        entries = self.repository.list_audit_logs(limit=self.AUDIT_LOG_LIMIT)
        self._validate_audit_entries(entries)
        return entries

    def append_audit_log(
        self,
        payload: Any,
        *,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized = self._build_audit_entry(payload, current_user=current_user)
        self.repository.append_audit_log(normalized)
        self.repository.prune_audit_logs(limit=self.AUDIT_LOG_LIMIT)
        self.legacy_store_repository.delete("audit_logs")
        return normalized

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

    def bootstrap_legacy_settings(self) -> None:
        if not self.repository.get_workflow():
            legacy_store = self.legacy_store_repository.get("settings")
            workflow_source = legacy_store if isinstance(legacy_store, dict) else None
            workflow_payload = (
                workflow_source.get("workflow")
                if isinstance(workflow_source, dict) and isinstance(workflow_source.get("workflow"), dict)
                else workflow_source
            )
            if isinstance(workflow_payload, dict):
                normalized_workflow = self._normalize_workflow(workflow_payload)
                self._validate_workflow(normalized_workflow)
                self.repository.save_workflow(normalized_workflow)
                self._drop_legacy_workflow()

        if self.repository.list_audit_logs(limit=1):
            return

        legacy_payload = self.legacy_store_repository.get("audit_logs")
        legacy_entries = legacy_payload if isinstance(legacy_payload, list) else []
        normalized_entries = self._normalize_audit_entries(legacy_entries)
        if not normalized_entries:
            return
        self.repository.import_audit_logs(normalized_entries)
        self.repository.prune_audit_logs(limit=self.AUDIT_LOG_LIMIT)
        self.legacy_store_repository.delete("audit_logs")

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
    def _build_audit_entry(
        payload: Any,
        *,
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        entry = payload if isinstance(payload, dict) else {}
        normalized = {
            "id": f"audit-{uuid4().hex}",
            "timestamp": utc_now_iso(),
            "module": str(entry.get("module") or "").strip(),
            "action": str(entry.get("action") or "").strip(),
            "subject": str(entry.get("subject") or "").strip(),
            "details": str(entry.get("details") or "").strip(),
            "user_id": str((current_user or {}).get("id") or "").strip(),
            "user_name": str(
                (current_user or {}).get("displayName")
                or (current_user or {}).get("name")
                or ""
            ).strip(),
        }
        SettingsService._validate_audit_entries([normalized])
        return normalized

    def _normalize_audit_entries(self, payload: list[Any]) -> list[dict[str, Any]]:
        normalized_entries = []
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            normalized_entries.append(
                {
                    "id": str(entry.get("id") or "").strip() or f"audit-{uuid4().hex}",
                    "timestamp": str(entry.get("timestamp") or "").strip() or utc_now_iso(),
                    "module": str(entry.get("module") or "").strip(),
                    "action": str(entry.get("action") or "").strip(),
                    "subject": str(entry.get("subject") or "").strip(),
                    "details": str(entry.get("details") or "").strip(),
                    "user_id": str(entry.get("user_id") or "").strip(),
                    "user_name": str(entry.get("user_name") or "").strip(),
                }
            )
        self._validate_audit_entries(normalized_entries)
        return normalized_entries

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
