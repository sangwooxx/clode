from __future__ import annotations

from typing import Any

from clode_backend.auth.sessions import utc_now_iso
from clode_backend.repositories.base import RepositoryBase


class SettingsRepository(RepositoryBase):
    WORKFLOW_ID = "vacations"

    def get_workflow(self) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, vacation_approval_mode, vacation_notifications, updated_at
                FROM settings_workflow
                WHERE id = ?
                """,
                (self.WORKFLOW_ID,),
            ).fetchone()
        return self._serialize_workflow(row) if row else None

    def save_workflow(self, payload: dict[str, Any]) -> dict[str, Any]:
        updated_at = utc_now_iso()
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO settings_workflow (
                    id,
                    vacation_approval_mode,
                    vacation_notifications,
                    updated_at
                ) VALUES (?, ?, ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                    vacation_approval_mode = excluded.vacation_approval_mode,
                    vacation_notifications = excluded.vacation_notifications,
                    updated_at = excluded.updated_at
                """,
                (
                    self.WORKFLOW_ID,
                    payload["vacationApprovalMode"],
                    payload["vacationNotifications"],
                    updated_at,
                ),
            )
            connection.commit()
        return self.get_workflow() or {
            "vacationApprovalMode": payload["vacationApprovalMode"],
            "vacationNotifications": payload["vacationNotifications"],
            "updated_at": updated_at,
        }

    def list_audit_logs(self, *, limit: int = 1500) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, timestamp, module, action, subject, details, user_id, user_name
                FROM audit_logs
                ORDER BY timestamp DESC, id DESC
                LIMIT ?
                """,
                (int(limit),),
            ).fetchall()
        return [self._serialize_audit_log(row) for row in rows]

    def append_audit_log(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO audit_logs (
                    id,
                    timestamp,
                    module,
                    action,
                    subject,
                    details,
                    user_id,
                    user_name
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["timestamp"],
                    payload["module"],
                    payload["action"],
                    payload["subject"],
                    payload["details"],
                    payload["user_id"],
                    payload["user_name"],
                ),
            )
            connection.commit()
        return payload

    def import_audit_logs(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not entries:
            return []
        with self.connect() as connection:
            for entry in entries:
                connection.execute(
                    """
                    INSERT INTO audit_logs (
                        id,
                        timestamp,
                        module,
                        action,
                        subject,
                        details,
                        user_id,
                        user_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (
                        entry["id"],
                        entry["timestamp"],
                        entry["module"],
                        entry["action"],
                        entry["subject"],
                        entry["details"],
                        entry["user_id"],
                        entry["user_name"],
                    ),
                )
            connection.commit()
        return self.list_audit_logs(limit=max(len(entries), 1500))

    def prune_audit_logs(self, *, limit: int = 1500) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                DELETE FROM audit_logs
                WHERE id NOT IN (
                    SELECT id
                    FROM audit_logs
                    ORDER BY timestamp DESC, id DESC
                    LIMIT ?
                )
                """,
                (int(limit),),
            )
            connection.commit()

    @staticmethod
    def _serialize_workflow(row) -> dict[str, Any]:
        return {
            "vacationApprovalMode": row["vacation_approval_mode"],
            "vacationNotifications": row["vacation_notifications"],
            "updated_at": row["updated_at"] or "",
        }

    @staticmethod
    def _serialize_audit_log(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "timestamp": row["timestamp"] or "",
            "module": row["module"] or "",
            "action": row["action"] or "",
            "subject": row["subject"] or "",
            "details": row["details"] or "",
            "user_id": row["user_id"] or "",
            "user_name": row["user_name"] or "",
        }
