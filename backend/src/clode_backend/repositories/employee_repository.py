from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract
from clode_backend.validation.employees import split_legacy_employee_name


def _repair_mojibake(value: Any) -> str:
    text = str(value or "")
    if not any(marker in text for marker in ("Ã", "â", "Å", "Ä")):
        return text
    try:
        return text.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return text


def _normalize_text(value: Any) -> str:
    return _repair_mojibake(value).strip()


def _complete_name_parts(
    *,
    name: str,
    first_name: str,
    last_name: str,
) -> tuple[str, str, str]:
    resolved_name = _normalize_text(name)
    resolved_first_name = _normalize_text(first_name)
    resolved_last_name = _normalize_text(last_name)

    if not resolved_first_name or not resolved_last_name:
        derived_last_name, derived_first_name = split_legacy_employee_name(resolved_name)
        resolved_first_name = resolved_first_name or derived_first_name
        resolved_last_name = resolved_last_name or derived_last_name

    if not resolved_name:
        resolved_name = " ".join(
            part for part in (resolved_last_name, resolved_first_name) if part
        ).strip()

    return resolved_name, resolved_first_name, resolved_last_name


def _row_value(row, key: str) -> Any:
    try:
        return row[key]
    except Exception:
        return ""


class EmployeeRepository(RepositoryBase):
    def list_all(self) -> list[dict[str, Any]]:
        with self.connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    name,
                    first_name,
                    last_name,
                    worker_code,
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

    def get_by_id(self, employee_id: str) -> dict[str, Any] | None:
        normalized_id = _normalize_text(employee_id)
        if not normalized_id:
            return None
        with self.connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    name,
                    first_name,
                    last_name,
                    worker_code,
                    position,
                    status,
                    employment_date,
                    employment_end_date,
                    street,
                    city,
                    phone,
                    medical_exam_valid_until
                FROM employees
                WHERE id = ?
                """,
                (normalized_id,),
            ).fetchone()
        return self._serialize_row(row) if row else None

    def save_all(self, employees: list[dict[str, Any]]) -> list[dict[str, Any]]:
        payload = [
            self._serialize_payload(item, index)
            for index, item in enumerate(employees)
            if isinstance(item, dict)
        ]
        payload_ids = {
            _normalize_text(employee.get("id"))
            for employee in payload
            if _normalize_text(employee.get("id"))
        }
        with self.connect() as connection:
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
                        worker_code,
                        position,
                        status,
                        employment_date,
                        employment_end_date,
                        street,
                        city,
                        phone,
                        medical_exam_valid_until
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                        name = excluded.name,
                        first_name = excluded.first_name,
                        last_name = excluded.last_name,
                        worker_code = excluded.worker_code,
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
                        employee["worker_code"],
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
                connection.execute("DELETE FROM employees WHERE id = ?", (employee_id,))
            connection.commit()
        return self.list_all()

    def import_legacy_store(self) -> int:
        legacy_rows = self._list_from_store()
        if not legacy_rows:
            return 0
        if self.list_all():
            with self.connect() as connection:
                connection.execute("DELETE FROM store_documents WHERE store_name = ?", ("employees",))
                connection.commit()
            return 0
        self.save_all(legacy_rows)
        with self.connect() as connection:
            connection.execute("DELETE FROM store_documents WHERE store_name = ?", ("employees",))
            connection.commit()
        return len(legacy_rows)

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

        return [
            self._serialize_payload(item, index)
            for index, item in enumerate(payload)
            if isinstance(item, dict)
        ]

    @staticmethod
    def _serialize_payload(item: dict[str, Any], index: int) -> dict[str, Any]:
        employee_id = (
            _normalize_text(item.get("id"))
            or _normalize_text(item.get("worker_code"))
            or f"employee-store-{index}"
        )
        full_name, first_name, last_name = _complete_name_parts(
            name=_normalize_text(item.get("name")),
            first_name=_normalize_text(item.get("first_name")),
            last_name=_normalize_text(item.get("last_name")),
        )
        record = {
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
        EmployeeRepository._validate_record(record)
        return record

    @staticmethod
    def _serialize_row(row) -> dict[str, Any]:
        full_name, first_name, last_name = _complete_name_parts(
            name=_normalize_text(_row_value(row, "name")),
            first_name=_normalize_text(_row_value(row, "first_name")),
            last_name=_normalize_text(_row_value(row, "last_name")),
        )
        record = {
            "id": _normalize_text(_row_value(row, "id")),
            "name": full_name,
            "first_name": first_name,
            "last_name": last_name,
            "position": _normalize_text(_row_value(row, "position")),
            "status": _normalize_text(_row_value(row, "status")) or "active",
            "employment_date": _normalize_text(_row_value(row, "employment_date")),
            "employment_end_date": _normalize_text(_row_value(row, "employment_end_date")),
            "street": _normalize_text(_row_value(row, "street")),
            "city": _normalize_text(_row_value(row, "city")),
            "phone": _normalize_text(_row_value(row, "phone")),
            "medical_exam_valid_until": _normalize_text(_row_value(row, "medical_exam_valid_until")),
            "worker_code": _normalize_text(_row_value(row, "worker_code")),
        }
        EmployeeRepository._validate_record(record)
        return record

    @staticmethod
    def _validate_record(record: dict[str, Any]) -> None:
        try:
            validate_shared_contract("employee", record)
        except ContractValidationError as error:
            raise ValueError(str(error)) from error
