from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


def _repair_mojibake(value: Any) -> str:
    text = str(value or "")
    if not any(marker in text for marker in ("Ãƒ", "Ã…", "Ã„", "Ã¢")):
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _normalize_text(value: Any) -> str:
    return _repair_mojibake(value).strip()


def _employee_merge_key(employee: dict[str, Any], index: int) -> str:
    employee_id = _normalize_text(employee.get("id"))
    if employee_id:
        return f"id:{employee_id}"

    worker_code = _normalize_text(employee.get("worker_code"))
    if worker_code:
        return f"worker:{worker_code.casefold()}"

    name = _normalize_text(employee.get("name")).casefold()
    position = _normalize_text(employee.get("position")).casefold()
    return f"fallback:{name}|{position}|{index}"


class EmployeeRepository(RepositoryBase):
    def list_all(self) -> list[dict[str, Any]]:
        table_rows = self._list_from_table()
        store_rows = self._list_from_store()

        if not table_rows:
            return store_rows
        if not store_rows:
            return table_rows

        merged: dict[str, dict[str, Any]] = {}
        for index, employee in enumerate(table_rows):
            merged[_employee_merge_key(employee, index)] = employee
        for index, employee in enumerate(store_rows):
            merged[_employee_merge_key(employee, index)] = employee

        return sorted(
            merged.values(),
            key=lambda employee: (
                str(employee.get("name") or "").casefold(),
                str(employee.get("worker_code") or "").casefold(),
                str(employee.get("id") or ""),
            ),
        )

    def get_by_id(self, employee_id: str) -> dict[str, Any] | None:
        normalized_id = _normalize_text(employee_id)
        if not normalized_id:
            return None

        for employee in self.list_all():
            if _normalize_text(employee.get("id")) == normalized_id:
                return employee
        return None

    def save_all(self, employees: list[dict[str, Any]]) -> list[dict[str, Any]]:
        payload = [
            self._serialize_payload(item, index)
            for index, item in enumerate(employees)
            if isinstance(item, dict)
        ]
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO store_documents (store_name, payload_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(store_name) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                ("employees", payload_json),
            )
            payload_ids = {
                _normalize_text(employee.get("id"))
                for employee in payload
                if _normalize_text(employee.get("id"))
            }
            existing_table_ids = {
                _normalize_text(row["id"])
                for row in connection.execute("SELECT id FROM employees").fetchall()
                if _normalize_text(row["id"])
            }

            for employee in payload:
                connection.execute(
                    """
                    INSERT INTO employees (
                        id,
                        name,
                        first_name,
                        last_name,
                        position,
                        status,
                        employment_date,
                        employment_end_date,
                        street,
                        city,
                        phone,
                        medical_exam_valid_until
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        position = excluded.position,
                        status = excluded.status,
                        employment_date = excluded.employment_date,
                        employment_end_date = excluded.employment_end_date,
                        street = excluded.street,
                        city = excluded.city,
                        phone = excluded.phone,
                        medical_exam_valid_until = excluded.medical_exam_valid_until
                    """,
                    (
                        employee["id"],
                        employee["name"],
                        employee["first_name"],
                        employee["last_name"],
                        employee["position"],
                        employee["status"],
                        employee["employment_date"],
                        employee["employment_end_date"],
                        employee["street"],
                        employee["city"],
                        employee["phone"],
                        employee["medical_exam_valid_until"],
                    ),
                )

            stale_table_ids = existing_table_ids - payload_ids
            for employee_id in stale_table_ids:
                connection.execute(
                    "DELETE FROM employees WHERE id = ?",
                    (employee_id,),
                )
            connection.commit()
        return self.list_all()

    def _list_from_store(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM store_documents WHERE store_name = ?",
                ("employees",),
            ).fetchone()

        if not row:
            return []

        try:
            payload = json.loads(row["payload_json"])
        except (TypeError, ValueError, json.JSONDecodeError):
            return []

        if not isinstance(payload, list):
            return []

        employees: list[dict[str, Any]] = []
        for index, item in enumerate(payload):
            if not isinstance(item, dict):
                continue
            employees.append(self._serialize_payload(item, index))

        return sorted(
            employees,
            key=lambda employee: (
                str(employee.get("name") or "").casefold(),
                str(employee.get("worker_code") or "").casefold(),
                str(employee.get("id") or ""),
            ),
        )

    def _list_from_table(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    name,
                    first_name,
                    last_name,
                    position,
                    status,
                    employment_date,
                    employment_end_date,
                    street,
                    city,
                    phone,
                    medical_exam_valid_until
                FROM employees
                ORDER BY LOWER(name) ASC, id ASC
                """
            ).fetchall()
        return [self._serialize_row(row) for row in rows]

    @staticmethod
    def _serialize_payload(item: dict[str, Any], index: int) -> dict[str, Any]:
        employee_id = (
            _normalize_text(item.get("id"))
            or _normalize_text(item.get("worker_code"))
            or f"employee-store-{index}"
        )
        first_name = _normalize_text(item.get("first_name"))
        last_name = _normalize_text(item.get("last_name"))
        full_name = _normalize_text(item.get("name"))
        if not full_name:
            full_name = " ".join(part for part in (last_name, first_name) if part).strip()

        return {
            "id": employee_id,
            "name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "position": _normalize_text(item.get("position")),
            "status": _normalize_text(item.get("status")) or "active",
            "employment_date": _normalize_text(item.get("employment_date")),
            "employment_end_date": _normalize_text(item.get("employment_end_date")),
            "street": _normalize_text(item.get("street")),
            "city": _normalize_text(item.get("city")),
            "phone": _normalize_text(item.get("phone")),
            "medical_exam_valid_until": _normalize_text(item.get("medical_exam_valid_until")),
            "worker_code": _normalize_text(item.get("worker_code")),
        }

    @staticmethod
    def _serialize_row(row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "name": _normalize_text(row["name"]),
            "first_name": _normalize_text(row["first_name"]),
            "last_name": _normalize_text(row["last_name"]),
            "position": _normalize_text(row["position"]),
            "status": _normalize_text(row["status"]) or "active",
            "employment_date": _normalize_text(row["employment_date"]),
            "employment_end_date": _normalize_text(row["employment_end_date"]),
            "street": _normalize_text(row["street"]),
            "city": _normalize_text(row["city"]),
            "phone": _normalize_text(row["phone"]),
            "medical_exam_valid_until": _normalize_text(row["medical_exam_valid_until"]),
            "worker_code": "",
        }
