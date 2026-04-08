from __future__ import annotations

import json
from pathlib import Path
import sys


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agent_backend.config import load_settings  # noqa: E402
from agent_backend.db.bootstrap import ensure_database  # noqa: E402
from agent_backend.db.connection import connect  # noqa: E402
from agent_backend.repositories.store_repository import StoreRepository  # noqa: E402
from agent_backend.validation.contracts import normalize_contract_status, normalize_cost_category  # noqa: E402


def text(value) -> str:
    return str(value or "").strip()


def number(value) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def stable_generated_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index + 1:04d}"


def build_unique_contract_name_map(contract_rows):
    name_to_ids: dict[str, list[str]] = {}
    for row in contract_rows:
        contract_name = text(row.get("name"))
        contract_id = text(row.get("id"))
        if not contract_name or not contract_id:
            continue
        name_to_ids.setdefault(contract_name, []).append(contract_id)
    return {
        contract_name: ids[0]
        for contract_name, ids in name_to_ids.items()
        if len(set(ids)) == 1
    }


def resolve_contract_id(raw_contract_id, contract_name, valid_contract_ids, unique_contract_name_map):
    clean_contract_id = text(raw_contract_id)
    if clean_contract_id in valid_contract_ids:
        return clean_contract_id
    clean_contract_name = text(contract_name)
    if clean_contract_name and clean_contract_name in unique_contract_name_map:
        return unique_contract_name_map[clean_contract_name]
    return None


def build_contract_rows(contracts):
    rows = []
    for index, item in enumerate(contracts):
        name = text(item.get("name"))
        if not name:
            continue
        rows.append(
            {
                "id": text(item.get("id")) or stable_generated_id("legacy-contract", index),
                "contract_number": text(item.get("contract_number")),
                "name": name,
                "investor": text(item.get("investor")),
                "signed_date": text(item.get("signed_date")),
                "end_date": text(item.get("end_date")),
                "contract_value": number(item.get("contract_value")),
                "status": normalize_contract_status(item.get("status")),
                "created_at": text(item.get("created_at")),
                "updated_at": text(item.get("updated_at")),
            }
        )
    return rows


def build_employee_rows(employees):
    rows = []
    for index, item in enumerate(employees):
        name = text(item.get("name"))
        if not name:
            continue
        rows.append(
            {
                "id": text(item.get("id")) or stable_generated_id("legacy-employee", index),
                "name": name,
                "first_name": text(item.get("first_name")),
                "last_name": text(item.get("last_name")),
                "position": text(item.get("position")),
                "status": text(item.get("status")) or "active",
                "employment_date": text(item.get("employment_date")),
                "employment_end_date": text(item.get("employment_end_date")),
                "street": text(item.get("street")),
                "city": text(item.get("city")),
                "phone": text(item.get("phone")),
                "medical_exam_valid_until": text(item.get("medical_exam_valid_until")),
            }
        )
    return rows


def build_user_rows(settings_store):
    rows = []
    for index, user in enumerate(settings_store.get("users") or []):
        rows.append(
            {
                "id": text(user.get("id")) or stable_generated_id("legacy-user", index),
                "name": text(user.get("name")),
                "username": text(user.get("username")),
                "email": text(user.get("email")),
                "password_hash": text(user.get("password")),
                "role": text(user.get("role")),
                "status": text(user.get("status")),
                "permissions_json": json.dumps(user.get("permissions") or {}, ensure_ascii=False),
                "can_approve_vacations": 1 if bool(user.get("canApproveVacations")) else 0,
            }
        )
    return rows


def ensure_employee_reference_rows(employee_rows, stores):
    known_names = {row["name"] for row in employee_rows if row["name"]}
    referenced_names = set()

    for month in ((stores.get("hours") or {}).get("months") or {}).values():
        for worker in month.get("workers") or []:
            employee_name = text(worker.get("employee_name"))
            if employee_name:
                referenced_names.add(employee_name)

    vacations = stores.get("vacations") or {"balances": {}, "requests": []}
    referenced_names.update(text(name) for name in (vacations.get("balances") or {}).keys() if text(name))
    for request in vacations.get("requests") or []:
        employee_name = text(request.get("employee_name"))
        if employee_name:
            referenced_names.add(employee_name)

    for assignments in ((stores.get("planning") or {}).get("assignments") or {}).values():
        for employee_name in (assignments or {}).keys():
            clean_name = text(employee_name)
            if clean_name:
                referenced_names.add(clean_name)

    for issue in stores.get("workwearIssues") or []:
        employee_name = text(issue.get("employee_name"))
        if employee_name:
            referenced_names.add(employee_name)

    next_index = len(employee_rows)
    for employee_name in sorted(referenced_names):
        if employee_name in known_names:
            continue
        employee_rows.append(
            {
                "id": stable_generated_id("legacy-employee", next_index),
                "name": employee_name,
                "first_name": "",
                "last_name": "",
                "position": "",
                "status": "active",
                "employment_date": "",
                "employment_end_date": "",
                "street": "",
                "city": "",
                "phone": "",
                "medical_exam_valid_until": "",
            }
        )
        known_names.add(employee_name)
        next_index += 1
    return employee_rows


def insert_normalized_data(connection, stores):
    contracts = stores.get("contracts") or []
    employees = stores.get("employees") or []
    invoices = (stores.get("invoices") or {}).get("entries", [])
    hours = (stores.get("hours") or {}).get("months", {})
    vacations = stores.get("vacations") or {"balances": {}, "requests": []}
    planning = stores.get("planning") or {"assignments": {}}
    workwear_issues = stores.get("workwearIssues") or []
    workwear_catalog = stores.get("workwearCatalog") or []
    settings = stores.get("settings") or {"users": []}
    audit_logs = stores.get("auditLogs") or []
    notifications = stores.get("notifications") or []

    contract_rows = build_contract_rows(contracts)
    employee_rows = ensure_employee_reference_rows(build_employee_rows(employees), stores)
    user_rows = build_user_rows(settings)
    valid_contract_ids = {row["id"] for row in contract_rows if row["id"]}
    unique_contract_name_map = build_unique_contract_name_map(contract_rows)
    employee_name_map = {row["name"]: row["id"] for row in employee_rows}
    valid_user_ids = {row["id"] for row in user_rows if row["id"]}

    for row in contract_rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO contracts
            (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                row["id"],
                row["contract_number"],
                row["name"],
                row["investor"],
                row["signed_date"],
                row["end_date"],
                row["contract_value"],
                row["status"],
                row["created_at"],
                row["updated_at"],
            ),
        )

    for row in employee_rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO employees
            (id, name, first_name, last_name, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["name"],
                row["first_name"],
                row["last_name"],
                row["position"],
                row["status"],
                row["employment_date"],
                row["employment_end_date"],
                row["street"],
                row["city"],
                row["phone"],
                row["medical_exam_valid_until"],
            ),
        )

    for row in user_rows:
        connection.execute(
            """
            INSERT OR REPLACE INTO users
            (id, name, username, email, password_hash, role, status, permissions_json, can_approve_vacations)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["id"],
                row["name"],
                row["username"],
                row["email"],
                row["password_hash"],
                row["role"],
                row["status"],
                row["permissions_json"],
                row["can_approve_vacations"],
            ),
        )

    for invoice_index, entry in enumerate(invoices):
        contract_name = text(entry.get("contract_name"))
        raw_contract_id = text(entry.get("contract_id"))
        vat_rate = number(entry.get("vat_rate"))
        net_amount = number(entry.get("net_amount") or entry.get("amount_net"))
        vat_amount = number(entry.get("vat_amount") or entry.get("amount_vat")) or round(net_amount * vat_rate / 100, 2)
        gross_amount = number(entry.get("gross_amount") or entry.get("amount_gross")) or round(net_amount + vat_amount, 2)
        resolved_contract_id = resolve_contract_id(raw_contract_id, contract_name, valid_contract_ids, unique_contract_name_map)
        connection.execute(
            """
            INSERT OR REPLACE INTO invoices
            (
              id, contract_id, contract_name, type, issue_date, invoice_number,
              counterparty_name, category_or_description, cost_category, amount_net, vat_rate,
              amount_vat, amount_gross, due_date, payment_date, payment_status,
              notes, created_at, updated_at, created_by, updated_by, is_deleted
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text(entry.get("id")) or stable_generated_id("legacy-invoice", invoice_index),
                resolved_contract_id,
                contract_name,
                text(entry.get("type")),
                text(entry.get("issue_date")),
                text(entry.get("document_number")) or text(entry.get("invoice_number")),
                text(entry.get("party")) or text(entry.get("counterparty_name")),
                text(entry.get("category")) or text(entry.get("category_or_description")) or text(entry.get("description")),
                normalize_cost_category(
                    text(entry.get("cost_category")) or text(entry.get("category")),
                    invoice_type=text(entry.get("type")),
                ),
                net_amount,
                vat_rate,
                vat_amount,
                gross_amount,
                text(entry.get("due_date")),
                text(entry.get("payment_date")),
                text(entry.get("payment_status")) or ("paid" if text(entry.get("payment_date")) else "unpaid"),
                text(entry.get("description")) or text(entry.get("notes")),
                text(entry.get("created_at")),
                text(entry.get("updated_at")),
                text(entry.get("created_by")) if text(entry.get("created_by")) in valid_user_ids else None,
                text(entry.get("updated_by")) if text(entry.get("updated_by")) in valid_user_ids else None,
                1 if entry.get("is_deleted") else 0,
            ),
        )

    selected_month_key = text((stores.get("hours") or {}).get("selected_month_key"))
    time_entry_index = 0
    for month_key, month in (hours or {}).items():
        month_id = f"month-{month_key}"
        finance = month.get("finance") or {}
        visible_investments = []
        visible_seen = set()
        for raw_value in month.get("visible_investments") or []:
            resolved_visible_id = resolve_contract_id(raw_value, raw_value, valid_contract_ids, unique_contract_name_map)
            if not resolved_visible_id or resolved_visible_id in visible_seen:
                continue
            visible_seen.add(resolved_visible_id)
            visible_investments.append(resolved_visible_id)
        connection.execute(
            """
            INSERT OR REPLACE INTO hours_months
            (id, month_key, month_label, selected, visible_investments_json, finance_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                month_id,
                month_key,
                text(month.get("month_label")) or month_key,
                1 if selected_month_key == month_key else 0,
                json.dumps(visible_investments, ensure_ascii=False),
                json.dumps(finance, ensure_ascii=False),
            ),
        )

        payouts = number(finance.get("payouts"))
        non_payouts = sum(number(value) for key, value in finance.items() if key != "payouts")
        for worker in month.get("workers") or []:
            employee_name = text(worker.get("employee_name"))
            project_hours = worker.get("project_hours") or {}
            total_hours = sum(number(value) for value in project_hours.values())
            hourly_cost = ((payouts + non_payouts) / total_hours) if total_hours else 0
            for contract_name, hours_value in project_hours.items():
                clean_contract_name = text(contract_name)
                numeric_hours = number(hours_value)
                if not clean_contract_name or not numeric_hours:
                    continue
                resolved_contract_id = resolve_contract_id(
                    worker.get("contract_id"),
                    clean_contract_name,
                    valid_contract_ids,
                    unique_contract_name_map,
                )
                connection.execute(
                    """
                    INSERT OR REPLACE INTO time_entries
                    (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stable_generated_id("legacy-time", time_entry_index),
                        month_id,
                        employee_name_map.get(employee_name),
                        employee_name,
                        resolved_contract_id,
                        clean_contract_name,
                        numeric_hours,
                        round(numeric_hours * hourly_cost, 2),
                    ),
                )
                time_entry_index += 1

    for balance_index, (employee_name, balance) in enumerate((vacations.get("balances") or {}).items()):
        clean_name = text(employee_name)
        if not clean_name:
            continue
        connection.execute(
            """
            INSERT OR REPLACE INTO vacation_balances
            (employee_id, employee_name, base_days, carryover_days, extra_days)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                employee_name_map.get(clean_name) or stable_generated_id("legacy-employee-balance", balance_index),
                clean_name,
                number(balance.get("base_days")),
                number(balance.get("carryover_days")),
                number(balance.get("extra_days")),
            ),
        )

    for request_index, request in enumerate(vacations.get("requests") or []):
        employee_name = text(request.get("employee_name"))
        connection.execute(
            """
            INSERT OR REPLACE INTO vacation_requests
            (id, employee_id, employee_name, request_type, start_date, end_date, days, status, requested_by, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text(request.get("id")) or stable_generated_id("legacy-vacation", request_index),
                employee_name_map.get(employee_name),
                employee_name,
                text(request.get("type")),
                text(request.get("start_date")),
                text(request.get("end_date")),
                number(request.get("days")),
                text(request.get("status")),
                text(request.get("requested_by")),
                text(request.get("notes")),
                text(request.get("created_at")),
            ),
        )

    planning_index = 0
    for assignment_date, assignments in (planning.get("assignments") or {}).items():
        for employee_name, payload in (assignments or {}).items():
            clean_name = text(employee_name)
            resolved_contract_id = resolve_contract_id(
                payload.get("contract_id"),
                payload.get("contract_name"),
                valid_contract_ids,
                unique_contract_name_map,
            )
            connection.execute(
                """
                INSERT OR REPLACE INTO planning_assignments
                (id, assignment_date, employee_id, employee_name, contract_id, contract_name, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    stable_generated_id("legacy-plan", planning_index),
                    text(assignment_date),
                    employee_name_map.get(clean_name),
                    clean_name,
                    resolved_contract_id,
                    text(payload.get("contract_name")),
                    text(payload.get("note")),
                ),
            )
            planning_index += 1

    for catalog_index, item in enumerate(workwear_catalog):
        connection.execute(
            """
            INSERT OR REPLACE INTO workwear_catalog
            (id, name, category, notes)
            VALUES (?, ?, ?, ?)
            """,
            (
                text(item.get("id")) or stable_generated_id("legacy-workwear-catalog", catalog_index),
                text(item.get("name")),
                text(item.get("category")),
                text(item.get("notes")),
            ),
        )

    for issue_index, item in enumerate(workwear_issues):
        employee_name = text(item.get("employee_name"))
        connection.execute(
            """
            INSERT OR REPLACE INTO workwear_issues
            (id, employee_id, employee_name, issue_date, item_id, item_name, size, quantity, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text(item.get("id")) or stable_generated_id("legacy-workwear-issue", issue_index),
                employee_name_map.get(employee_name),
                employee_name,
                text(item.get("issue_date")),
                text(item.get("item_id")),
                text(item.get("item_name")),
                text(item.get("size")),
                number(item.get("quantity")),
                text(item.get("notes")),
            ),
        )

    for audit_index, entry in enumerate(audit_logs):
        connection.execute(
            """
            INSERT OR REPLACE INTO audit_logs
            (id, timestamp, module, action, subject, details, user_id, user_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text(entry.get("id")) or stable_generated_id("legacy-audit", audit_index),
                text(entry.get("timestamp")),
                text(entry.get("module")),
                text(entry.get("action")),
                text(entry.get("subject")),
                text(entry.get("details")),
                text(entry.get("user_id")),
                text(entry.get("user_name")),
            ),
        )

    for notification_index, entry in enumerate(notifications):
        connection.execute(
            """
            INSERT OR REPLACE INTO notifications
            (id, created_at, notification_type, title, message, meta_json, read)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                text(entry.get("id")) or stable_generated_id("legacy-notification", notification_index),
                text(entry.get("created_at")),
                text(entry.get("type")),
                text(entry.get("title")),
                text(entry.get("message")),
                json.dumps(entry.get("meta") or {}, ensure_ascii=False),
                1 if bool(entry.get("read")) else 0,
            ),
        )


def main(snapshot_path: str) -> None:
    settings = load_settings()
    ensure_database(settings)
    payload = json.loads(Path(snapshot_path).read_text(encoding="utf-8-sig"))
    stores = payload.get("stores") or {}
    store_repository = StoreRepository(settings)
    for store_name, store_payload in stores.items():
        store_repository.save(store_name, store_payload)
    with connect(settings) as connection:
        insert_normalized_data(connection, stores)
        connection.commit()
    print(f"Imported legacy snapshot from {snapshot_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("Usage: python backend/scripts/import_legacy_snapshot.py <snapshot.json>")
    main(sys.argv[1])
