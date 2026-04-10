from __future__ import annotations

import os
import unittest
from uuid import uuid4
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"
import sys

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.services.contract_service import ContractService  # noqa: E402


class ContractMetricsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-contract-metrics-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.contract_repository = ContractRepository(self.settings)
        self.metrics_repository = ContractMetricsRepository(self.settings)
        self.service = ContractService(self.contract_repository, self.metrics_repository)
        self.current_user = {"id": "user-admin", "role": "admin"}
        self._seed_data()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("CLODE_DATABASE_URL", None)
        else:
            os.environ["CLODE_DATABASE_URL"] = self.previous_database_url

    def _seed_data(self) -> None:
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO users
                (id, name, username, email, password_hash, role, status, permissions_json, can_approve_vacations)
                VALUES
                ('user-admin', 'Admin', 'admin', 'admin@example.com', 'hash', 'admin', 'active', '{}', 1)
                """
            )
            connection.execute(
                """
                INSERT INTO contracts
                (id, contract_number, name, investor, signed_date, end_date, contract_value, status, created_at, updated_at, deleted_at)
                VALUES
                ('c1', '001', 'Kontrakt A', 'Inwestor A', '2026-01-01', '', 100000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c2', '002', 'Kontrakt B', 'Inwestor B', '2026-01-02', '', 200000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c3', '003', 'Kontrakt C', 'Inwestor C', '2026-01-03', '', 300000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO employees
                (id, name, first_name, last_name, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('e1', 'Pracownik A', 'Pracownik', 'A', '', 'active', '', '', '', '', '', ''),
                ('e2', 'Pracownik B', 'Pracownik', 'B', '', 'active', '', '', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT INTO hours_months
                (id, month_key, month_label, selected, visible_investments_json, finance_json)
                VALUES
                ('m-2026-03', '2026-03', 'marzec 2026', 1, '[]', '{}'),
                ('m-2025-12', '2025-12', 'grudzien 2025', 0, '[]', '{}')
                """
            )
            connection.execute(
                """
                INSERT INTO invoices
                (id, contract_id, contract_name, type, issue_date, invoice_number, counterparty_name,
                 category_or_description, cost_category, amount_net, vat_rate, amount_vat, amount_gross,
                 due_date, payment_date, payment_status, notes, created_at, updated_at, created_by, updated_by, is_deleted)
                VALUES
                ('inv-sales-a-2026', 'c1', 'Kontrakt A', 'sales', '2026-03-15', 'FV/1/03/2026', 'Klient A',
                 'Sprzedaz marcowa', '', 1000, 23, 230, 1230, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-sales-a-2025', 'c1', 'Kontrakt A', 'sales', '2025-12-10', 'FV/9/12/2025', 'Klient A',
                 'Sprzedaz grudniowa', '', 200, 23, 46, 246, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-cost-a-2026', 'c1', 'Kontrakt A', 'cost', '2026-03-08', 'KOS/1/03/2026', 'Dostawca A',
                 'Zakup materialow', 'materials', 300, 23, 69, 369, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-sales-b-2026', 'c2', 'Kontrakt B', 'sales', '2026-01-12', 'FV/2/01/2026', 'Klient B',
                 'Sprzedaz styczniowa', '', 400, 23, 92, 492, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-cost-c-2026', 'c3', 'Kontrakt C', 'cost', '2026-02-12', 'KOS/2/02/2026', 'Dostawca C',
                 'Nieznana kategoria', 'invalid-category', 250, 23, 57.5, 307.5, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-unassigned-cost', NULL, '', 'cost', '2026-03-03', 'KOS/U/03/2026', 'Dostawca U',
                 'Koszt nieprzypisany', 'other', 80, 23, 18.4, 98.4, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-unassigned-sales', NULL, '', 'sales', '2026-03-20', 'FV/U/03/2026', 'Klient U',
                 'Sprzedaz nieprzypisana', '', 50, 23, 11.5, 61.5, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0)
                """
            )
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-a-2026', 'm-2026-03', 'e1', 'Pracownik A', 'c1', 'Kontrakt A', 10, 200),
                ('te-unassigned-2026', 'm-2026-03', 'e2', 'Pracownik B', NULL, '', 2, 20)
                """
            )
            connection.execute(
                """
                INSERT INTO planning_assignments
                (id, assignment_date, employee_id, employee_name, contract_id, contract_name, note)
                VALUES
                ('plan-a', '2026-03-10', 'e1', 'Pracownik A', 'c1', 'Kontrakt A', ''),
                ('plan-unassigned', '2026-03-11', 'e2', 'Pracownik B', NULL, '', '')
                """
            )
            connection.commit()

    def test_metrics_include_labor_and_categories_for_month(self) -> None:
        result = self.service.calculate_contract_metrics(
            "c1",
            {"scope": "month", "year": "2026", "month": "03"},
            self.current_user,
        )
        metrics = result["metrics"]
        self.assertEqual(metrics["revenue_total"], 1000.0)
        self.assertEqual(metrics["cost_by_category"]["materials"], 300.0)
        self.assertEqual(metrics["cost_by_category"]["labor"], 200.0)
        self.assertEqual(metrics["cost_total"], 500.0)
        self.assertEqual(metrics["margin"], 500.0)

    def test_contract_without_costs_returns_zero_costs(self) -> None:
        result = self.service.calculate_contract_metrics(
            "c2",
            {"scope": "year", "year": "2026"},
            self.current_user,
        )
        metrics = result["metrics"]
        self.assertEqual(metrics["revenue_total"], 400.0)
        self.assertEqual(metrics["cost_total"], 0.0)
        self.assertEqual(metrics["margin"], 400.0)

    def test_invalid_cost_category_defaults_to_other(self) -> None:
        result = self.service.calculate_contract_metrics(
            "c3",
            {"scope": "year", "year": "2026"},
            self.current_user,
        )
        metrics = result["metrics"]
        self.assertEqual(metrics["revenue_total"], 0.0)
        self.assertEqual(metrics["cost_by_category"]["other"], 250.0)
        self.assertEqual(metrics["cost_total"], 250.0)
        self.assertEqual(metrics["margin"], -250.0)

    def test_unassigned_metrics_and_global_totals(self) -> None:
        unassigned = self.service.calculate_contract_metrics(
            "unassigned",
            {"scope": "month", "year": "2026", "month": "03"},
            self.current_user,
        )["metrics"]
        snapshot = self.service.calculate_dashboard_snapshot(
            {"scope": "month", "year": "2026", "month": "03"},
            self.current_user,
        )

        self.assertEqual(unassigned["revenue_total"], 50.0)
        self.assertEqual(unassigned["cost_total"], 100.0)
        self.assertEqual(unassigned["cost_by_category"]["labor"], 20.0)
        self.assertEqual(unassigned["cost_by_category"]["other"], 80.0)
        self.assertEqual(snapshot["totals"]["revenue_total"], 1000.0)
        self.assertEqual(snapshot["totals"]["cost_total"], 500.0)
        self.assertEqual(snapshot["unassigned"]["margin"], -50.0)

    def test_archive_contract_preserves_operational_data(self) -> None:
        usage = self.service.get_contract_usage("c1", self.current_user)
        archived = self.service.archive_contract("c1", self.current_user)

        self.assertTrue(usage["has_operational_data"])
        self.assertEqual(usage["usage"]["invoices"], 3)
        self.assertEqual(usage["usage"]["hours"], 1)
        self.assertEqual(usage["usage"]["planning"], 1)
        self.assertEqual(archived["status"], "archived")


if __name__ == "__main__":
    unittest.main()

