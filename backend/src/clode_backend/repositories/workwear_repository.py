from __future__ import annotations

from typing import Any

from clode_backend.repositories.base import RepositoryBase


class WorkwearRepository(RepositoryBase):
    def list_catalog(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, name, category, notes
                FROM workwear_catalog
                ORDER BY LOWER(name) ASC, id ASC
                """
            ).fetchall()
        return [self._serialize_catalog_item(row) for row in rows]

    def replace_catalog(self, items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        keep_ids = {str(item["id"]) for item in items if str(item.get("id") or "").strip()}
        with self.connect() as connection:
            if keep_ids:
                placeholders = ", ".join("?" for _ in keep_ids)
                connection.execute(
                    f"DELETE FROM workwear_catalog WHERE id NOT IN ({placeholders})",
                    tuple(keep_ids),
                )
            else:
                connection.execute("DELETE FROM workwear_catalog")

            for item in items:
                connection.execute(
                    """
                    INSERT INTO workwear_catalog (id, name, category, notes)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        name = excluded.name,
                        category = excluded.category,
                        notes = excluded.notes
                    """,
                    (
                        item["id"],
                        item["name"],
                        item["category"],
                        item["notes"],
                    ),
                )
            connection.commit()
        return self.list_catalog()

    def list_issues(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT id, employee_id, employee_key, employee_name, issue_date,
                       item_id, item_name, size, quantity, notes
                FROM workwear_issues
                ORDER BY issue_date DESC, id DESC
                """
            ).fetchall()
        return [self._serialize_issue(row) for row in rows]

    def replace_issues(self, issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
        keep_ids = {str(issue["id"]) for issue in issues if str(issue.get("id") or "").strip()}
        with self.connect() as connection:
            if keep_ids:
                placeholders = ", ".join("?" for _ in keep_ids)
                connection.execute(
                    f"DELETE FROM workwear_issues WHERE id NOT IN ({placeholders})",
                    tuple(keep_ids),
                )
            else:
                connection.execute("DELETE FROM workwear_issues")

            for issue in issues:
                connection.execute(
                    """
                    INSERT INTO workwear_issues (
                        id,
                        employee_id,
                        employee_key,
                        employee_name,
                        issue_date,
                        item_id,
                        item_name,
                        size,
                        quantity,
                        notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET
                        employee_id = excluded.employee_id,
                        employee_key = excluded.employee_key,
                        employee_name = excluded.employee_name,
                        issue_date = excluded.issue_date,
                        item_id = excluded.item_id,
                        item_name = excluded.item_name,
                        size = excluded.size,
                        quantity = excluded.quantity,
                        notes = excluded.notes
                    """,
                    self._issue_params(connection, issue),
                )
            connection.commit()
        return self.list_issues()

    def _issue_params(self, connection, issue: dict[str, Any]) -> tuple[Any, ...]:
        employee_id = str(issue.get("employee_id") or "").strip() or None
        if employee_id and not self._reference_exists(connection, "employees", employee_id):
            employee_id = None

        item_id = str(issue.get("item_id") or "").strip() or None
        if item_id and not self._reference_exists(connection, "workwear_catalog", item_id):
            item_id = None

        return (
            issue["id"],
            employee_id,
            issue.get("employee_key"),
            issue["employee_name"],
            issue["issue_date"],
            item_id,
            issue["item_name"],
            issue["size"],
            issue["quantity"],
            issue["notes"],
        )

    @staticmethod
    def _reference_exists(connection, table_name: str, record_id: str) -> bool:
        row = connection.execute(
            f"SELECT id FROM {table_name} WHERE id = ?",
            (record_id,),
        ).fetchone()
        return bool(row)

    @staticmethod
    def _serialize_catalog_item(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": row["name"] or "",
            "category": row["category"] or "",
            "notes": row["notes"] or "",
        }

    @staticmethod
    def _serialize_issue(row) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "id": row["id"],
            "employee_name": row["employee_name"] or "",
            "issue_date": row["issue_date"] or "",
            "item_id": row["item_id"] or "",
            "item_name": row["item_name"] or "",
            "size": row["size"] or "",
            "quantity": float(row["quantity"] or 0),
            "notes": row["notes"] or "",
        }
        if row["employee_id"]:
            payload["employee_id"] = row["employee_id"]
        if row["employee_key"]:
            payload["employee_key"] = row["employee_key"]
        return payload
