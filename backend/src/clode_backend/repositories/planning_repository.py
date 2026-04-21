from __future__ import annotations

from typing import Any

from clode_backend.repositories.base import RepositoryBase


class PlanningRepository(RepositoryBase):
    def get_store(self, *, connection=None) -> dict[str, Any]:
        rows = self._list_rows(connection=connection)
        assignments: dict[str, dict[str, dict[str, Any]]] = {}
        for row in rows:
            date_key = row["assignment_date"]
            raw_key = row["assignment_key"]
            assignments.setdefault(date_key, {})[raw_key] = {
                "contract_id": row["contract_id"],
                "employee_id": row["employee_id"],
                "employee_key": row["employee_key"],
                "employee_name": row["employee_name"],
                "contract_name": row["contract_name"],
                "note": row["note"],
            }
        return {"assignments": assignments}

    def replace_store(self, payload: dict[str, Any], *, connection=None) -> dict[str, Any]:
        normalized = payload if isinstance(payload, dict) else {}
        assignments = normalized.get("assignments") if isinstance(normalized.get("assignments"), dict) else {}

        if connection is None:
            with self.connect() as local_connection:
                self._replace_assignments(assignments, connection=local_connection)
                local_connection.commit()
                return self.get_store(connection=local_connection)

        self._replace_assignments(assignments, connection=connection)
        return self.get_store(connection=connection)

    def _replace_assignments(self, assignments: dict[str, Any], *, connection) -> None:
        connection.execute("DELETE FROM planning_assignments")
        for date_key, employee_assignments in assignments.items():
            if not isinstance(employee_assignments, dict):
                continue
            for raw_key, assignment in employee_assignments.items():
                if not isinstance(assignment, dict):
                    continue
                record_id = f"planning:{date_key}:{raw_key}"
                connection.execute(
                    """
                    INSERT INTO planning_assignments (
                        id,
                        assignment_date,
                        assignment_key,
                        employee_id,
                        employee_key,
                        employee_name,
                        contract_id,
                        contract_name,
                        note
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        record_id,
                        str(date_key or "").strip(),
                        str(raw_key or "").strip(),
                        str(assignment.get("employee_id") or "").strip(),
                        str(assignment.get("employee_key") or "").strip(),
                        str(assignment.get("employee_name") or "").strip(),
                        str(assignment.get("contract_id") or "").strip(),
                        str(assignment.get("contract_name") or "").strip(),
                        str(assignment.get("note") or "").strip(),
                    ),
                )

    def _list_rows(self, *, connection=None) -> list[dict[str, Any]]:
        if connection is None:
            with self.connect() as local_connection:
                rows = local_connection.execute(
                    """
                    SELECT
                        assignment_date,
                        assignment_key,
                        employee_id,
                        employee_key,
                        employee_name,
                        contract_id,
                        contract_name,
                        note
                    FROM planning_assignments
                    ORDER BY assignment_date ASC, assignment_key ASC
                    """
                ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT
                    assignment_date,
                    assignment_key,
                    employee_id,
                    employee_key,
                    employee_name,
                    contract_id,
                    contract_name,
                    note
                FROM planning_assignments
                ORDER BY assignment_date ASC, assignment_key ASC
                """
            ).fetchall()
        return [
            {
                "assignment_date": str(row["assignment_date"] or "").strip(),
                "assignment_key": str(row["assignment_key"] or "").strip(),
                "employee_id": str(row["employee_id"] or "").strip(),
                "employee_key": str(row["employee_key"] or "").strip(),
                "employee_name": str(row["employee_name"] or "").strip(),
                "contract_id": str(row["contract_id"] or "").strip(),
                "contract_name": str(row["contract_name"] or "").strip(),
                "note": str(row["note"] or "").strip(),
            }
            for row in rows
        ]
