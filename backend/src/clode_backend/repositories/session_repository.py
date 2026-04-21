from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


class SessionRepository(RepositoryBase):
    def create(self, payload: dict[str, Any]) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO auth_sessions (
                    id, user_id, session_token_hash, created_at,
                    expires_at, last_seen_at, revoked_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["user_id"],
                    payload["session_token_hash"],
                    payload["created_at"],
                    payload["expires_at"],
                    payload["last_seen_at"],
                    payload.get("revoked_at"),
                ),
            )
            connection.commit()

    def get_with_user(self, token_hash: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT s.id AS session_id,
                       s.user_id,
                       s.session_token_hash,
                       s.created_at AS session_created_at,
                       s.expires_at,
                       s.last_seen_at,
                       s.revoked_at,
                       u.id,
                       u.name,
                       u.username,
                       u.email,
                       u.password_hash,
                       u.role,
                       u.status,
                       u.permissions_json,
                       u.can_approve_vacations,
                       u.is_active,
                       u.created_at,
                       u.updated_at,
                       u.last_login_at
                FROM auth_sessions s
                INNER JOIN users u ON u.id = s.user_id
                WHERE s.session_token_hash = ?
                """,
                (token_hash,),
            ).fetchone()
        if not row:
            return None
        return {
            "session": {
                "id": row["session_id"],
                "user_id": row["user_id"],
                "session_token_hash": row["session_token_hash"],
                "created_at": row["session_created_at"],
                "expires_at": row["expires_at"],
                "last_seen_at": row["last_seen_at"],
                "revoked_at": row["revoked_at"],
            },
            "user": {
                "id": row["id"],
                "name": row["name"],
                "username": row["username"],
                "email": row["email"],
                "password_hash": row["password_hash"],
                "role": row["role"],
                "status": row["status"],
                "permissions": json.loads(row["permissions_json"] or "{}"),
                "can_approve_vacations": bool(row["can_approve_vacations"]),
                "is_active": bool(row["is_active"]),
                "created_at": row["created_at"] or "",
                "updated_at": row["updated_at"] or "",
                "last_login_at": row["last_login_at"] or "",
            },
        }

    def touch(self, session_id: str, timestamp_iso: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE auth_sessions
                SET last_seen_at = ?
                WHERE id = ?
                """,
                (timestamp_iso, session_id),
            )
            connection.commit()

    def revoke(self, token_hash: str, timestamp_iso: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = COALESCE(revoked_at, ?)
                WHERE session_token_hash = ?
                """,
                (timestamp_iso, token_hash),
            )
            connection.commit()

    def revoke_all_for_user(self, user_id: str, timestamp_iso: str) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                """
                UPDATE auth_sessions
                SET revoked_at = COALESCE(revoked_at, ?)
                WHERE user_id = ?
                  AND revoked_at IS NULL
                """,
                (timestamp_iso, user_id),
            )
            connection.commit()
        return int(cursor.rowcount or 0)

