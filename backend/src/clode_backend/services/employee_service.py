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
