from __future__ import annotations

from typing import Any

from agent_backend.repositories.base import RepositoryBase
from agent_backend.validation.contracts import normalize_contract_status


class ContractRepository(RepositoryBase):
    def list_all(self, *, include_archived: bool = True) -> list[dict[str, Any]]:
        query = """
            SELECT id, contract_number, name, investor, signed_date, end_date, contract_value,
                   status, created_at, updated_at, deleted_at
            FROM contracts
            WHERE deleted_at IS NULL
        """
        params: tuple[Any, ...] = ()
        if not include_archived:
            query += " AND status = ?"
            params = ("active",)
        query += " ORDER BY status ASC, signed_date ASC, name COLLATE NOCASE ASC"
        with self.connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self._serialize(row) for row in rows]

    def get_by_id(self, contract_id: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, contract_number, name, investor, signed_date, end_date, contract_value,
                       status, created_at, updated_at, deleted_at
                FROM contracts
                WHERE id = ?
                  AND deleted_at IS NULL
                """,
                (contract_id,),
            ).fetchone()
        return self._serialize(row) if row else None

    def get_by_name(self, contract_name: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT id, contract_number, name, investor, signed_date, end_date, contract_value,
                       status, created_at, updated_at, deleted_at
                FROM contracts
                WHERE lower(name) = lower(?)
                  AND deleted_at IS NULL
                LIMIT 1
                """,
                (contract_name,),
            ).fetchone()
        return self._serialize(row) if row else None

    def insert(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO contracts (
                    id, contract_number, name, investor, signed_date, end_date,
                    contract_value, status, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    payload["id"],
                    payload.get("contract_number", ""),
                    payload["name"],
                    payload.get("investor", ""),
                    payload.get("signed_date", ""),
                    payload.get("end_date", ""),
                    payload.get("contract_value", 0),
                    normalize_contract_status(payload.get("status")),
                    payload.get("created_at", ""),
                    payload.get("updated_at", ""),
                ),
            )
            connection.commit()
        return self.get_by_id(payload["id"]) or payload

    def update(self, contract_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE contracts
                SET contract_number = ?,
                    name = ?,
                    investor = ?,
                    signed_date = ?,
                    end_date = ?,
                    contract_value = ?,
                    status = ?,
                    updated_at = ?
                WHERE id = ?
                  AND deleted_at IS NULL
                """,
                (
                    payload.get("contract_number", ""),
                    payload["name"],
                    payload.get("investor", ""),
                    payload.get("signed_date", ""),
                    payload.get("end_date", ""),
                    payload.get("contract_value", 0),
                    normalize_contract_status(payload.get("status")),
                    payload.get("updated_at", ""),
                    contract_id,
                ),
            )
            connection.commit()
        return self.get_by_id(contract_id)

    def archive(self, contract_id: str, *, updated_at: str) -> dict[str, Any] | None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE contracts
                SET status = 'archived',
                    updated_at = ?
                WHERE id = ?
                  AND deleted_at IS NULL
                """,
                (updated_at, contract_id),
            )
            connection.commit()
        return self.get_by_id(contract_id)

    def bulk_archive(self, contract_ids: list[str], *, updated_at: str) -> int:
        clean_ids = [str(contract_id or "").strip() for contract_id in contract_ids if str(contract_id or "").strip()]
        if not clean_ids:
            return 0
        placeholders = ", ".join("?" for _ in clean_ids)
        params = [updated_at, *clean_ids]
        with self.connect() as connection:
            cursor = connection.execute(
                f"""
                UPDATE contracts
                SET status = 'archived',
                    updated_at = ?
                WHERE deleted_at IS NULL
                  AND id IN ({placeholders})
                """,
                params,
            )
            connection.commit()
        return int(cursor.rowcount or 0)

    def get_usage_counts(self, contract_id: str) -> dict[str, int]:
        with self.connect() as connection:
            invoices = connection.execute(
                """
                SELECT COUNT(*) AS total
                FROM invoices
                WHERE contract_id = ?
                  AND is_deleted = 0
                """,
                (contract_id,),
            ).fetchone()
            hours = connection.execute(
                """
                SELECT COUNT(*) AS total
                FROM time_entries
                WHERE contract_id = ?
                """,
                (contract_id,),
            ).fetchone()
            planning = connection.execute(
                """
                SELECT COUNT(*) AS total
                FROM planning_assignments
                WHERE contract_id = ?
                """,
                (contract_id,),
            ).fetchone()
        return {
            "invoices": int(invoices["total"] or 0),
            "hours": int(hours["total"] or 0),
            "planning": int(planning["total"] or 0),
        }

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "contract_number": row["contract_number"] or "",
            "name": row["name"],
            "investor": row["investor"] or "",
            "signed_date": row["signed_date"] or "",
            "end_date": row["end_date"] or "",
            "contract_value": float(row["contract_value"] or 0),
            "status": normalize_contract_status(row["status"]),
            "created_at": row["created_at"] or "",
            "updated_at": row["updated_at"] or "",
            "deleted_at": row["deleted_at"],
        }
