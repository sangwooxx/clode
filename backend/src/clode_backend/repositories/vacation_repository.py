from __future__ import annotations

from typing import Any

from clode_backend.repositories.base import RepositoryBase


def _balance_key(employee_id: str, employee_key: str, employee_name: str) -> str:
    if employee_id:
        return f"employee:{employee_id}"
    if employee_key:
        return f"employee-key:{employee_key}"
    return employee_name


class VacationRepository(RepositoryBase):
    def get_store(self, *, connection=None) -> dict[str, Any]:
        balances = self._list_balances(connection=connection)
        requests = self._list_requests(connection=connection)
        return {
            "version": 1,
            "balances": {
                _balance_key(
                    str(balance.get("employee_id") or "").strip(),
                    str(balance.get("employee_key") or "").strip(),
                    str(balance.get("employee_name") or "").strip(),
                ): balance
                for balance in balances
            },
            "requests": requests,
        }

    def replace_store(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        normalized = payload if isinstance(payload, dict) else {}
        balances = normalized.get("balances") if isinstance(normalized.get("balances"), dict) else {}
        requests = normalized.get("requests") if isinstance(normalized.get("requests"), list) else []

        if connection is None:
            with self.connect() as local_connection:
                self._replace_store_records(balances, requests, connection=local_connection)
                local_connection.commit()
                return self.get_store(connection=local_connection)

        self._replace_store_records(balances, requests, connection=connection)
        return self.get_store(connection=connection)

    def _replace_store_records(self, balances: dict[str, Any], requests: list[Any], *, connection) -> None:
        connection.execute("DELETE FROM vacation_balances")
        for balance in balances.values():
            if not isinstance(balance, dict):
                continue
            connection.execute(
                """
                INSERT INTO vacation_balances (
                    employee_id,
                    employee_key,
                    employee_name,
                    base_days,
                    carryover_days,
                    extra_days
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(balance.get("employee_id") or "").strip(),
                    str(balance.get("employee_key") or "").strip(),
                    str(balance.get("employee_name") or "").strip(),
                    float(balance.get("base_days") or 0),
                    float(balance.get("carryover_days") or 0),
                    float(balance.get("extra_days") or 0),
                ),
            )

        connection.execute("DELETE FROM vacation_requests")
        for request in requests:
            if not isinstance(request, dict):
                continue
            connection.execute(
                """
                INSERT INTO vacation_requests (
                    id,
                    employee_id,
                    employee_key,
                    employee_name,
                    request_type,
                    start_date,
                    end_date,
                    days,
                    status,
                    requested_by,
                    notes,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(request.get("id") or "").strip(),
                    str(request.get("employee_id") or "").strip(),
                    str(request.get("employee_key") or "").strip(),
                    str(request.get("employee_name") or "").strip(),
                    str(request.get("type") or "").strip(),
                    str(request.get("start_date") or "").strip(),
                    str(request.get("end_date") or "").strip(),
                    float(request.get("days") or 0),
                    str(request.get("status") or "").strip(),
                    str(request.get("requested_by") or "").strip(),
                    str(request.get("notes") or "").strip(),
                    str(request.get("created_at") or "").strip(),
                ),
            )

    def _list_balances(self, *, connection=None) -> list[dict[str, Any]]:
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    """
                    SELECT employee_id, employee_key, employee_name, base_days, carryover_days, extra_days
                    FROM vacation_balances
                    ORDER BY LOWER(employee_name) ASC, employee_id ASC
                    """
                ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT employee_id, employee_key, employee_name, base_days, carryover_days, extra_days
                FROM vacation_balances
                ORDER BY LOWER(employee_name) ASC, employee_id ASC
                """
            ).fetchall()
        return [
            {
                "employee_id": str(row["employee_id"] or "").strip(),
                "employee_key": str(row["employee_key"] or "").strip(),
                "employee_name": str(row["employee_name"] or "").strip(),
                "base_days": float(row["base_days"] or 0),
                "carryover_days": float(row["carryover_days"] or 0),
                "extra_days": float(row["extra_days"] or 0),
            }
            for row in rows
        ]

    def _list_requests(self, *, connection=None) -> list[dict[str, Any]]:
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    """
                    SELECT id, employee_id, employee_key, employee_name, request_type, start_date,
                           end_date, days, status, requested_by, notes, created_at
                    FROM vacation_requests
                    ORDER BY start_date DESC, created_at DESC, id ASC
                    """
                ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, employee_id, employee_key, employee_name, request_type, start_date,
                       end_date, days, status, requested_by, notes, created_at
                FROM vacation_requests
                ORDER BY start_date DESC, created_at DESC, id ASC
                """
            ).fetchall()
        return [
            {
                "id": str(row["id"] or "").strip(),
                "employee_id": str(row["employee_id"] or "").strip(),
                "employee_key": str(row["employee_key"] or "").strip(),
                "employee_name": str(row["employee_name"] or "").strip(),
                "type": str(row["request_type"] or "").strip(),
                "start_date": str(row["start_date"] or "").strip(),
                "end_date": str(row["end_date"] or "").strip(),
                "days": float(row["days"] or 0),
                "status": str(row["status"] or "").strip(),
                "requested_by": str(row["requested_by"] or "").strip(),
                "notes": str(row["notes"] or "").strip(),
                "created_at": str(row["created_at"] or "").strip(),
            }
            for row in rows
        ]
