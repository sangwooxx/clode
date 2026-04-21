from __future__ import annotations

from typing import Any

from clode_backend.repositories.base import RepositoryBase


def _effective_payment_status_sql(*, table_alias: str = "") -> str:
    prefix = f"{table_alias}." if table_alias else ""
    due_date_value = f"trim(COALESCE({prefix}due_date, ''))"
    return (
        "CASE "
        f"WHEN trim(COALESCE({prefix}payment_date, '')) <> '' THEN 'paid' "
        f"WHEN lower(trim(COALESCE({prefix}payment_status, ''))) = 'paid' THEN 'paid' "
        f"WHEN {due_date_value} <> '' AND {due_date_value} < CAST(CURRENT_DATE AS TEXT) THEN 'overdue' "
        "ELSE 'unpaid' "
        "END"
    )


def _orphan_contract_condition(column_name: str) -> str:
    return (
        f"({column_name} IS NOT NULL AND trim({column_name}) <> '' "
        f"AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.id = {column_name} AND c.deleted_at IS NULL))"
    )


def _apply_invoice_filters(filters: dict[str, Any], params: list[Any]) -> str:
    conditions = ["is_deleted = 0"]

    contract_id = str(filters.get("contract_id") or "").strip()
    unassigned = bool(filters.get("unassigned"))
    invoice_type = str(filters.get("type") or "").strip()
    payment_status = str(filters.get("payment_status") or "").strip()
    scope = str(filters.get("scope") or "all").strip()
    year = str(filters.get("year") or "").strip()
    month = str(filters.get("month") or "").strip().zfill(2) if str(filters.get("month") or "").strip() else ""

    if unassigned:
        conditions.append(f"((contract_id IS NULL OR trim(contract_id) = '') OR {_orphan_contract_condition('contract_id')})")
    elif contract_id:
        conditions.append("contract_id = ?")
        params.append(contract_id)

    if invoice_type:
        conditions.append("type = ?")
        params.append(invoice_type)

    if payment_status:
        conditions.append(f"{_effective_payment_status_sql()} = ?")
        params.append(payment_status)

    if scope == "year" and year:
        conditions.append("substr(issue_date, 1, 4) = ?")
        params.append(year)
    elif scope == "month" and year and month:
        conditions.append("substr(issue_date, 1, 4) = ?")
        conditions.append("substr(issue_date, 6, 2) = ?")
        params.extend([year, month])

    return " WHERE " + " AND ".join(conditions)


class InvoiceRepository(RepositoryBase):
    def list_filtered(self, filters: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[Any] = []
        where_clause = _apply_invoice_filters(filters, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT id, contract_id, contract_name, type, issue_date, invoice_number,
                       counterparty_name, category_or_description, cost_category, amount_net, vat_rate,
                       amount_vat, amount_gross, due_date, payment_date, payment_status,
                       notes, created_at, updated_at, created_by, updated_by, is_deleted,
                       {_effective_payment_status_sql()} AS effective_payment_status
                FROM invoices
                {where_clause}
                ORDER BY issue_date DESC, LOWER(invoice_number) ASC, updated_at DESC
                """,
                tuple(params),
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def get_by_id(self, invoice_id: str, *, include_deleted: bool = False) -> dict[str, Any] | None:
        query = f"""
            SELECT id, contract_id, contract_name, type, issue_date, invoice_number,
                   counterparty_name, category_or_description, cost_category, amount_net, vat_rate,
                   amount_vat, amount_gross, due_date, payment_date, payment_status,
                   notes, created_at, updated_at, created_by, updated_by, is_deleted,
                   {_effective_payment_status_sql()} AS effective_payment_status
            FROM invoices
            WHERE id = ?
        """
        params: list[Any] = [invoice_id]
        if not include_deleted:
            query += " AND is_deleted = 0"
        with self.connect() as connection:
            row = connection.execute(query, tuple(params)).fetchone()
        return self._serialize(row) if row else None

    def insert(self, payload: dict[str, Any]) -> dict[str, Any]:
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO invoices (
                    id, contract_id, contract_name, type, issue_date, invoice_number,
                    counterparty_name, category_or_description, cost_category, amount_net, vat_rate,
                    amount_vat, amount_gross, due_date, payment_date, payment_status,
                    notes, created_at, updated_at, created_by, updated_by, is_deleted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    payload.get("contract_id"),
                    payload.get("contract_name", ""),
                    payload["type"],
                    payload.get("issue_date", ""),
                    payload.get("invoice_number", ""),
                    payload.get("counterparty_name", ""),
                    payload.get("category_or_description", ""),
                    payload.get("cost_category", ""),
                    payload.get("amount_net", 0),
                    payload.get("vat_rate", 0),
                    payload.get("amount_vat", 0),
                    payload.get("amount_gross", 0),
                    payload.get("due_date", ""),
                    payload.get("payment_date", ""),
                    payload.get("payment_status", "unpaid"),
                    payload.get("notes", ""),
                    payload.get("created_at", ""),
                    payload.get("updated_at", ""),
                    payload.get("created_by", ""),
                    payload.get("updated_by", ""),
                    1 if payload.get("is_deleted") else 0,
                ),
            )
            connection.commit()
        return self.get_by_id(payload["id"], include_deleted=True) or payload

    def update(self, invoice_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE invoices
                SET contract_id = ?,
                    contract_name = ?,
                    type = ?,
                    issue_date = ?,
                    invoice_number = ?,
                    counterparty_name = ?,
                    category_or_description = ?,
                    cost_category = ?,
                    amount_net = ?,
                    vat_rate = ?,
                    amount_vat = ?,
                    amount_gross = ?,
                    due_date = ?,
                    payment_date = ?,
                    payment_status = ?,
                    notes = ?,
                    updated_at = ?,
                    updated_by = ?
                WHERE id = ?
                """,
                (
                    payload.get("contract_id"),
                    payload.get("contract_name", ""),
                    payload["type"],
                    payload.get("issue_date", ""),
                    payload.get("invoice_number", ""),
                    payload.get("counterparty_name", ""),
                    payload.get("category_or_description", ""),
                    payload.get("cost_category", ""),
                    payload.get("amount_net", 0),
                    payload.get("vat_rate", 0),
                    payload.get("amount_vat", 0),
                    payload.get("amount_gross", 0),
                    payload.get("due_date", ""),
                    payload.get("payment_date", ""),
                    payload.get("payment_status", "unpaid"),
                    payload.get("notes", ""),
                    payload.get("updated_at", ""),
                    payload.get("updated_by", ""),
                    invoice_id,
                ),
            )
            connection.commit()
        return self.get_by_id(invoice_id, include_deleted=True)

    def soft_delete(self, invoice_id: str, *, updated_at: str, updated_by: str) -> None:
        with self.connect() as connection:
            connection.execute(
                """
                UPDATE invoices
                SET is_deleted = 1,
                    updated_at = ?,
                    updated_by = ?
                WHERE id = ?
                """,
                (updated_at, updated_by, invoice_id),
            )
            connection.commit()

    def bulk_soft_delete(self, invoice_ids: list[str], *, updated_at: str, updated_by: str) -> int:
        if not invoice_ids:
            return 0
        placeholders = ", ".join(["?"] * len(invoice_ids))
        with self.connect() as connection:
            cursor = connection.execute(
                f"""
                UPDATE invoices
                SET is_deleted = 1,
                    updated_at = ?,
                    updated_by = ?
                WHERE id IN ({placeholders})
                """,
                (updated_at, updated_by, *invoice_ids),
            )
            connection.commit()
        return int(cursor.rowcount or 0)

    def aggregate_stats(self, filters: dict[str, Any]) -> dict[str, Any]:
        params: list[Any] = []
        where_clause = _apply_invoice_filters({**filters, "type": ""}, params)
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT
                    COALESCE(SUM(CASE WHEN type = 'cost' THEN 1 ELSE 0 END), 0) AS cost_count,
                    COALESCE(SUM(CASE WHEN type = 'cost' THEN amount_net ELSE 0 END), 0) AS cost_net,
                    COALESCE(SUM(CASE WHEN type = 'sales' THEN 1 ELSE 0 END), 0) AS sales_count,
                    COALESCE(SUM(CASE WHEN type = 'sales' THEN amount_net ELSE 0 END), 0) AS sales_net
                FROM invoices
                {where_clause}
                """,
                tuple(params),
            ).fetchone()
        return {
            "cost_count": int(row["cost_count"] or 0),
            "cost_net": float(row["cost_net"] or 0),
            "sales_count": int(row["sales_count"] or 0),
            "sales_net": float(row["sales_net"] or 0),
            "saldo_net": float((row["sales_net"] or 0) - (row["cost_net"] or 0)),
        }

    def aggregate_summary(self, filters: dict[str, Any]) -> dict[str, Any]:
        params: list[Any] = []
        where_clause = _apply_invoice_filters(filters, params)
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT
                    COUNT(*) AS count,
                    COALESCE(SUM(amount_net), 0) AS amount_net,
                    COALESCE(SUM(amount_vat), 0) AS amount_vat,
                    COALESCE(SUM(amount_gross), 0) AS amount_gross
                FROM invoices
                {where_clause}
                """,
                tuple(params),
            ).fetchone()
        return {
            "count": int(row["count"] or 0),
            "amount_net": float(row["amount_net"] or 0),
            "amount_vat": float(row["amount_vat"] or 0),
            "amount_gross": float(row["amount_gross"] or 0),
        }

    def list_years(self, *, contract_id: str = "", unassigned: bool = False) -> list[str]:
        params: list[Any] = []
        where_clause = _apply_invoice_filters(
            {
                "contract_id": contract_id,
                "unassigned": unassigned,
                "scope": "all",
                "type": "",
                "payment_status": "",
            },
            params,
        )
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT DISTINCT substr(issue_date, 1, 4) AS year_value
                FROM invoices
                {where_clause}
                  AND issue_date <> ''
                ORDER BY year_value DESC
                """,
                tuple(params),
            ).fetchall()
        return [row["year_value"] for row in rows if row["year_value"]]

    def list_months(self, *, contract_id: str = "", unassigned: bool = False, year: str = "") -> list[str]:
        params: list[Any] = []
        where_clause = _apply_invoice_filters(
            {
                "contract_id": contract_id,
                "unassigned": unassigned,
                "scope": "year" if year else "all",
                "year": year,
                "type": "",
                "payment_status": "",
            },
            params,
        )
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT DISTINCT substr(issue_date, 6, 2) AS month_value
                FROM invoices
                {where_clause}
                  AND issue_date <> ''
                ORDER BY month_value ASC
                """,
                tuple(params),
            ).fetchall()
        return [row["month_value"] for row in rows if row["month_value"]]

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "contract_id": row["contract_id"] or "",
            "contract_name": row["contract_name"] or "",
            "type": row["type"],
            "issue_date": row["issue_date"] or "",
            "invoice_number": row["invoice_number"] or "",
            "counterparty_name": row["counterparty_name"] or "",
            "category_or_description": row["category_or_description"] or "",
            "cost_category": row["cost_category"] or "",
            "amount_net": float(row["amount_net"] or 0),
            "vat_rate": float(row["vat_rate"] or 0),
            "amount_vat": float(row["amount_vat"] or 0),
            "amount_gross": float(row["amount_gross"] or 0),
            "due_date": row["due_date"] or "",
            "payment_date": row["payment_date"] or "",
            "payment_status": row["effective_payment_status"] or row["payment_status"] or "unpaid",
            "notes": row["notes"] or "",
            "created_at": row["created_at"] or "",
            "updated_at": row["updated_at"] or "",
            "created_by": row["created_by"] or "",
            "updated_by": row["updated_by"] or "",
            "is_deleted": bool(row["is_deleted"]),
        }

