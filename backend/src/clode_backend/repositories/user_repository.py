from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


class UserRepository(RepositoryBase):
    def count(self) -> int:
        with self.connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        return int(row["count"] if row else 0)

    def list_all(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, name, username, email, password_hash, role, status,
                       permissions_json, can_approve_vacations, is_active,
                       created_at, updated_at, last_login_at
                FROM users
                ORDER BY LOWER(name) ASC
                """
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, username, email, password_hash, role, status,
                       permissions_json, can_approve_vacations, is_active,
                       created_at, updated_at, last_login_at
                FROM users
                WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        return self._serialize(row) if row else None

    def get_by_username(self, username: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, username, email, password_hash, role, status,
                       permissions_json, can_approve_vacations, is_active,
                       created_at, updated_at, last_login_at
                FROM users
                WHERE lower(username) = lower(?)
                """,
                (username,),
            ).fetchone()
        return self._serialize(row) if row else None

    def get_by_email(self, email: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, username, email, password_hash, role, status,
                       permissions_json, can_approve_vacations, is_active,
                       created_at, updated_at, last_login_at
                FROM users
                WHERE lower(email) = lower(?)
                """,
                (email,),
            ).fetchone()
        return self._serialize(row) if row else None

    def find_for_login(self, login_value: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, username, email, password_hash, role, status,
                       permissions_json, can_approve_vacations, is_active,
                       created_at, updated_at, last_login_at
                FROM users
                WHERE lower(username) = lower(?)
                   OR lower(email) = lower(?)
                   OR lower(name) = lower(?)
                LIMIT 1
                """,
                (login_value, login_value, login_value),
            ).fetchone()
        return self._serialize(row) if row else None

    def insert(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO users (
                    id, name, username, email, password_hash, role, status,
                    permissions_json, can_approve_vacations, is_active,
                    created_at, updated_at, last_login_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["name"],
                    payload["username"],
                    payload.get("email", ""),
                    payload["password_hash"],
                    payload["role"],
                    payload["status"],
                    json.dumps(payload.get("permissions", {}), ensure_ascii=False),
                    1 if payload.get("can_approve_vacations") else 0,
                    1 if payload.get("is_active", True) else 0,
                    payload["created_at"],
                    payload["updated_at"],
                    payload.get("last_login_at"),
                ),
            )
            connection.commit()
        return self.get_by_id(payload["id"]) or payload

    def update(self, user_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE users
                SET name = ?,
                    username = ?,
                    email = ?,
                    password_hash = ?,
                    role = ?,
                    status = ?,
                    permissions_json = ?,
                    can_approve_vacations = ?,
                    is_active = ?,
                    updated_at = ?,
                    last_login_at = ?
                WHERE id = ?
                """,
                (
                    payload["name"],
                    payload["username"],
                    payload.get("email", ""),
                    payload["password_hash"],
                    payload["role"],
                    payload["status"],
                    json.dumps(payload.get("permissions", {}), ensure_ascii=False),
                    1 if payload.get("can_approve_vacations") else 0,
                    1 if payload.get("is_active", True) else 0,
                    payload["updated_at"],
                    payload.get("last_login_at"),
                    user_id,
                ),
            )
            connection.commit()
        return self.get_by_id(user_id)

    def delete(self, user_id: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM users WHERE id = ?", (user_id,))
            connection.commit()

    def touch_last_login(self, user_id: str, timestamp_iso: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE users
                SET last_login_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (timestamp_iso, timestamp_iso, user_id),
            )
            connection.commit()

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        return {
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
        }

