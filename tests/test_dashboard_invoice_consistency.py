from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.config import load_settings  # noqa: E402
from clode_backend.db.bootstrap import ensure_database  # noqa: E402
from clode_backend.db.connection import connect  # noqa: E402
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.repositories.invoice_repository import InvoiceRepository  # noqa: E402
from clode_backend.services.contract_service import ContractService  # noqa: E402
from clode_backend.services.invoice_service import InvoiceService  # noqa: E402


class DashboardInvoiceConsistencyTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-dashboard-consistency-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.contract_repository = ContractRepository(self.settings)
        self.invoice_repository = InvoiceRepository(self.settings)
        self.metrics_repository = ContractMetricsRepository(self.settings)
        self.contract_service = ContractService(self.contract_repository, self.metrics_repository)
        self.invoice_service = InvoiceService(self.invoice_repository, self.contract_repository)
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
                ('c-dashboard', '001', 'Kontrakt Dashboard', 'Inwestor A', '2026-01-01', '', 100000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-archived', '002', 'Kontrakt Archiwalny', 'Inwestor B', '2025-01-01', '', 50000, 'archived', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
                """
            )
            connection.execute(
                """
                INSERT INTO employees
                (id, name, first_name, last_name, position, status, employment_date, employment_end_date, street, city, phone, medical_exam_valid_until)
                VALUES
                ('e-1', 'Jan Kowalski', 'Jan', 'Kowalski', '', 'active', '', '', '', '', '', '')
                """
            )
            connection.execute(
                """
                INSERT INTO hours_months
                (id, month_key, month_label, selected, visible_investments_json, finance_json)
                VALUES
                ('m-2026-03', '2026-03', 'marzec 2026', 1, '[]', '{}')
                """
            )
            connection.execute(
                """
                INSERT INTO invoices
                (id, contract_id, contract_name, type, issue_date, invoice_number, counterparty_name,
                 category_or_description, cost_category, amount_net, vat_rate, amount_vat, amount_gross,
                 due_date, payment_date, payment_status, notes, created_at, updated_at, created_by, updated_by, is_deleted)
                VALUES
                ('inv-cost-1', 'c-dashboard', 'Kontrakt Dashboard', 'cost', '2026-03-10', 'KOS/1', 'Dostawca A',
                 'Materiały', 'materials', 300, 23, 69, 369, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-cost-2', 'c-dashboard', 'Kontrakt Dashboard', 'cost', '2026-03-12', 'KOS/2', 'Dostawca B',
                 'Usługi', 'services', 200, 23, 46, 246, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-sales-1', 'c-dashboard', 'Kontrakt Dashboard', 'sales', '2026-03-20', 'FV/1', 'Klient A',
                 'Sprzedaż', '', 1200, 23, 276, 1476, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0),
                ('inv-unassigned', NULL, '', 'sales', '2026-03-22', 'FV/U', 'Klient U',
                 'Nieprzypisane', '', 150, 23, 34.5, 184.5, '', '', 'unpaid', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'user-admin', 'user-admin', 0)
                """
            )
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-1', 'm-2026-03', 'e-1', 'Jan Kowalski', 'c-dashboard', 'Kontrakt Dashboard', 10, 250),
                ('te-2', 'm-2026-03', 'e-1', 'Jan Kowalski', NULL, '', 2, 40)
                """
            )
            connection.commit()

    def test_dashboard_snapshot_matches_invoice_register_for_same_contract(self) -> None:
        invoice_cost = self.invoice_service.list_invoices(
            {"contract_id": "c-dashboard", "scope": "month", "year": "2026", "month": "03", "type": "cost"},
            self.current_user,
        )
        invoice_sales = self.invoice_service.list_invoices(
            {"contract_id": "c-dashboard", "scope": "month", "year": "2026", "month": "03", "type": "sales"},
            self.current_user,
        )
        snapshot = self.contract_service.calculate_dashboard_snapshot(
            {"scope": "month", "year": "2026", "month": "03"},
            self.current_user,
            include_archived=False,
        )

        dashboard_item = next(item for item in snapshot["contracts"] if item["contract"]["id"] == "c-dashboard")
        metrics = dashboard_item["metrics"]

        self.assertEqual(invoice_cost["summary"]["count"], 2)
        self.assertEqual(invoice_sales["summary"]["count"], 1)
        self.assertEqual(invoice_cost["summary"]["amount_net"], 500.0)
        self.assertEqual(invoice_sales["summary"]["amount_net"], 1200.0)
        self.assertEqual(metrics["cost_invoice_count"], 2)
        self.assertEqual(metrics["sales_invoice_count"], 1)
        self.assertEqual(metrics["invoice_cost_total"], 500.0)
        self.assertEqual(metrics["revenue_total"], 1200.0)
        self.assertEqual(metrics["labor_cost_total"], 250.0)
        self.assertEqual(metrics["cost_total"], 750.0)
        self.assertEqual(metrics["margin"], 450.0)

    def test_unassigned_is_not_mixed_into_assigned_contract(self) -> None:
        snapshot = self.contract_service.calculate_dashboard_snapshot(
            {"scope": "month", "year": "2026", "month": "03"},
            self.current_user,
            include_archived=False,
        )
        dashboard_item = next(item for item in snapshot["contracts"] if item["contract"]["id"] == "c-dashboard")

        self.assertEqual(dashboard_item["metrics"]["revenue_total"], 1200.0)
        self.assertEqual(snapshot["unassigned"]["revenue_total"], 150.0)
        self.assertEqual(snapshot["unassigned"]["labor_cost_total"], 40.0)
        self.assertEqual(snapshot["totals"]["revenue_total"], 1200.0)


if __name__ == "__main__":
    unittest.main()

