from __future__ import annotations

import os
from typing import Any
from uuid import uuid4

from clode_backend.auth.passwords import hash_password, looks_like_password_hash
from clode_backend.auth.rbac import effective_permissions, normalize_role
from clode_backend.auth.sessions import utc_now_iso
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.user_repository import UserRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract
from clode_backend.services.public_users import build_public_user


class UserServiceError(RuntimeError):
    pass


class UserService:
    def __init__(
        self,
        repository: UserRepository,
        store_repository: StoreRepository,
        session_repository: SessionRepository | None = None,
    ) -> None:
        self.repository = repository
        self.store_repository = store_repository
        self.session_repository = session_repository

    def ensure_bootstrap_users(self) -> None:
        if self.repository.count() > 0:
            return

        legacy_settings = self.store_repository.get("settings") or {}
        legacy_users = legacy_settings.get("users") if isinstance(legacy_settings, dict) else []
        imported = False
        for entry in legacy_users or []:
            try:
                self.create_or_update_user(entry)
                imported = True
            except Exception:
                continue

        if imported or self.repository.count() > 0:
            return

        username = str(os.getenv("CLODE_BOOTSTRAP_ADMIN_USERNAME") or os.getenv("AGENT_BOOTSTRAP_ADMIN_USERNAME") or "").strip().lower()
        password = str(os.getenv("CLODE_BOOTSTRAP_ADMIN_PASSWORD") or os.getenv("AGENT_BOOTSTRAP_ADMIN_PASSWORD") or "").strip()
        display_name = str(os.getenv("CLODE_BOOTSTRAP_ADMIN_NAME") or os.getenv("AGENT_BOOTSTRAP_ADMIN_NAME") or "Administrator").strip()
        email = str(os.getenv("CLODE_BOOTSTRAP_ADMIN_EMAIL") or os.getenv("AGENT_BOOTSTRAP_ADMIN_EMAIL") or "").strip().lower()

        if username and password:
            self.create_or_update_user(
                {
                    "id": "bootstrap-admin",
                    "name": display_name,
                    "username": username,
                    "email": email,
                    "password": password,
                    "role": "admin",
                    "status": "active",
                    "canApproveVacations": True,
                }
            )

    def list_users(self) -> list[dict[str, Any]]:
        return [self.to_public_user(user) for user in self.repository.list_all()]

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        user = self.repository.get_by_id(user_id)
        return self.to_public_user(user) if user else None

    def find_by_username(self, username: str) -> dict[str, Any] | None:
        return self.repository.get_by_username(str(username or "").strip().lower())

    def create_or_update_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        user_id = str(payload.get("id") or "").strip()
        existing = self.repository.get_by_id(user_id) if user_id else None

        name = str(payload.get("name") or "").strip()
        username = str(payload.get("username") or name).strip().lower().replace(" ", ".")
        email = str(payload.get("email") or "").strip().lower()
        role = normalize_role(payload.get("role"))
        status = "inactive" if str(payload.get("status") or "active").strip() == "inactive" else "active"
        is_active = bool(payload.get("is_active", status != "inactive"))
        can_approve_vacations = bool(payload.get("canApproveVacations") or payload.get("can_approve_vacations"))
        permissions = effective_permissions(role, payload.get("permissions"))

        if not name:
            raise UserServiceError("User name is required.")
        if not username:
            raise UserServiceError("Username is required.")

        duplicate = self.find_by_username(username)
        if duplicate and duplicate["id"] != user_id:
            raise UserServiceError("User with this username already exists.")
        if email:
            duplicate_email = self.repository.get_by_email(email)
            if duplicate_email and duplicate_email["id"] != user_id:
                raise UserServiceError("User with this e-mail already exists.")

        password_candidate = str(payload.get("password") or "").strip()
        password_hash_value = str(payload.get("password_hash") or "").strip()
        if existing:
            if password_candidate:
                password_hash_value = hash_password(password_candidate)
            elif not password_hash_value:
                password_hash_value = existing["password_hash"]
        else:
            if password_candidate:
                password_hash_value = hash_password(password_candidate)
            elif looks_like_password_hash(password_hash_value):
                password_hash_value = password_hash_value
            else:
                raise UserServiceError("Password is required for a new user.")

        timestamp = utc_now_iso()
        password_changed = bool(existing and password_hash_value != existing["password_hash"])
        record = {
            "id": existing["id"] if existing else (user_id or f"user-{uuid4().hex}"),
            "name": name,
            "username": username,
            "email": email,
            "password_hash": password_hash_value,
            "role": role,
            "status": status,
            "permissions": permissions,
            "can_approve_vacations": can_approve_vacations or role == "admin",
            "is_active": is_active and status != "inactive",
            "created_at": existing["created_at"] if existing else timestamp,
            "updated_at": timestamp,
            "last_login_at": existing["last_login_at"] if existing else "",
        }
        contract_payload = {
            "id": record["id"],
            "name": record["name"],
            "displayName": record["name"],
            "username": record["username"],
            "email": record["email"],
            "role": record["role"],
            "status": record["status"],
            "is_active": record["is_active"],
            "permissions": record["permissions"],
            "canApproveVacations": record["can_approve_vacations"],
            "created_at": record["created_at"],
            "updated_at": record["updated_at"],
            "last_login_at": record["last_login_at"],
        }
        try:
            validate_shared_contract("user", contract_payload)
        except ContractValidationError as error:
            raise UserServiceError(str(error)) from error

        saved = self.repository.update(record["id"], record) if existing else self.repository.insert(record)
        if password_changed and self.session_repository:
            self.session_repository.revoke_all_for_user(record["id"], timestamp)
        return self.to_public_user(saved)

    def delete_user(self, user_id: str, *, actor_user_id: str | None = None) -> None:
        user = self.repository.get_by_id(user_id)
        if not user:
            return
        if actor_user_id and user_id == actor_user_id:
            raise UserServiceError("You cannot delete your own account.")

        active_admins = [
            entry for entry in self.repository.list_all()
            if normalize_role(entry.get("role")) == "admin" and bool(entry.get("is_active"))
        ]
        if normalize_role(user.get("role")) == "admin" and len(active_admins) <= 1:
            raise UserServiceError("At least one active admin account must remain.")
        self.repository.delete(user_id)

    @staticmethod
    def to_public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
        return build_public_user(user)

