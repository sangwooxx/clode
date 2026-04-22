from __future__ import annotations

from typing import Any

from clode_backend.repositories.base import RepositoryBase


class ContractControlRepository(RepositoryBase):
    def get_by_contract_id(self, contract_id: str, *, connection=None) -> dict[str, Any] | None:
        query = """
            SELECT
                contract_id,
                planned_revenue_total,
                planned_invoice_cost_total,
                planned_labor_cost_total,
                forecast_revenue_total,
                forecast_invoice_cost_total,
                forecast_labor_cost_total,
                note,
                updated_at,
                updated_by
            FROM contract_controls
            WHERE contract_id = ?
        """
        if connection is None:
            with self.connect() as local_connection:
                row = local_connection.execute(query, (contract_id,)).fetchone()
        else:
            row = connection.execute(query, (contract_id,)).fetchone()
        return self._serialize(row) if row else None

    def upsert(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        params = (
            payload["contract_id"],
            payload.get("planned_revenue_total"),
            payload.get("planned_invoice_cost_total"),
            payload.get("planned_labor_cost_total"),
            payload.get("forecast_revenue_total"),
            payload.get("forecast_invoice_cost_total"),
            payload.get("forecast_labor_cost_total"),
            payload.get("note", ""),
            payload.get("updated_at", ""),
            payload.get("updated_by", ""),
        )
        statement = """
            INSERT INTO contract_controls (
                contract_id,
                planned_revenue_total,
                planned_invoice_cost_total,
                planned_labor_cost_total,
                forecast_revenue_total,
                forecast_invoice_cost_total,
                forecast_labor_cost_total,
                note,
                updated_at,
                updated_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(contract_id) DO UPDATE SET
                planned_revenue_total = excluded.planned_revenue_total,
                planned_invoice_cost_total = excluded.planned_invoice_cost_total,
                planned_labor_cost_total = excluded.planned_labor_cost_total,
                forecast_revenue_total = excluded.forecast_revenue_total,
                forecast_invoice_cost_total = excluded.forecast_invoice_cost_total,
                forecast_labor_cost_total = excluded.forecast_labor_cost_total,
                note = excluded.note,
                updated_at = excluded.updated_at,
                updated_by = excluded.updated_by
        """
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute(statement, params)
                local_connection.commit()
        else:
            connection.execute(statement, params)
        return self.get_by_contract_id(payload["contract_id"], connection=connection) or payload

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        return {
            "contract_id": row["contract_id"],
            "planned_revenue_total": (
                float(row["planned_revenue_total"]) if row["planned_revenue_total"] is not None else None
            ),
            "planned_invoice_cost_total": (
                float(row["planned_invoice_cost_total"])
                if row["planned_invoice_cost_total"] is not None
                else None
            ),
            "planned_labor_cost_total": (
                float(row["planned_labor_cost_total"]) if row["planned_labor_cost_total"] is not None else None
            ),
            "forecast_revenue_total": (
                float(row["forecast_revenue_total"]) if row["forecast_revenue_total"] is not None else None
            ),
            "forecast_invoice_cost_total": (
                float(row["forecast_invoice_cost_total"])
                if row["forecast_invoice_cost_total"] is not None
                else None
            ),
            "forecast_labor_cost_total": (
                float(row["forecast_labor_cost_total"]) if row["forecast_labor_cost_total"] is not None else None
            ),
            "note": row["note"] or "",
            "updated_at": row["updated_at"] or "",
            "updated_by": row["updated_by"] or "",
        }
