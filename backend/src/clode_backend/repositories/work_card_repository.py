from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


class WorkCardRepository(RepositoryBase):
    def list_cards(self, *, connection=None) -> list[dict[str, Any]]:
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    """
                    SELECT id, employee_id, employee_name, month_key, month_label, updated_at, rows_json
                    FROM work_cards
                    ORDER BY month_key DESC, LOWER(employee_name) ASC, id ASC
                    """
                ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, employee_id, employee_name, month_key, month_label, updated_at, rows_json
                FROM work_cards
                ORDER BY month_key DESC, LOWER(employee_name) ASC, id ASC
                """
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def get_card(
        self,
        month_key: str,
        *,
        employee_id: str = "",
        employee_name: str = "",
        connection=None,
    ) -> dict[str, Any] | None:
        normalized_month_key = str(month_key or "").strip()
        normalized_employee_id = str(employee_id or "").strip()
        normalized_employee_name = str(employee_name or "").strip().lower()
        if not normalized_month_key:
            return None

        rows = self.list_cards(connection=connection)
        for card in rows:
            if str(card.get("month_key") or "").strip() != normalized_month_key:
                continue
            card_employee_id = str(card.get("employee_id") or "").strip()
            if normalized_employee_id and card_employee_id:
                if card_employee_id == normalized_employee_id:
                    return card
                continue
            if normalized_employee_name and str(card.get("employee_name") or "").strip().lower() == normalized_employee_name:
                return card
        return None

    def save_card(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        card_id = str(payload.get("id") or "").strip()
        employee_id = str(payload.get("employee_id") or "").strip()
        employee_name = str(payload.get("employee_name") or "").strip()
        month_key = str(payload.get("month_key") or "").strip()
        month_label = str(payload.get("month_label") or "").strip()
        updated_at = str(payload.get("updated_at") or "").strip()
        rows_json = json.dumps(payload.get("rows") or [], ensure_ascii=False)

        if connection is None:
            with self.connect() as local_connection:
                self._delete_matching_card(
                    month_key,
                    employee_id=employee_id,
                    employee_name=employee_name,
                    exclude_id=card_id,
                    connection=local_connection,
                )
                local_connection.execute(
                    """
                    INSERT INTO work_cards (id, employee_id, employee_name, month_key, month_label, updated_at, rows_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        employee_id = excluded.employee_id,
                        employee_name = excluded.employee_name,
                        month_key = excluded.month_key,
                        month_label = excluded.month_label,
                        updated_at = excluded.updated_at,
                        rows_json = excluded.rows_json
                    """,
                    (card_id, employee_id, employee_name, month_key, month_label, updated_at, rows_json),
                )
                local_connection.commit()
                return self.get_by_id(card_id, connection=local_connection) or payload

        self._delete_matching_card(
            month_key,
            employee_id=employee_id,
            employee_name=employee_name,
            exclude_id=card_id,
            connection=connection,
        )
        connection.execute(
            """
            INSERT INTO work_cards (id, employee_id, employee_name, month_key, month_label, updated_at, rows_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                employee_id = excluded.employee_id,
                employee_name = excluded.employee_name,
                month_key = excluded.month_key,
                month_label = excluded.month_label,
                updated_at = excluded.updated_at,
                rows_json = excluded.rows_json
            """,
            (card_id, employee_id, employee_name, month_key, month_label, updated_at, rows_json),
        )
        return self.get_by_id(card_id, connection=connection) or payload

    def replace_store(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        normalized = payload if isinstance(payload, dict) else {}
        cards = normalized.get("cards") if isinstance(normalized.get("cards"), list) else []
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute("DELETE FROM work_cards")
                for card in cards:
                    if isinstance(card, dict):
                        self.save_card(card, connection=local_connection)
                local_connection.commit()
                return self.get_store(connection=local_connection)

        connection.execute("DELETE FROM work_cards")
        for card in cards:
            if isinstance(card, dict):
                self.save_card(card, connection=connection)
        return self.get_store(connection=connection)

    def get_store(self, *, connection=None) -> dict[str, Any]:
        return {
            "version": 1,
            "cards": self.list_cards(connection=connection),
        }

    def get_by_id(self, card_id: str, *, connection=None) -> dict[str, Any] | None:
        normalized_card_id = str(card_id or "").strip()
        if not normalized_card_id:
            return None
        if connection is None:
            with self.connect() as local_connection:
                row = local_connection.execute(
                    """
                    SELECT id, employee_id, employee_name, month_key, month_label, updated_at, rows_json
                    FROM work_cards
                    WHERE id = ?
                    """,
                    (normalized_card_id,),
                ).fetchone()
        else:
            row = connection.execute(
                """
                SELECT id, employee_id, employee_name, month_key, month_label, updated_at, rows_json
                FROM work_cards
                WHERE id = ?
                """,
                (normalized_card_id,),
            ).fetchone()
        return self._serialize(row) if row else None

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        try:
            rows = json.loads(row["rows_json"] or "[]")
        except Exception:
            rows = []
        return {
            "id": str(row["id"] or "").strip(),
            "employee_id": str(row["employee_id"] or "").strip(),
            "employee_name": str(row["employee_name"] or "").strip(),
            "month_key": str(row["month_key"] or "").strip(),
            "month_label": str(row["month_label"] or "").strip(),
            "updated_at": str(row["updated_at"] or "").strip(),
            "rows": rows if isinstance(rows, list) else [],
        }

    @staticmethod
    def _delete_matching_card(
        month_key: str,
        *,
        employee_id: str,
        employee_name: str,
        exclude_id: str,
        connection,
    ) -> None:
        if employee_id:
            connection.execute(
                """
                DELETE FROM work_cards
                WHERE month_key = ?
                  AND employee_id = ?
                  AND id <> ?
                """,
                (month_key, employee_id, exclude_id),
            )
            return
        connection.execute(
            """
            DELETE FROM work_cards
            WHERE month_key = ?
              AND lower(employee_name) = lower(?)
              AND id <> ?
            """,
            (month_key, employee_name, exclude_id),
        )
