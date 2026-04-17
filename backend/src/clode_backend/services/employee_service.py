from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import normalize_role
from clode_backend.repositories.employee_repository import EmployeeRepository
from clode_backend.repositories.store_repository import StoreRepository
from clode_backend.repositories.time_entry_repository import TimeEntryRepository


class EmployeeServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_status(value: Any) -> str:
    return "inactive" if _normalize_text(value).lower() == "inactive" else "active"


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
            raise EmployeeServiceError("Brak uprawnień do kartoteki pracowników.", status_code=403)

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
                "Pracownik o podanym identyfikatorze już istnieje.", status_code=409
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
                "Nie można usunąć pracownika z historią czasu pracy lub kart pracy. Zmień status na nieaktywny.",
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
        first_name = _normalize_text(payload.get("first_name"))
        last_name = _normalize_text(payload.get("last_name"))
        provided_name = _normalize_text(payload.get("name"))
        name = provided_name or _compose_name(first_name, last_name)

        if not first_name or not last_name:
            raise EmployeeServiceError("Podaj imię i nazwisko pracownika.", status_code=400)

        status = _normalize_status(payload.get("status"))
        employment_end_date = _normalize_text(payload.get("employment_end_date"))

        return {
            "id": _normalize_text(payload.get("id")),
            "name": name,
            "first_name": first_name,
            "last_name": last_name,
            "position": _normalize_text(payload.get("position")),
            "status": status,
            "employment_date": _normalize_text(payload.get("employment_date")),
            "employment_end_date": employment_end_date,
            "street": _normalize_text(payload.get("street")),
            "city": _normalize_text(payload.get("city")),
            "phone": _normalize_text(payload.get("phone")),
            "medical_exam_valid_until": _normalize_text(payload.get("medical_exam_valid_until")),
            "worker_code": _normalize_text(payload.get("worker_code")),
        }
