from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.passwords import verify_password
from clode_backend.auth.rbac import can_access_store, can_access_view, effective_permissions, normalize_role
from clode_backend.auth.sessions import (
    generate_session_token,
    hash_session_token,
    parse_iso_datetime,
    session_expiry_iso,
    utc_now,
    utc_now_iso,
)
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.user_repository import UserRepository


class AuthServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class AuthService:
    def __init__(self, user_repository: UserRepository, session_repository: SessionRepository, session_ttl_hours: int) -> None:
        self.user_repository = user_repository
        self.session_repository = session_repository
        self.session_ttl_hours = session_ttl_hours

    def login(self, username: str, password: str) -> dict[str, Any]:
        normalized_login = str(username or "").strip().lower()
        if not normalized_login or not str(password or "").strip():
            raise AuthServiceError("Wpisz uzytkownika i haslo.", status_code=400)

        user = self.user_repository.find_for_login(normalized_login)
        if not user or not bool(user.get("is_active")):
            raise AuthServiceError("Nieprawidlowy uzytkownik lub haslo.", status_code=401)
        if not verify_password(password, user.get("password_hash", "")):
            raise AuthServiceError("Nieprawidlowy uzytkownik lub haslo.", status_code=401)

        token = generate_session_token()
        token_hash = hash_session_token(token)
        now_iso = utc_now_iso()
        self.session_repository.create(
            {
                "id": f"session-{uuid4().hex}",
                "user_id": user["id"],
                "session_token_hash": token_hash,
                "created_at": now_iso,
                "expires_at": session_expiry_iso(self.session_ttl_hours),
                "last_seen_at": now_iso,
                "revoked_at": None,
            }
        )
        self.user_repository.touch_last_login(user["id"], now_iso)
        refreshed = self.user_repository.get_by_id(user["id"]) or user
        return {
            "token": token,
            "user": self.to_public_user(refreshed),
        }

    def logout(self, session_token: str) -> None:
        if not session_token:
            return
        self.session_repository.revoke(hash_session_token(session_token), utc_now_iso())

    def get_current_user(self, session_token: str) -> dict[str, Any] | None:
        if not session_token:
            return None
        session_payload = self.session_repository.get_with_user(hash_session_token(session_token))
        if not session_payload:
            return None

        session = session_payload["session"]
        user = session_payload["user"]
        if session.get("revoked_at"):
            return None
        expires_at = parse_iso_datetime(session.get("expires_at"))
        if not expires_at or expires_at <= utc_now():
            self.session_repository.revoke(session["session_token_hash"], utc_now_iso())
            return None
        if not bool(user.get("is_active")):
            return None

        self.session_repository.touch(session["id"], utc_now_iso())
        return self.to_public_user(user)

    def request_password_reset(self, username: str) -> dict[str, Any]:
        normalized_login = str(username or "").strip().lower()
        if not normalized_login:
            raise AuthServiceError("Podaj login, aby zarejestrowac prosbe o reset hasla.", status_code=400)
        user = self.user_repository.find_for_login(normalized_login)
        if not user:
            raise AuthServiceError("Nie znaleziono konta o podanym loginie.", status_code=404)
        return {
            "message": (
                f"Zarejestrowano prosbe o reset hasla dla konta {user['name']}. "
                "Wysylka e-mail bedzie dostepna po konfiguracji SMTP."
            )
        }

    def ensure_view_access(self, current_user: dict[str, Any] | None, view_id: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_access_view(current_user.get("role"), current_user.get("permissions"), view_id):
            raise AuthServiceError("Brak uprawnien do tego modulu.", status_code=403)

    def ensure_store_access(self, current_user: dict[str, Any] | None, store_name: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_access_store(current_user.get("role"), current_user.get("permissions"), store_name):
            raise AuthServiceError("Brak uprawnien do tego zasobu.", status_code=403)

    def ensure_admin(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) != "admin":
            raise AuthServiceError("Ta operacja wymaga roli admin.", status_code=403)

    @staticmethod
    def to_public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
        if not user:
            return None
        return {
            "id": user["id"],
            "username": user["username"],
            "email": user.get("email", ""),
            "displayName": user["name"],
            "name": user["name"],
            "role": normalize_role(user.get("role")),
            "is_active": bool(user.get("is_active")),
            "status": "active" if bool(user.get("is_active")) else "inactive",
            "permissions": effective_permissions(user.get("role"), user.get("permissions")),
            "canApproveVacations": bool(user.get("can_approve_vacations")),
            "created_at": user.get("created_at", ""),
            "updated_at": user.get("updated_at", ""),
            "last_login_at": user.get("last_login_at", ""),
        }

