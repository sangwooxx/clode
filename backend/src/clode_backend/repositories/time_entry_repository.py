from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


class TimeEntryRepository(RepositoryBase):
    def list_months(self, *, connection=None) -> list[dict[str, Any]]:
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    """
                    SELECT id, month_key, month_label, selected, visible_investments_json, finance_json
                    FROM hours_months
                    ORDER BY month_key DESC
                    """
                ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, month_key, month_label, selected, visible_investments_json, finance_json
                FROM hours_months
                ORDER BY month_key DESC
                """
            ).fetchall()
        return [self._serialize_month(row) for row in rows]

    def get_month_by_key(self, month_key: str, *, connection=None) -> dict[str, Any] | None:
        if connection is None:
            with self.connect() as local_connection:
                row = local_connection.execute(
                    """
                    SELECT id, month_key, month_label, selected, visible_investments_json, finance_json
                    FROM hours_months
                    WHERE month_key = ?
                    """,
                    (month_key,),
                ).fetchone()
        else:
            row = connection.execute(
                """
                SELECT id, month_key, month_label, selected, visible_investments_json, finance_json
                FROM hours_months
                WHERE month_key = ?
                """,
                (month_key,),
            ).fetchone()
        return self._serialize_month(row) if row else None

    def upsert_month(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        existing = self.get_month_by_key(payload["month_key"], connection=connection)
        month_id = existing["id"] if existing else payload.get("id") or f"hours-month-{payload['month_key']}"
        if connection is None:
            with self.connect() as local_connection:
                if existing:
                    local_connection.execute(
                        """
                        UPDATE hours_months
                        SET month_label = ?, selected = ?, visible_investments_json = ?, finance_json = ?
                        WHERE month_key = ?
                        """,
                        (
                            payload["month_label"],
                            1 if payload.get("selected") else 0,
                            json.dumps(payload.get("visible_investments") or [], ensure_ascii=False),
                            json.dumps(payload.get("finance") or {}, ensure_ascii=False),
                            payload["month_key"],
                        ),
                    )
                else:
                    local_connection.execute(
                        """
                        INSERT INTO hours_months
                        (id, month_key, month_label, selected, visible_investments_json, finance_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            month_id,
                            payload["month_key"],
                            payload["month_label"],
                            1 if payload.get("selected") else 0,
                            json.dumps(payload.get("visible_investments") or [], ensure_ascii=False),
                            json.dumps(payload.get("finance") or {}, ensure_ascii=False),
                        ),
                    )
                local_connection.commit()
        else:
            if existing:
                connection.execute(
                    """
                    UPDATE hours_months
                    SET month_label = ?, selected = ?, visible_investments_json = ?, finance_json = ?
                    WHERE month_key = ?
                    """,
                    (
                        payload["month_label"],
                        1 if payload.get("selected") else 0,
                        json.dumps(payload.get("visible_investments") or [], ensure_ascii=False),
                        json.dumps(payload.get("finance") or {}, ensure_ascii=False),
                        payload["month_key"],
                    ),
                )
            else:
                connection.execute(
                    """
                    INSERT INTO hours_months
                    (id, month_key, month_label, selected, visible_investments_json, finance_json)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        month_id,
                        payload["month_key"],
                        payload["month_label"],
                        1 if payload.get("selected") else 0,
                        json.dumps(payload.get("visible_investments") or [], ensure_ascii=False),
                        json.dumps(payload.get("finance") or {}, ensure_ascii=False),
                    ),
                )
        return self.get_month_by_key(payload["month_key"], connection=connection) or {
            **payload,
            "id": month_id,
        }

    def delete_month(self, month_key: str) -> int:
        with self.connect() as connection:
            cursor = connection.execute(
                "DELETE FROM hours_months WHERE month_key = ?",
                (month_key,),
            )
            connection.commit()
        return int(cursor.rowcount or 0)

    def list_entries(self, filters: dict[str, Any], *, connection=None) -> list[dict[str, Any]]:
        params: list[Any] = []
        conditions = ["1 = 1"]

        month_key = str(filters.get("month") or "").strip()
        contract_id = str(filters.get("contract_id") or "").strip()
        employee_id = str(filters.get("employee_id") or "").strip()
        employee_name = str(filters.get("employee_name") or "").strip()
        user_value = str(filters.get("user") or "").strip()

        if month_key:
            conditions.append("hm.month_key = ?")
            params.append(month_key)

        if contract_id == "unassigned":
            conditions.append(
                "("
                "te.contract_id IS NULL OR trim(te.contract_id) = '' "
                "OR NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = te.contract_id AND c.deleted_at IS NULL)"
                ")"
            )
        elif contract_id:
            conditions.append("te.contract_id = ?")
            params.append(contract_id)

        if employee_id:
            conditions.append("te.employee_id = ?")
            params.append(employee_id)
        elif employee_name:
            conditions.append("lower(trim(te.employee_name)) = lower(trim(?))")
            params.append(employee_name)
        elif user_value:
            conditions.append("(te.employee_id = ? OR lower(trim(te.employee_name)) = lower(trim(?)))")
            params.extend([user_value, user_value])

        where_clause = " WHERE " + " AND ".join(conditions)
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    f"""
                    SELECT
                        te.id,
                        te.month_id,
                        hm.month_key,
                        hm.month_label,
                        te.employee_id,
                        te.employee_name,
                        te.contract_id,
                        te.contract_name,
                        te.hours,
                        te.cost_amount
                    FROM time_entries te
                    JOIN hours_months hm ON hm.id = te.month_id
                    {where_clause}
                    ORDER BY hm.month_key DESC, LOWER(te.employee_name) ASC, LOWER(te.contract_name) ASC
                    """,
                    tuple(params),
                ).fetchall()
        else:
            rows = connection.execute(
                f"""
                SELECT
                    te.id,
                    te.month_id,
                    hm.month_key,
                    hm.month_label,
                    te.employee_id,
                    te.employee_name,
                    te.contract_id,
                    te.contract_name,
                    te.hours,
                    te.cost_amount
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                {where_clause}
                ORDER BY hm.month_key DESC, LOWER(te.employee_name) ASC, LOWER(te.contract_name) ASC
                """,
                tuple(params),
            ).fetchall()
        return [self._serialize_entry(row) for row in rows]

    def list_entries_for_month(self, month_key: str, *, connection=None) -> list[dict[str, Any]]:
        return self.list_entries({"month": month_key}, connection=connection)

    def list_employee_relation_summaries(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    COALESCE(NULLIF(trim(te.employee_id), ''), '') AS employee_id,
                    MAX(trim(te.employee_name)) AS employee_name,
                    COUNT(*) AS hours_entries,
                    COUNT(DISTINCT hm.month_key) AS months_count,
                    COALESCE(SUM(te.hours), 0) AS total_hours,
                    COALESCE(SUM(te.cost_amount), 0) AS total_cost
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                GROUP BY
                    COALESCE(NULLIF(trim(te.employee_id), ''), ''),
                    lower(trim(te.employee_name))
                ORDER BY lower(MAX(trim(te.employee_name))) ASC, employee_id ASC
                """
            ).fetchall()

        return [
            {
                "employee_id": str(row["employee_id"] or "").strip(),
                "employee_name": str(row["employee_name"] or "").strip(),
                "hours_entries": int(row["hours_entries"] or 0),
                "months_count": int(row["months_count"] or 0),
                "total_hours": round(float(row["total_hours"] or 0), 2),
                "total_cost": round(float(row["total_cost"] or 0), 2),
            }
            for row in rows
            if str(row["employee_id"] or "").strip() or str(row["employee_name"] or "").strip()
        ]

    def get_entry(self, entry_id: str, *, connection=None) -> dict[str, Any] | None:
        if connection is None:
            with self.connect() as local_connection:
                row = local_connection.execute(
                    """
                    SELECT
                        te.id,
                        te.month_id,
                        hm.month_key,
                        hm.month_label,
                        te.employee_id,
                        te.employee_name,
                        te.contract_id,
                        te.contract_name,
                        te.hours,
                        te.cost_amount
                    FROM time_entries te
                    JOIN hours_months hm ON hm.id = te.month_id
                    WHERE te.id = ?
                    """,
                    (entry_id,),
                ).fetchone()
        else:
            row = connection.execute(
                """
                SELECT
                    te.id,
                    te.month_id,
                    hm.month_key,
                    hm.month_label,
                    te.employee_id,
                    te.employee_name,
                    te.contract_id,
                    te.contract_name,
                    te.hours,
                    te.cost_amount
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE te.id = ?
                """,
                (entry_id,),
            ).fetchone()
        return self._serialize_entry(row) if row else None

    def find_entry(self, *, month_key: str, employee_id: str | None, employee_name: str, contract_id: str | None) -> dict[str, Any] | None:
        params: list[Any] = [month_key]
        if employee_id:
            employee_clause = (
                "("
                "te.employee_id = ? "
                "OR (trim(COALESCE(te.employee_id, '')) = '' AND lower(trim(te.employee_name)) = lower(trim(?)))"
                ")"
            )
            params.extend([employee_id, employee_name])
        else:
            employee_clause = "lower(trim(te.employee_name)) = lower(trim(?))"
            params.append(employee_name)
        if contract_id:
            contract_clause = "te.contract_id = ?"
            params.append(contract_id)
        else:
            contract_clause = "(te.contract_id IS NULL OR trim(te.contract_id) = '')"
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT
                    te.id,
                    te.month_id,
                    hm.month_key,
                    hm.month_label,
                    te.employee_id,
                    te.employee_name,
                    te.contract_id,
                    te.contract_name,
                    te.hours,
                    te.cost_amount
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE hm.month_key = ?
                  AND {employee_clause}
                  AND {contract_clause}
                ORDER BY
                  CASE
                    WHEN trim(COALESCE(te.employee_id, '')) <> '' THEN 0
                    ELSE 1
                  END,
                  te.id ASC
                LIMIT 1
                """,
                tuple(params),
            ).fetchone()
        return self._serialize_entry(row) if row else None

    def insert_entry(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute(
                    """
                    INSERT INTO time_entries
                    (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        payload["id"],
                        payload["month_id"],
                        payload.get("employee_id"),
                        payload["employee_name"],
                        payload.get("contract_id"),
                        payload.get("contract_name", ""),
                        payload.get("hours", 0),
                        payload.get("cost_amount", 0),
                    ),
                )
                local_connection.commit()
        else:
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload["month_id"],
                    payload.get("employee_id"),
                    payload["employee_name"],
                    payload.get("contract_id"),
                    payload.get("contract_name", ""),
                    payload.get("hours", 0),
                    payload.get("cost_amount", 0),
                ),
            )
        return self.get_entry(payload["id"], connection=connection) or payload

    def update_entry(self, entry_id: str, payload: dict[str, Any], *, connection=None) -> dict[str, Any] | None:
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute(
                    """
                    UPDATE time_entries
                    SET month_id = ?,
                        employee_id = ?,
                        employee_name = ?,
                        contract_id = ?,
                        contract_name = ?,
                        hours = ?,
                        cost_amount = ?
                    WHERE id = ?
                    """,
                    (
                        payload["month_id"],
                        payload.get("employee_id"),
                        payload["employee_name"],
                        payload.get("contract_id"),
                        payload.get("contract_name", ""),
                        payload.get("hours", 0),
                        payload.get("cost_amount", 0),
                        entry_id,
                    ),
                )
                local_connection.commit()
        else:
            connection.execute(
                """
                UPDATE time_entries
                SET month_id = ?,
                    employee_id = ?,
                    employee_name = ?,
                    contract_id = ?,
                    contract_name = ?,
                    hours = ?,
                    cost_amount = ?
                WHERE id = ?
                """,
                (
                    payload["month_id"],
                    payload.get("employee_id"),
                    payload["employee_name"],
                    payload.get("contract_id"),
                    payload.get("contract_name", ""),
                    payload.get("hours", 0),
                    payload.get("cost_amount", 0),
                    entry_id,
                ),
            )
        return self.get_entry(entry_id, connection=connection)

    def update_entry_cost_amount(self, entry_id: str, cost_amount: float) -> None:
        with self.connect() as connection:
            connection.execute(
                "UPDATE time_entries SET cost_amount = ? WHERE id = ?",
                (cost_amount, entry_id),
            )
            connection.commit()

    def delete_entry(self, entry_id: str, *, connection=None) -> int:
        if connection is None:
            with self.connect() as local_connection:
                cursor = local_connection.execute("DELETE FROM time_entries WHERE id = ?", (entry_id,))
                local_connection.commit()
        else:
            cursor = connection.execute("DELETE FROM time_entries WHERE id = ?", (entry_id,))
        return int(cursor.rowcount or 0)

    def recalculate_month_costs(self, month_key: str, *, connection=None) -> bool:
        month = self.get_month_by_key(month_key, connection=connection)
        if not month:
            return False

        entries = self.list_entries_for_month(month_key, connection=connection)
        total_hours = sum(float(entry.get("hours") or 0) for entry in entries)
        finance = month.get("finance") or {}
        total_cost_pool = (
            float(finance.get("payouts") or 0)
            + float(finance.get("zus_company_1") or 0)
            + float(finance.get("zus_company_2") or 0)
            + float(finance.get("zus_company_3") or 0)
            + float(finance.get("pit4_company_1") or 0)
            + float(finance.get("pit4_company_2") or 0)
            + float(finance.get("pit4_company_3") or 0)
        )
        hourly_cost = (total_cost_pool / total_hours) if total_hours else 0.0
        if connection is None:
            with self.connect() as local_connection:
                for entry in entries:
                    local_connection.execute(
                        "UPDATE time_entries SET cost_amount = ? WHERE id = ?",
                        (round(float(entry.get("hours") or 0) * hourly_cost, 2), entry["id"]),
                    )
                local_connection.commit()
        else:
            for entry in entries:
                connection.execute(
                    "UPDATE time_entries SET cost_amount = ? WHERE id = ?",
                    (round(float(entry.get("hours") or 0) * hourly_cost, 2), entry["id"]),
                )
        return True

    def normalize_month_visible_investments(self, rows: list[dict[str, Any]]) -> None:
        for row in rows:
            self.upsert_month(row)

    def sync_contract_visibility(self, contract_id: str, *, visible: bool) -> int:
        normalized_contract_id = str(contract_id or "").strip()
        if not normalized_contract_id:
            return 0

        changed_rows: list[dict[str, Any]] = []
        for month in self.list_months():
            current_values = [
                str(value or "").strip()
                for value in (month.get("visible_investments") or [])
                if str(value or "").strip()
            ]
            next_values: list[str] = []
            seen = set()

            for value in current_values:
                if value == normalized_contract_id and not visible:
                    continue
                if value in seen:
                    continue
                seen.add(value)
                next_values.append(value)

            if visible and normalized_contract_id not in seen:
                next_values.append(normalized_contract_id)

            if next_values != current_values:
                changed_rows.append(
                    {
                        **month,
                        "visible_investments": next_values,
                    }
                )

        if changed_rows:
            self.normalize_month_visible_investments(changed_rows)

        return len(changed_rows)

    def normalize_legacy_employee_duplicates(self) -> list[str]:
        with self.connect() as connection:
            groups = connection.execute(
                """
                SELECT
                    te.month_id,
                    hm.month_key,
                    lower(trim(te.employee_name)) AS employee_name_key,
                    COALESCE(NULLIF(trim(te.contract_id), ''), '__unassigned__') AS contract_key,
                    COUNT(*) AS rows_total,
                    SUM(CASE WHEN trim(COALESCE(te.employee_id, '')) = '' THEN 1 ELSE 0 END) AS blank_id_rows,
                    SUM(CASE WHEN trim(COALESCE(te.employee_id, '')) <> '' THEN 1 ELSE 0 END) AS linked_rows,
                    COUNT(DISTINCT CASE WHEN trim(COALESCE(te.employee_id, '')) <> '' THEN trim(te.employee_id) END) AS linked_employee_ids
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE trim(COALESCE(te.employee_name, '')) <> ''
                GROUP BY te.month_id, hm.month_key, lower(trim(te.employee_name)), COALESCE(NULLIF(trim(te.contract_id), ''), '__unassigned__')
                HAVING SUM(CASE WHEN trim(COALESCE(te.employee_id, '')) = '' THEN 1 ELSE 0 END) > 0
                   AND SUM(CASE WHEN trim(COALESCE(te.employee_id, '')) <> '' THEN 1 ELSE 0 END) > 0
                   AND COUNT(DISTINCT CASE WHEN trim(COALESCE(te.employee_id, '')) <> '' THEN trim(te.employee_id) END) = 1
                """
            ).fetchall()

            deleted_total = 0
            affected_months: set[str] = set()
            for group in groups:
                contract_id = "" if group["contract_key"] == "__unassigned__" else group["contract_key"]
                params: list[Any] = [
                    group["month_id"],
                    group["employee_name_key"],
                ]
                contract_clause = "(te.contract_id IS NULL OR trim(te.contract_id) = '')"
                if contract_id:
                    contract_clause = "trim(COALESCE(te.contract_id, '')) = ?"
                    params.append(contract_id)

                canonical = connection.execute(
                    f"""
                    SELECT te.id
                    FROM time_entries te
                    WHERE te.month_id = ?
                      AND lower(trim(te.employee_name)) = ?
                      AND {contract_clause}
                      AND trim(COALESCE(te.employee_id, '')) <> ''
                    ORDER BY te.id DESC
                    LIMIT 1
                    """,
                    tuple(params),
                ).fetchone()
                if not canonical:
                    continue

                delete_params: list[Any] = [
                    group["month_id"],
                    group["employee_name_key"],
                ]
                delete_contract_clause = "(contract_id IS NULL OR trim(contract_id) = '')"
                if contract_id:
                    delete_contract_clause = "trim(COALESCE(contract_id, '')) = ?"
                    delete_params.append(contract_id)
                delete_params.append(canonical["id"])

                cursor = connection.execute(
                    f"""
                    DELETE FROM time_entries
                    WHERE month_id = ?
                      AND lower(trim(employee_name)) = ?
                      AND {delete_contract_clause}
                      AND trim(COALESCE(employee_id, '')) = ''
                      AND id <> ?
                    """,
                    tuple(delete_params),
                )
                deleted_count = int(cursor.rowcount or 0)
                deleted_total += deleted_count
                if deleted_count:
                    affected_months.add(str(group["month_key"] or "").strip())

            if deleted_total:
                connection.commit()

        return sorted(month_key for month_key in affected_months if month_key)

    @staticmethod
    def _serialize_month(row) -> dict[str, Any]:
        if row is None:
            return {}
        try:
            visible_investments = json.loads(row["visible_investments_json"] or "[]")
        except Exception:
            visible_investments = []
        try:
            finance = json.loads(row["finance_json"] or "{}")
        except Exception:
            finance = {}
        return {
            "id": row["id"],
            "month_key": row["month_key"],
            "month_label": row["month_label"] or row["month_key"],
            "selected": bool(row["selected"]),
            "visible_investments": visible_investments if isinstance(visible_investments, list) else [],
            "finance": finance if isinstance(finance, dict) else {},
        }

    @staticmethod
    def _serialize_entry(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "month_id": row["month_id"],
            "month_key": row["month_key"],
            "month_label": row["month_label"] or row["month_key"],
            "employee_id": row["employee_id"] or "",
            "employee_name": row["employee_name"] or "",
            "contract_id": row["contract_id"] or "",
            "contract_name": row["contract_name"] or "",
            "hours": float(row["hours"] or 0),
            "cost_amount": float(row["cost_amount"] or 0),
        }

