from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


CONTRACT_FILES = {
    "contract": "contract.schema.json",
    "employee": "employee.schema.json",
    "hours_month": "hours-month.schema.json",
    "invoice": "invoice.schema.json",
    "planning_store": "planning-store.schema.json",
    "planning_assignment": "planning-assignment.schema.json",
    "settings_audit_log": "settings-audit-log.schema.json",
    "settings_workflow": "settings-workflow.schema.json",
    "user": "user.schema.json",
    "vacation_store": "vacation-store.schema.json",
    "vacation_request": "vacation-request.schema.json",
    "work_card_store": "work-card-store.schema.json",
    "workwear_catalog": "workwear-catalog.schema.json",
    "workwear_issues": "workwear-issues.schema.json",
    "workwear_issue": "workwear-issue.schema.json",
}


def _resolve_contracts_dir() -> Path:
    expected_marker = CONTRACT_FILES["user"]
    current_file = Path(__file__).resolve()
    search_roots = [
        current_file.parent,
        *current_file.parents,
        Path.cwd(),
        *Path.cwd().parents,
    ]
    for root in search_roots:
        candidate = root / "shared" / "contracts"
        if (candidate / expected_marker).exists():
            return candidate
    return current_file.parents[3] / "shared" / "contracts"


CONTRACTS_DIR = _resolve_contracts_dir()


class ContractValidationError(ValueError):
    pass


@lru_cache(maxsize=None)
def load_shared_contract(contract_name: str) -> dict[str, Any]:
    contract_file = CONTRACT_FILES.get(contract_name)
    if not contract_file:
        raise ContractValidationError(f"Nieznany kontrakt: {contract_name}.")

    contract_path = CONTRACTS_DIR / contract_file
    try:
        return json.loads(contract_path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ContractValidationError(f"Nie znaleziono kontraktu {contract_name}.") from error
    except json.JSONDecodeError as error:
        raise ContractValidationError(f"Kontrakt {contract_name} ma niepoprawny JSON.") from error


def validate_shared_contract(contract_name: str, payload: Any) -> Any:
    schema = load_shared_contract(contract_name)
    _validate_node(schema, payload, path=contract_name)
    return payload


def _validate_node(schema: dict[str, Any], value: Any, *, path: str) -> None:
    schema_types = schema.get("type")
    if schema_types is not None and not _matches_schema_types(value, schema_types):
        expected = (
            ", ".join(schema_types)
            if isinstance(schema_types, list)
            else str(schema_types)
        )
        actual = _value_type_name(value)
        raise ContractValidationError(f"{path}: oczekiwano typu {expected}, otrzymano {actual}.")

    if "enum" in schema and value not in schema["enum"]:
        allowed = ", ".join(repr(item) for item in schema["enum"])
        raise ContractValidationError(f"{path}: wartosc {value!r} nie nalezy do enum [{allowed}].")

    if value is None:
        return

    if isinstance(value, dict):
        required_fields = schema.get("required") or []
        for field_name in required_fields:
            if field_name not in value:
                raise ContractValidationError(f"{path}: brakuje pola {field_name}.")

        properties = schema.get("properties") or {}
        additional_properties = schema.get("additionalProperties", None)

        for field_name, field_value in value.items():
            field_path = f"{path}.{field_name}"
            if field_name in properties:
                _validate_node(properties[field_name], field_value, path=field_path)
                continue
            if additional_properties is False:
                raise ContractValidationError(f"{path}: pole {field_name} nie jest dozwolone.")
            if isinstance(additional_properties, dict):
                _validate_node(additional_properties, field_value, path=field_path)

        return

    if isinstance(value, list):
        item_schema = schema.get("items")
        if not isinstance(item_schema, dict):
            return
        for index, item in enumerate(value):
            _validate_node(item_schema, item, path=f"{path}[{index}]")


def _matches_schema_types(value: Any, schema_types: str | list[str]) -> bool:
    candidate_types = schema_types if isinstance(schema_types, list) else [schema_types]
    return any(_matches_schema_type(value, candidate_type) for candidate_type in candidate_types)


def _matches_schema_type(value: Any, schema_type: str) -> bool:
    if schema_type == "null":
        return value is None
    if schema_type == "string":
        return isinstance(value, str)
    if schema_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if schema_type == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if schema_type == "boolean":
        return isinstance(value, bool)
    if schema_type == "object":
        return isinstance(value, dict)
    if schema_type == "array":
        return isinstance(value, list)
    return True


def _value_type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "string"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, dict):
        return "object"
    if isinstance(value, list):
        return "array"
    return type(value).__name__
