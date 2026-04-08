from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"
BACKEND_SCRIPTS = PROJECT_DIR / "backend" / "scripts"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))
if str(BACKEND_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(BACKEND_SCRIPTS))

from agent_backend.config import load_settings  # noqa: E402
from agent_backend.db.bootstrap import ensure_database  # noqa: E402
from agent_backend.db.connection import connect  # noqa: E402
from agent_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from agent_backend.repositories.invoice_repository import InvoiceRepository  # noqa: E402
from agent_backend.services.invoice_service import InvoiceService  # noqa: E402
from import_legacy_snapshot import insert_normalized_data  # noqa: E402


class InvoiceContractIdentityTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("AGENT_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"agent-test-invoice-contracts-{uuid4().hex}.db"
        os.environ["AGENT_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.contract_repository = ContractRepository(self.settings)
        self.invoice_repository = InvoiceRepository(self.settings)
        self.service = InvoiceService(self.invoice_repository, self.contract_repository)
        self.current_user = {"id": "user-admin", "role": "admin"}
        self._seed_core_data()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("AGENT_DATABASE_URL", None)
        else:
            os.environ["AGENT_DATABASE_URL"] = self.previous_database_url

    def _seed_core_data(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO users
                (id, name, username, email, password_hash, role, status, permissions_json, can_approve_vacations, is_active, created_at, updated_at, last_login_at)
                VALUES
                ('user-admin', 'Admin', 'admin', 'admin@example.com', 'hash', 'admin', 'active', '{}', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
                """
            )
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-dup-1', '001', 'Duplikat', 'Inwestor 1', '2026-01-01', '', 1000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-dup-2', '002', 'Duplikat', 'Inwestor 2', '2026-01-02', '', 2000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-other', '003', 'Inny', 'Inwestor 3', '2026-01-03', '', 3000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.commit()

    def test_duplicate_names_do_not_mix_invoice_filters(self) -> None:
        first = self.service.create_invoice(
            {
                "contract_id": "c-dup-1",
                "contract_name": "Duplikat",
                "type": "cost",
                "issue_date": "2026-03-01",
                "invoice_number": "KOS/1",
                "counterparty_name": "Dostawca 1",
                "category_or_description": "Materiał",
                "amount_net": 100,
                "vat_rate": 23,
                "amount_vat": 23,
                "amount_gross": 123,
            },
            self.current_user,
        )
        second = self.service.create_invoice(
            {
                "contract_id": "c-dup-2",
                "contract_name": "Duplikat",
                "type": "cost",
                "issue_date": "2026-03-02",
                "invoice_number": "KOS/2",
                "counterparty_name": "Dostawca 2",
                "category_or_description": "Usługa",
                "amount_net": 200,
                "vat_rate": 23,
                "amount_vat": 46,
                "amount_gross": 246,
            },
            self.current_user,
        )

        first_list = self.service.list_invoices({"contract_id": "c-dup-1", "scope": "all", "type": "cost"}, self.current_user)
        second_list = self.service.list_invoices({"contract_id": "c-dup-2", "scope": "all", "type": "cost"}, self.current_user)

        self.assertEqual([item["id"] for item in first_list["items"]], [first["id"]])
        self.assertEqual([item["id"] for item in second_list["items"]], [second["id"]])

    def test_missing_contract_id_stays_unassigned_even_with_matching_name(self) -> None:
        created = self.service.create_invoice(
            {
                "contract_name": "Duplikat",
                "type": "cost",
                "issue_date": "2026-03-10",
                "invoice_number": "KOS/U",
                "counterparty_name": "Dostawca U",
                "category_or_description": "Brak przypisania",
                "amount_net": 50,
                "vat_rate": 23,
                "amount_vat": 11.5,
                "amount_gross": 61.5,
            },
            self.current_user,
        )

        stored = self.invoice_repository.get_by_id(created["id"])
        unassigned = self.service.list_invoices({"unassigned": "1", "scope": "all", "type": "cost"}, self.current_user)
        assigned = self.service.list_invoices({"contract_id": "c-dup-1", "scope": "all", "type": "cost"}, self.current_user)

        self.assertEqual(stored["contract_id"], "")
        self.assertEqual(stored["contract_name"], "Duplikat")
        self.assertIn(created["id"], [item["id"] for item in unassigned["items"]])
        self.assertNotIn(created["id"], [item["id"] for item in assigned["items"]])

    def test_service_legacy_import_materializes_unique_contract_name_only_when_unambiguous(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c-unique-1', '004', 'Jednoznaczny', 'Inwestor 4', '2026-01-04', '', 4000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.commit()

        result = self.service.import_legacy_entries(
            [
                {
                    "id": "legacy-ambiguous",
                    "contract_name": "Duplikat",
                    "type": "cost",
                    "issue_date": "2026-04-01",
                    "invoice_number": "LEG-AMB",
                    "counterparty_name": "Dostawca A",
                    "category_or_description": "Ambiguous",
                    "amount_net": 100,
                    "amount_vat": 23,
                    "amount_gross": 123,
                },
                {
                    "id": "legacy-unique",
                    "contract_name": "Jednoznaczny",
                    "type": "cost",
                    "issue_date": "2026-04-02",
                    "invoice_number": "LEG-UNI",
                    "counterparty_name": "Dostawca B",
                    "category_or_description": "Unique",
                    "amount_net": 200,
                    "amount_vat": 46,
                    "amount_gross": 246,
                },
            ],
            self.current_user,
        )

        self.assertEqual(result["imported_count"], 2)
        ambiguous = self.invoice_repository.get_by_id("legacy-ambiguous")
        unique = self.invoice_repository.get_by_id("legacy-unique")
        self.assertEqual(ambiguous["contract_id"], "")
        self.assertEqual(unique["contract_id"], "c-unique-1")

    def test_legacy_import_is_deterministic_and_materializes_only_unique_matches(self) -> None:
        stores = {
            "contracts": [
                {"id": "c-legacy-unique", "contract_number": "009", "name": "Jednoznaczny", "status": "active"},
                {"id": "c-legacy-1", "contract_number": "010", "name": "Powielona", "status": "active"},
                {"id": "c-legacy-2", "contract_number": "011", "name": "Powielona", "status": "active"},
            ],
            "employees": [
                {"id": "e-1", "name": "Jan Kowalski", "status": "active"},
            ],
            "invoices": {
                "entries": [
                    {
                        "id": "inv-legacy-explicit",
                        "contract_id": "c-legacy-2",
                        "contract_name": "Powielona",
                        "type": "cost",
                        "issue_date": "2026-02-01",
                        "invoice_number": "LEG/1",
                        "counterparty_name": "Dostawca A",
                        "category_or_description": "Materiały",
                        "amount_net": 100,
                        "amount_vat": 23,
                        "amount_gross": 123,
                    },
                    {
                        "id": "inv-legacy-unassigned",
                        "contract_name": "Powielona",
                        "type": "cost",
                        "issue_date": "2026-02-02",
                        "invoice_number": "LEG/2",
                        "counterparty_name": "Dostawca B",
                        "category_or_description": "Bez ID",
                        "amount_net": 50,
                        "amount_vat": 11.5,
                        "amount_gross": 61.5,
                    },
                    {
                        "id": "inv-legacy-unique",
                        "contract_name": "Jednoznaczny",
                        "type": "cost",
                        "issue_date": "2026-02-03",
                        "invoice_number": "LEG/3",
                        "counterparty_name": "Dostawca C",
                        "category_or_description": "Jednoznaczne przypisanie",
                        "amount_net": 70,
                        "amount_vat": 16.1,
                        "amount_gross": 86.1,
                    },
                ]
            },
            "hours": {
                "selected_month_key": "2026-02",
                "months": {
                    "2026-02": {
                        "month_label": "luty 2026",
                        "finance": {"payouts": 1000},
                        "workers": [
                            {
                                "employee_name": "Jan Kowalski",
                                "project_hours": {"Powielona": 8, "Jednoznaczny": 4},
                            }
                        ],
                    }
                },
            },
            "planning": {
                "assignments": {
                    "2026-02-03": {
                        "Jan Kowalski": {
                            "contract_name": "Powielona",
                            "note": "Legacy",
                        }
                    },
                    "2026-02-04": {
                        "Jan Kowalski": {
                            "contract_name": "Jednoznaczny",
                            "note": "Legacy unique",
                        }
                    }
                }
            },
        }

        with connect(self.settings) as connection:
            insert_normalized_data(connection, stores)
            insert_normalized_data(connection, stores)
            connection.commit()
            invoices = connection.execute(
                "SELECT id, contract_id, contract_name FROM invoices WHERE id IN ('inv-legacy-explicit', 'inv-legacy-unassigned', 'inv-legacy-unique') ORDER BY id"
            ).fetchall()
            time_entries = connection.execute(
                "SELECT contract_id, contract_name FROM time_entries ORDER BY id"
            ).fetchall()
            planning_rows = connection.execute(
                "SELECT contract_id, contract_name FROM planning_assignments ORDER BY id"
            ).fetchall()

        invoice_map = {row["id"]: row for row in invoices}
        self.assertEqual(invoice_map["inv-legacy-explicit"]["contract_id"], "c-legacy-2")
        self.assertIsNone(invoice_map["inv-legacy-unassigned"]["contract_id"])
        self.assertEqual(invoice_map["inv-legacy-unassigned"]["contract_name"], "Powielona")
        self.assertEqual(invoice_map["inv-legacy-unique"]["contract_id"], "c-legacy-unique")
        self.assertEqual(len(time_entries), 2)
        self.assertIsNone(time_entries[0]["contract_id"])
        self.assertEqual(time_entries[0]["contract_name"], "Powielona")
        self.assertEqual(time_entries[1]["contract_id"], "c-legacy-unique")
        self.assertEqual(time_entries[1]["contract_name"], "Jednoznaczny")
        self.assertEqual(len(planning_rows), 2)
        self.assertIsNone(planning_rows[0]["contract_id"])
        self.assertEqual(planning_rows[0]["contract_name"], "Powielona")
        self.assertEqual(planning_rows[1]["contract_id"], "c-legacy-unique")
        self.assertEqual(planning_rows[1]["contract_name"], "Jednoznaczny")


if __name__ == "__main__":
    unittest.main()
