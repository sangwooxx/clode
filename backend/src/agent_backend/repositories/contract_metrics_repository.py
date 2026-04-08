from __future__ import annotations

from typing import Any

from agent_backend.repositories.base import RepositoryBase


ALLOWED_COST_CATEGORIES = ("materials", "labor", "equipment", "transport", "services", "other")


def _invoice_time_where(time_range: dict[str, Any], params: list[Any]) -> str:
    scope = str(time_range.get("scope") or "all")
    year = str(time_range.get("year") or "")
    month = str(time_range.get("month") or "")
    conditions: list[str] = []

    if scope == "year" and year:
        conditions.append("substr(issue_date, 1, 4) = ?")
        params.append(year)
    elif scope == "month" and year and month:
        conditions.append("substr(issue_date, 1, 4) = ?")
        conditions.append("substr(issue_date, 6, 2) = ?")
        params.extend([year, month])

    return (" AND " + " AND ".join(conditions)) if conditions else ""


def _hours_time_where(time_range: dict[str, Any], params: list[Any]) -> str:
    scope = str(time_range.get("scope") or "all")
    year = str(time_range.get("year") or "")
    month = str(time_range.get("month") or "")
    conditions: list[str] = []

    if scope == "year" and year:
        conditions.append("substr(hm.month_key, 1, 4) = ?")
        params.append(year)
    elif scope == "month" and year and month:
        conditions.append("substr(hm.month_key, 1, 4) = ?")
        conditions.append("substr(hm.month_key, 6, 2) = ?")
        params.extend([year, month])

    return (" AND " + " AND ".join(conditions)) if conditions else ""


def _contract_selector(column_name: str, contract_id: str, params: list[Any]) -> str:
    if contract_id == "unassigned":
        return f" AND ({column_name} IS NULL OR trim({column_name}) = '')"
    if contract_id == "__assigned__":
        return f" AND {column_name} IS NOT NULL AND trim({column_name}) <> ''"
    if contract_id == "__all__":
        return ""
    params.append(contract_id)
    return f" AND {column_name} = ?"


class ContractMetricsRepository(RepositoryBase):
    def calculate_contract_metrics(self, contract_id: str, time_range: dict[str, Any]) -> dict[str, Any]:
        selector = contract_id or "unassigned"
        revenue_total = self._sales_total(selector, time_range)
        invoice_cost_by_category = self._invoice_cost_by_category(selector, time_range)
        labor = self._labor_totals(selector, time_range)
        labor_cost = labor["cost_total"]
        labor_hours_total = labor["hours_total"]
        cost_invoice_count = self._invoice_count(selector, time_range, "cost")
        sales_invoice_count = self._invoice_count(selector, time_range, "sales")
        cost_by_category = {category: 0.0 for category in ALLOWED_COST_CATEGORIES}

        for category, value in invoice_cost_by_category.items():
            cost_by_category[category] = round(cost_by_category.get(category, 0.0) + float(value or 0), 2)

        cost_by_category["labor"] = round(cost_by_category.get("labor", 0.0) + labor_cost, 2)
        invoice_cost_total = round(sum(invoice_cost_by_category.values()), 2)
        cost_total = round(sum(cost_by_category.values()), 2)

        return {
            "contract_id": selector,
            "revenue_total": round(revenue_total, 2),
            "invoice_cost_total": invoice_cost_total,
            "labor_cost_total": round(labor_cost, 2),
            "labor_hours_total": round(labor_hours_total, 2),
            "cost_total": cost_total,
            "cost_by_category": cost_by_category,
            "invoice_count": int(cost_invoice_count + sales_invoice_count),
            "cost_invoice_count": int(cost_invoice_count),
            "sales_invoice_count": int(sales_invoice_count),
            "margin": round(revenue_total - cost_total, 2),
        }

    def calculate_global_metrics(self, time_range: dict[str, Any]) -> dict[str, Any]:
        assigned = self.calculate_contract_metrics("__assigned__", time_range)
        unassigned = self.calculate_contract_metrics("unassigned", time_range)
        totals = {
            "revenue_total": round(assigned["revenue_total"], 2),
            "invoice_cost_total": round(assigned["invoice_cost_total"], 2),
            "labor_cost_total": round(assigned["labor_cost_total"], 2),
            "labor_hours_total": round(assigned["labor_hours_total"], 2),
            "cost_total": round(assigned["cost_total"], 2),
            "margin": round(assigned["margin"], 2),
            "invoice_count": int(assigned["invoice_count"]),
            "cost_invoice_count": int(assigned["cost_invoice_count"]),
            "sales_invoice_count": int(assigned["sales_invoice_count"]),
            "cost_by_category": {
                category: round(assigned["cost_by_category"].get(category, 0.0), 2)
                for category in ALLOWED_COST_CATEGORIES
            },
        }
        return {
            "totals": totals,
            "unassigned": unassigned,
        }

    def list_contract_monthly_breakdown(self, contract_id: str, time_range: dict[str, Any]) -> list[dict[str, Any]]:
        selector = contract_id or "unassigned"
        invoice_rows = self._invoice_monthly_breakdown(selector, time_range)
        labor_rows = self._labor_monthly_breakdown(selector, time_range)
        month_map: dict[str, dict[str, Any]] = {}

        for row in invoice_rows:
            month_key = str(row["month_key"] or "")
            if not month_key:
                continue
            bucket = month_map.setdefault(
                month_key,
                {
                    "month_key": month_key,
                    "month_label": month_key,
                    "revenue_total": 0.0,
                    "invoice_cost_total": 0.0,
                    "labor_cost_total": 0.0,
                    "labor_hours_total": 0.0,
                    "invoice_count": 0,
                    "cost_invoice_count": 0,
                    "sales_invoice_count": 0,
                },
            )
            invoice_type = str(row["invoice_type"] or "")
            amount = float(row["amount_total"] or 0)
            count = int(row["invoice_count"] or 0)
            if invoice_type == "sales":
                bucket["revenue_total"] += amount
                bucket["sales_invoice_count"] += count
            else:
                bucket["invoice_cost_total"] += amount
                bucket["cost_invoice_count"] += count
            bucket["invoice_count"] += count

        for row in labor_rows:
            month_key = str(row["month_key"] or "")
            if not month_key:
                continue
            bucket = month_map.setdefault(
                month_key,
                {
                    "month_key": month_key,
                    "month_label": month_key,
                    "revenue_total": 0.0,
                    "invoice_cost_total": 0.0,
                    "labor_cost_total": 0.0,
                    "labor_hours_total": 0.0,
                    "invoice_count": 0,
                    "cost_invoice_count": 0,
                    "sales_invoice_count": 0,
                },
            )
            bucket["labor_cost_total"] += float(row["cost_total"] or 0)
            bucket["labor_hours_total"] += float(row["hours_total"] or 0)

        rows = []
        for month_key in sorted(month_map.keys()):
            bucket = month_map[month_key]
            invoice_cost_total = round(float(bucket["invoice_cost_total"] or 0), 2)
            labor_cost_total = round(float(bucket["labor_cost_total"] or 0), 2)
            revenue_total = round(float(bucket["revenue_total"] or 0), 2)
            cost_total = round(invoice_cost_total + labor_cost_total, 2)
            rows.append({
                "month_key": month_key,
                "month_label": month_key,
                "revenue_total": revenue_total,
                "invoice_cost_total": invoice_cost_total,
                "labor_cost_total": labor_cost_total,
                "labor_hours_total": round(float(bucket["labor_hours_total"] or 0), 2),
                "cost_total": cost_total,
                "margin": round(revenue_total - cost_total, 2),
                "invoice_count": int(bucket["invoice_count"] or 0),
                "cost_invoice_count": int(bucket["cost_invoice_count"] or 0),
                "sales_invoice_count": int(bucket["sales_invoice_count"] or 0),
            })
        return rows

    def list_unassigned_invoices(self, time_range: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[Any] = []
        time_clause = _invoice_time_where(time_range, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    id,
                    issue_date,
                    type,
                    invoice_number,
                    contract_name,
                    counterparty_name,
                    category_or_description,
                    notes,
                    amount_net,
                    vat_rate,
                    amount_gross
                FROM invoices
                WHERE is_deleted = 0
                  AND (contract_id IS NULL OR trim(contract_id) = '')
                  {time_clause}
                ORDER BY issue_date DESC, invoice_number COLLATE NOCASE ASC
                """,
                tuple(params),
            ).fetchall()
        return [
            {
                "id": row["id"],
                "issue_date": row["issue_date"] or "",
                "type": row["type"] or "cost",
                "document_number": row["invoice_number"] or "",
                "contract_name": row["contract_name"] or "",
                "party": row["counterparty_name"] or "",
                "category": row["category_or_description"] or "",
                "description": row["notes"] or "",
                "net_amount": float(row["amount_net"] or 0),
                "vat_rate": float(row["vat_rate"] or 0),
                "gross_amount": float(row["amount_gross"] or 0),
            }
            for row in rows
        ]

    def list_unmatched_hours(self, time_range: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[Any] = []
        time_clause = _hours_time_where(time_range, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    CASE
                        WHEN trim(COALESCE(te.contract_name, '')) <> '' THEN trim(te.contract_name)
                        ELSE 'Brak kontraktu'
                    END AS source_name,
                    COUNT(*) AS entries,
                    COALESCE(SUM(te.hours), 0) AS labor_hours,
                    COALESCE(SUM(te.cost_amount), 0) AS labor_cost
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE (te.contract_id IS NULL OR trim(te.contract_id) = '')
                  {time_clause}
                GROUP BY source_name
                ORDER BY labor_cost DESC, source_name ASC
                """,
                tuple(params),
            ).fetchall()
        return [
            {
                "source_name": row["source_name"],
                "entries": int(row["entries"] or 0),
                "labor_hours": float(row["labor_hours"] or 0),
                "labor_cost": float(row["labor_cost"] or 0),
            }
            for row in rows
        ]

    def _sales_total(self, contract_id: str, time_range: dict[str, Any]) -> float:
        params: list[Any] = []
        contract_clause = _contract_selector("contract_id", contract_id, params)
        time_clause = _invoice_time_where(time_range, params)
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT COALESCE(SUM(amount_net), 0) AS total
                FROM invoices
                WHERE is_deleted = 0
                  AND type = 'sales'
                  {contract_clause}
                  {time_clause}
                """,
                tuple(params),
            ).fetchone()
        return float(row["total"] or 0)

    def _invoice_cost_by_category(self, contract_id: str, time_range: dict[str, Any]) -> dict[str, float]:
        params: list[Any] = []
        contract_clause = _contract_selector("contract_id", contract_id, params)
        time_clause = _invoice_time_where(time_range, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    CASE
                        WHEN lower(trim(COALESCE(cost_category, ''))) IN ('materials', 'labor', 'equipment', 'transport', 'services', 'other')
                            THEN lower(trim(cost_category))
                        ELSE 'other'
                    END AS normalized_category,
                    COALESCE(SUM(amount_net), 0) AS total
                FROM invoices
                WHERE is_deleted = 0
                  AND type = 'cost'
                  {contract_clause}
                  {time_clause}
                GROUP BY normalized_category
                """,
                tuple(params),
            ).fetchall()
        return {
            str(row["normalized_category"] or "other"): float(row["total"] or 0)
            for row in rows
        }

    def _labor_totals(self, contract_id: str, time_range: dict[str, Any]) -> dict[str, float]:
        params: list[Any] = []
        contract_clause = _contract_selector("te.contract_id", contract_id, params)
        time_clause = _hours_time_where(time_range, params)
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT
                    COALESCE(SUM(te.cost_amount), 0) AS total_cost,
                    COALESCE(SUM(te.hours), 0) AS total_hours
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE 1 = 1
                  {contract_clause}
                  {time_clause}
                """,
                tuple(params),
            ).fetchone()
        return {
            "cost_total": round(float(row["total_cost"] or 0), 2),
            "hours_total": round(float(row["total_hours"] or 0), 2),
        }

    def _invoice_count(self, contract_id: str, time_range: dict[str, Any], invoice_type: str) -> int:
        params: list[Any] = []
        contract_clause = _contract_selector("contract_id", contract_id, params)
        time_clause = _invoice_time_where(time_range, params)
        params.append(invoice_type)
        with self.connect() as connection:
            row = connection.execute(
                f"""
                SELECT COUNT(*) AS total
                FROM invoices
                WHERE is_deleted = 0
                  {contract_clause}
                  {time_clause}
                  AND type = ?
                """,
                tuple(params),
            ).fetchone()
        return int(row["total"] or 0)

    def _invoice_monthly_breakdown(self, contract_id: str, time_range: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[Any] = []
        contract_clause = _contract_selector("contract_id", contract_id, params)
        time_clause = _invoice_time_where(time_range, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    substr(issue_date, 1, 7) AS month_key,
                    type AS invoice_type,
                    COUNT(*) AS invoice_count,
                    COALESCE(SUM(amount_net), 0) AS amount_total
                FROM invoices
                WHERE is_deleted = 0
                  AND issue_date <> ''
                  {contract_clause}
                  {time_clause}
                GROUP BY month_key, invoice_type
                ORDER BY month_key ASC
                """,
                tuple(params),
            ).fetchall()
        return [dict(row) for row in rows]

    def _labor_monthly_breakdown(self, contract_id: str, time_range: dict[str, Any]) -> list[dict[str, Any]]:
        params: list[Any] = []
        contract_clause = _contract_selector("te.contract_id", contract_id, params)
        time_clause = _hours_time_where(time_range, params)
        with self.connect() as connection:
            rows = connection.execute(
                f"""
                SELECT
                    hm.month_key AS month_key,
                    COALESCE(SUM(te.cost_amount), 0) AS cost_total,
                    COALESCE(SUM(te.hours), 0) AS hours_total
                FROM time_entries te
                JOIN hours_months hm ON hm.id = te.month_id
                WHERE 1 = 1
                  {contract_clause}
                  {time_clause}
                GROUP BY hm.month_key
                ORDER BY hm.month_key ASC
                """,
                tuple(params),
            ).fetchall()
        return [dict(row) for row in rows]
