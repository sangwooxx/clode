from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.passwords import verify_password
from clode_backend.auth.rbac import (
    can_access_store,
    can_access_view,
    can_manage_view,
    can_read_store,
    can_write_store,
    normalize_role,
)
from clode_backend.auth.sessions import (
    build_stateless_session_token,
    generate_session_token,
    hash_session_token,
    parse_iso_datetime,
    read_stateless_session_subject,
    session_expiry_iso,
    utc_now,
    utc_now_iso,
    verify_stateless_session_token,
)
from clode_backend.repositories.session_repository import SessionRepository
from clode_backend.repositories.user_repository import UserRepository
from clode_backend.services.public_users import build_public_user


class AuthServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class AuthService:
    def __init__(
        self,
        user_repository: UserRepository,
        session_repository: SessionRepository,
        session_ttl_hours: int,
        *,
        secure_cookies: bool = False,
        session_secret: str = "",
        use_stateless_sessions: bool = False,
    ) -> None:
        self.user_repository = user_repository
        self.session_repository = session_repository
        self.session_ttl_hours = session_ttl_hours
        self.secure_cookies = secure_cookies
        self.session_secret = session_secret
        self.use_stateless_sessions = use_stateless_sessions

    def login(self, username: str, password: str) -> dict[str, Any]:
        normalized_login = str(username or "").strip().lower()
        if not normalized_login or not str(password or "").strip():
            raise AuthServiceError("Wpisz uzytkownika i haslo.", status_code=400)

        user = self.user_repository.find_for_login(normalized_login)
        if not user or not bool(user.get("is_active")):
            raise AuthServiceError("Nieprawidlowy uzytkownik lub haslo.", status_code=401)
        if not verify_password(password, user.get("password_hash", "")):
            raise AuthServiceError("Nieprawidlowy uzytkownik lub haslo.", status_code=401)

        now_iso = utc_now_iso()
        if self.use_stateless_sessions:
            token = build_stateless_session_token(
                user_id=user["id"],
                password_hash=str(user.get("password_hash") or ""),
                ttl_hours=self.session_ttl_hours,
                session_secret=self.session_secret,
            )
        else:
            token = generate_session_token()
            token_hash = hash_session_token(token)
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
        if self.use_stateless_sessions or not session_token:
            return
        self.session_repository.revoke(hash_session_token(session_token), utc_now_iso())

    def get_current_user(self, session_token: str) -> dict[str, Any] | None:
        if not session_token:
            return None
        if self.use_stateless_sessions:
            user_id = read_stateless_session_subject(session_token)
            if not user_id:
                return None

            user = self.user_repository.get_by_id(user_id)
            if not user:
                return None

            payload = verify_stateless_session_token(
                session_token,
                password_hash=str(user.get("password_hash") or ""),
                session_secret=self.session_secret,
            )
            if not payload:
                return None

            if not user or not bool(user.get("is_active")):
                return None
            return self.to_public_user(user)

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
        self.user_repository.find_for_login(normalized_login)
        return {
            "message": (
                "Jesli konto istnieje, prosba o reset hasla zostala zarejestrowana. "
                "Wysylka e-mail bedzie dostepna po konfiguracji SMTP."
            )
        }

    def ensure_view_access(self, current_user: dict[str, Any] | None, view_id: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_access_view(current_user.get("role"), current_user.get("permissions"), view_id):
            raise AuthServiceError("Brak uprawnien do tego modulu.", status_code=403)

    def ensure_manage_access(self, current_user: dict[str, Any] | None, view_id: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_manage_view(current_user.get("role"), current_user.get("permissions"), view_id):
            raise AuthServiceError("Brak uprawnien do zarzadzania tym modulem.", status_code=403)

    def ensure_store_access(self, current_user: dict[str, Any] | None, store_name: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_access_store(current_user.get("role"), current_user.get("permissions"), store_name):
            raise AuthServiceError("Brak uprawnien do tego zasobu.", status_code=403)

    def ensure_store_read_access(self, current_user: dict[str, Any] | None, store_name: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_read_store(current_user.get("role"), current_user.get("permissions"), store_name):
            raise AuthServiceError("Brak uprawnien do tego zasobu.", status_code=403)

    def ensure_store_write_access(self, current_user: dict[str, Any] | None, store_name: str) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if not can_write_store(current_user.get("role"), current_user.get("permissions"), store_name):
            raise AuthServiceError("Brak uprawnien do tego zasobu.", status_code=403)

    def ensure_admin(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise AuthServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) != "admin":
            raise AuthServiceError("Ta operacja wymaga roli admin.", status_code=403)

    @staticmethod
    def to_public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
        return build_public_user(user)

