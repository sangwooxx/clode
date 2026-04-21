from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import normalize_role
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract
from clode_backend.validation.employees import (
    normalize_employee_status,
    split_legacy_employee_name,
    text as employee_text,
    validate_iso_date,
)


class EmployeeServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _compose_name(first_name: str, last_name: str) -> str:
    return " ".join(part for part in (last_name.strip(), first_name.strip()) if part).strip()


class EmployeeService:
    def __init__(
        self,
        repository: EmployeeRepository,
        time_entry_repository: TimeEntryRepository,
        store_repository: StoreRepository,
    ) -> None:
        self.repository = repository
        self.time_entry_repository = time_entry_repository
        self.store_repository = store_repository

    def ensure_read_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise EmployeeServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", "kierownik"}:
            raise EmployeeServiceError("Brak uprawnien do kartoteki pracownikow.", status_code=403)

    def ensure_write_access(self, current_user: dict[str, Any] | None) -> None:
        self.ensure_read_access(current_user)

    def list_employees(self, current_user: dict[str, Any] | None) -> list[dict[str, Any]]:
        self.ensure_read_access(current_user)
        return self.repository.list_all()

    def list_employee_summary(self, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        directory_employees = self.repository.list_all()
        relation_summaries = self._build_relation_summaries()
        directory_by_id = {
            _normalize_text(employee.get("id")): employee
            for employee in directory_employees
            if _normalize_text(employee.get("id"))
        }
        directory_by_name: dict[str, list[dict[str, Any]]] = {}
        for employee in directory_employees:
            normalized_name = _normalize_text(employee.get("name")).casefold()
            if not normalized_name:
                continue
            directory_by_name.setdefault(normalized_name, []).append(employee)

        operational_employees = [
            self._build_operational_employee(summary, directory_by_id, directory_by_name)
            for summary in relation_summaries
            if _normalize_text(summary.get("employee_id")) or _normalize_text(summary.get("employee_name"))
        ]

        return {
            "employees": directory_employees,
            "operational_employees": operational_employees,
            "relation_summaries": relation_summaries,
        }

    def create_employee(
        self, payload: dict[str, Any], current_user: dict[str, Any] | None
    ) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        employees = self.repository.list_all()
        normalized = self._normalize_payload(payload)

        candidate_id = _normalize_text(normalized.get("id")) or f"emp-{uuid4().hex}"
        if any(_normalize_text(employee.get("id")) == candidate_id for employee in employees):
            raise EmployeeServiceError(
                "Pracownik o podanym identyfikatorze juz istnieje.",
                status_code=409,
            )

        created = {
            **normalized,
            "id": candidate_id,
        }
        employees.append(created)
        saved = self.repository.save_all(employees)
        return next(
            (employee for employee in saved if _normalize_text(employee.get("id")) == candidate_id),
            created,
        )

    def update_employee(
        self,
        employee_id: str,
        payload: dict[str, Any],
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized_id = _normalize_text(employee_id)
        if not normalized_id:
            raise EmployeeServiceError("Brak identyfikatora pracownika.", status_code=400)

        employees = self.repository.list_all()
        index = next(
            (
                employee_index
                for employee_index, employee in enumerate(employees)
                if _normalize_text(employee.get("id")) == normalized_id
            ),
            -1,
        )
        if index < 0:
            raise EmployeeServiceError("Nie znaleziono pracownika.", status_code=404)

        current = employees[index]
        next_payload = self._normalize_payload({**current, **payload, "id": normalized_id})
        next_payload["id"] = normalized_id
        employees[index] = next_payload
        saved = self.repository.save_all(employees)
        self._synchronize_operational_references(current, next_payload, employees)
        return next(
            (employee for employee in saved if _normalize_text(employee.get("id")) == normalized_id),
            next_payload,
        )

    def delete_employee(self, employee_id: str, current_user: dict[str, Any] | None) -> None:
        self.ensure_write_access(current_user)
        normalized_id = _normalize_text(employee_id)
        if not normalized_id:
            raise EmployeeServiceError("Brak identyfikatora pracownika.", status_code=400)

        employee = self.repository.get_by_id(normalized_id)
        if not employee:
            raise EmployeeServiceError("Nie znaleziono pracownika.", status_code=404)

        if self._has_history(employee):
            raise EmployeeServiceError(
                "Nie mozna usunac pracownika z historia czasu pracy lub kart pracy. Zmien status na nieaktywny.",
                status_code=409,
            )

        employees = self.repository.list_all()
        next_employees = [
            current_employee
            for current_employee in employees
            if _normalize_text(current_employee.get("id")) != normalized_id
        ]

        if len(next_employees) == len(employees):
            raise EmployeeServiceError("Nie znaleziono pracownika.", status_code=404)

        self.repository.save_all(next_employees)

    def _has_history(self, employee: dict[str, Any]) -> bool:
        return self._has_time_entry_history(employee) or self._has_work_card_history(employee)

    def _build_relation_summaries(self) -> list[dict[str, Any]]:
        combined: dict[str, dict[str, Any]] = {}

        for summary in self.time_entry_repository.list_employee_relation_summaries():
            employee_id = _normalize_text(summary.get("employee_id"))
            employee_name = _normalize_text(summary.get("employee_name"))
            bucket = combined.setdefault(
                self._relation_key(employee_id, employee_name),
                {
                    "employee_id": employee_id,
                    "employee_name": employee_name,
                    "hours_entries": 0,
                    "work_cards": 0,
                    "months_count": 0,
                    "total_hours": 0.0,
                    "total_cost": 0.0,
                    "_month_keys": set(),
                },
            )
            bucket["hours_entries"] += int(summary.get("hours_entries") or 0)
            bucket["total_hours"] += float(summary.get("total_hours") or 0)
            bucket["total_cost"] += float(summary.get("total_cost") or 0)
            bucket["_month_keys_count"] = int(summary.get("months_count") or 0)
            if bucket["_month_keys_count"] > bucket["months_count"]:
                bucket["months_count"] = bucket["_month_keys_count"]

        payload = self.store_repository.get("work_cards")
        cards = payload.get("cards") if isinstance(payload, dict) else None
        if isinstance(cards, list):
            for card in cards:
                if not isinstance(card, dict):
                    continue
                employee_id = _normalize_text(card.get("employee_id"))
                employee_name = _normalize_text(card.get("employee_name"))
                if not employee_id and not employee_name:
                    continue

                bucket = combined.setdefault(
                    self._relation_key(employee_id, employee_name),
                    {
                        "employee_id": employee_id,
                        "employee_name": employee_name,
                        "hours_entries": 0,
                        "work_cards": 0,
                        "months_count": 0,
                        "total_hours": 0.0,
                        "total_cost": 0.0,
                        "_month_keys": set(),
                    },
                )
                bucket["work_cards"] += 1
                month_key = _normalize_text(card.get("month_key"))
                if month_key:
                    bucket["_month_keys"].add(month_key)

        relation_summaries: list[dict[str, Any]] = []
        for summary in combined.values():
            month_keys = summary.pop("_month_keys", set())
            summary["months_count"] = max(summary["months_count"], len(month_keys))
            summary["total_hours"] = round(float(summary["total_hours"] or 0), 2)
            summary["total_cost"] = round(float(summary["total_cost"] or 0), 2)
            summary.pop("_month_keys_count", None)
            relation_summaries.append(summary)

        relation_summaries.sort(
            key=lambda item: (
                _normalize_text(item.get("employee_name")).casefold(),
                _normalize_text(item.get("employee_id")),
            )
        )
        return relation_summaries

    @staticmethod
    def _relation_key(employee_id: str, employee_name: str) -> str:
        return f"id:{employee_id}" if employee_id else f"name:{employee_name.casefold()}"

    def _build_operational_employee(
        self,
        summary: dict[str, Any],
        directory_by_id: dict[str, dict[str, Any]],
        directory_by_name: dict[str, list[dict[str, Any]]],
    ) -> dict[str, Any]:
        summary_employee_id = _normalize_text(summary.get("employee_id"))
        summary_employee_name = _normalize_text(summary.get("employee_name"))

        matched_directory_employee = directory_by_id.get(summary_employee_id)
        if (
            not matched_directory_employee
            and not summary_employee_id
            and summary_employee_name
        ):
            same_name_matches = directory_by_name.get(summary_employee_name.casefold(), [])
            if len(same_name_matches) == 1:
                matched_directory_employee = same_name_matches[0]

        if matched_directory_employee:
            return {
                **matched_directory_employee,
                "id": _normalize_text(matched_directory_employee.get("id")) or summary_employee_id or None,
                "name": _normalize_text(matched_directory_employee.get("name")) or summary_employee_name,
                "status": normalize_employee_status(
                    matched_directory_employee.get("status") or "active"
                ),
            }

        return {
            "id": summary_employee_id or None,
            "name": summary_employee_name,
            "status": "inactive",
        }

    def _synchronize_operational_references(
        self,
        previous_employee: dict[str, Any],
        next_employee: dict[str, Any],
        employees: list[dict[str, Any]],
    ) -> None:
        previous_id = _normalize_text(previous_employee.get("id"))
        previous_name = _normalize_text(previous_employee.get("name"))
        next_id = _normalize_text(next_employee.get("id"))
        next_name = _normalize_text(next_employee.get("name"))

        if previous_id == next_id and previous_name == next_name:
            return

        same_name_count = sum(
            1
            for employee in employees
            if _normalize_text(employee.get("name")).casefold() == previous_name.casefold()
        )
        allow_name_fallback = bool(previous_name) and same_name_count <= 1
        self._replace_time_entry_references(
            previous_id=previous_id,
            previous_name=previous_name,
            next_id=next_id,
            next_name=next_name,
            allow_name_fallback=allow_name_fallback,
        )
        self._replace_work_card_references(
            previous_id=previous_id,
            previous_name=previous_name,
            next_id=next_id,
            next_name=next_name,
            allow_name_fallback=allow_name_fallback,
        )

    def _replace_time_entry_references(
        self,
        *,
        previous_id: str,
        previous_name: str,
        next_id: str,
        next_name: str,
        allow_name_fallback: bool,
    ) -> None:
        if not previous_id and not (previous_name and allow_name_fallback):
            return

        with self.time_entry_repository.connect() as connection:
            if previous_id:
                connection.execute(
                    """
                    UPDATE time_entries
                    SET employee_id = ?, employee_name = ?
                    WHERE trim(COALESCE(employee_id, '')) = ?
                    """,
                    (next_id or None, next_name, previous_id),
                )
            if previous_name and allow_name_fallback:
                connection.execute(
                    """
                    UPDATE time_entries
                    SET employee_id = ?, employee_name = ?
                    WHERE trim(COALESCE(employee_id, '')) = ''
                      AND lower(trim(employee_name)) = lower(trim(?))
                    """,
                    (next_id or None, next_name, previous_name),
                )
            connection.commit()

    def _replace_work_card_references(
        self,
        *,
        previous_id: str,
        previous_name: str,
        next_id: str,
        next_name: str,
        allow_name_fallback: bool,
    ) -> None:
        payload = self.store_repository.get("work_cards")
        if not isinstance(payload, dict):
            return

        cards = payload.get("cards")
        if not isinstance(cards, list):
            return

        changed = False
        next_cards: list[dict[str, Any]] = []
        for card in cards:
            if not isinstance(card, dict):
                next_cards.append(card)
                continue

            card_employee_id = _normalize_text(card.get("employee_id"))
            card_employee_name = _normalize_text(card.get("employee_name"))
            matches = False
            if previous_id and card_employee_id == previous_id:
                matches = True
            elif allow_name_fallback and previous_name and not card_employee_id:
                matches = card_employee_name.casefold() == previous_name.casefold()

            if not matches:
                next_cards.append(card)
                continue

            changed = True
            next_cards.append(
                {
                    **card,
                    "employee_id": next_id,
                    "employee_name": next_name,
                }
            )

        if changed:
            next_payload = {
                **payload,
                "version": int(payload.get("version") or 1) if isinstance(payload.get("version"), int) else 1,
                "cards": next_cards,
            }
            self.store_repository.save("work_cards", next_payload)

    def _has_time_entry_history(self, employee: dict[str, Any]) -> bool:
        employee_id = _normalize_text(employee.get("id"))
        employee_name = _normalize_text(employee.get("name"))

        if employee_id:
            entries = self.time_entry_repository.list_entries({"employee_id": employee_id})
            if entries:
                return True

        if not employee_name:
            return False

        entries = self.time_entry_repository.list_entries({"employee_name": employee_name})
        if not entries:
            return False

        if not employee_id:
            return True

        return any(
            not _normalize_text(entry.get("employee_id"))
            or _normalize_text(entry.get("employee_id")) == employee_id
            for entry in entries
        )

    def _has_work_card_history(self, employee: dict[str, Any]) -> bool:
        employee_id = _normalize_text(employee.get("id"))
        employee_name = _normalize_text(employee.get("name"))
        payload = self.store_repository.get("work_cards")

        if not isinstance(payload, dict):
            return False

        cards = payload.get("cards")
        if not isinstance(cards, list):
            return False

        matching_cards: list[dict[str, Any]] = []
        for card in cards:
            if not isinstance(card, dict):
                continue
            card_employee_id = _normalize_text(card.get("employee_id"))
            card_employee_name = _normalize_text(card.get("employee_name"))

            if employee_id and card_employee_id == employee_id:
                matching_cards.append(card)
                continue

            if employee_name and card_employee_name == employee_name:
                matching_cards.append(card)

        if not matching_cards:
            return False

        if not employee_id:
            return True

        return any(
            not _normalize_text(card.get("employee_id"))
            or _normalize_text(card.get("employee_id")) == employee_id
            for card in matching_cards
        )

    def _normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        provided_name = employee_text(payload.get("name"))
        derived_last_name, derived_first_name = split_legacy_employee_name(provided_name)
        first_name = employee_text(payload.get("first_name")) or derived_first_name
        last_name = employee_text(payload.get("last_name")) or derived_last_name
        name = provided_name or _compose_name(first_name, last_name)

        if not first_name or not last_name:
            raise EmployeeServiceError("Podaj imie i nazwisko pracownika.", status_code=400)

        employment_date = validate_iso_date(
            payload.get("employment_date"),
            "Data zatrudnienia",
            required=False,
        )
        employment_end_date = validate_iso_date(
            payload.get("employment_end_date"),
            "Data zakonczenia zatrudnienia",
            required=False,
        )
        medical_exam_valid_until = validate_iso_date(
            payload.get("medical_exam_valid_until"),
            "Waznosc badan lekarskich",
            required=False,
        )
        if employment_date and employment_end_date and employment_end_date < employment_date:
            raise EmployeeServiceError(
                "Data zakonczenia zatrudnienia nie moze byc wczesniejsza niz data zatrudnienia.",
                status_code=400,
            )

        record = {
            "id": employee_text(payload.get("id")),
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "position": employee_text(payload.get("position")),
            "status": normalize_employee_status(payload.get("status")),
            "employment_date": employment_date,
            "employment_end_date": employment_end_date,
            "street": employee_text(payload.get("street")),
            "city": employee_text(payload.get("city")),
            "phone": employee_text(payload.get("phone")),
            "medical_exam_valid_until": medical_exam_valid_until,
            "worker_code": employee_text(payload.get("worker_code")),
        }
        try:
            validate_shared_contract("employee", record)
        except ContractValidationError as error:
            raise EmployeeServiceError(str(error), status_code=400) from error
        return record
