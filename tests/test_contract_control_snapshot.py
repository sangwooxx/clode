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
from clode_backend.repositories.contract_control_repository import ContractControlRepository  # noqa: E402
from clode_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from clode_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from clode_backend.services.contract_service import ContractService  # noqa: E402


class ContractControlSnapshotTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("CLODE_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"clode-test-contract-control-{uuid4().hex}.db"
        os.environ["CLODE_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.contract_repository = ContractRepository(self.settings)
        self.metrics_repository = ContractMetricsRepository(self.settings)
        self.control_repository = ContractControlRepository(self.settings)
        self.service = ContractService(
            self.contract_repository,
            self.metrics_repository,
            control_repository=self.control_repository,
        )
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
                ('c-plan', 'K/2026/001', 'Kontrakt Plan', 'Inwestor A', '2026-01-10', '2026-12-31', 100000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-empty', 'K/2026/002', 'Kontrakt Pusty', 'Inwestor B', '', '', 80000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-archived', 'K/2025/003', 'Kontrakt Archiwalny', 'Inwestor C', '2025-01-01', '2025-12-31', 50000, 'archived', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
                ('c-risk', 'K/2024/004', 'Kontrakt Ryzyko', 'Inwestor D', '2024-01-01', '2024-01-31', 40000, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)
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
                ('m-2026-04', '2026-04', 'kwiecień 2026', 1, '[]', '{}'),
                ('m-2024-01', '2024-01', 'styczeń 2024', 0, '[]', '{}')
                """
            )
            connection.execute(
                """
                INSERT INTO invoices
                (id, contract_id, contract_name, type, issue_date, invoice_number, counterparty_name,
                 category_or_description, cost_category, amount_net, vat_rate, amount_vat, amount_gross,
                 due_date, payment_date, payment_status, notes, created_at, updated_at, created_by, updated_by, is_deleted)
                VALUES
                ('inv-plan-sales', 'c-plan', 'Kontrakt Plan', 'sales', '2026-04-15', 'FV/1/04/2026', 'Klient A',
                 'Sprzedaż', '', 40000, 23, 9200, 49200, '', '', 'unpaid', '', '2026-04-15T10:00:00Z', '2026-04-18T12:00:00Z', 'user-admin', 'user-admin', 0),
                ('inv-plan-cost', 'c-plan', 'Kontrakt Plan', 'cost', '2026-04-10', 'KOS/1/04/2026', 'Dostawca A',
                 'Materiały', 'materials', 12000, 23, 2760, 14760, '', '', 'unpaid', '', '2026-04-10T10:00:00Z', '2026-04-17T08:00:00Z', 'user-admin', 'user-admin', 0),
                ('inv-risk-sales', 'c-risk', 'Kontrakt Ryzyko', 'sales', '2024-01-15', 'FV/1/01/2024', 'Klient D',
                 'Sprzedaż', '', 1000, 23, 230, 1230, '', '', 'unpaid', '', '2024-01-15T10:00:00Z', '2024-01-16T08:00:00Z', 'user-admin', 'user-admin', 0),
                ('inv-risk-cost', 'c-risk', 'Kontrakt Ryzyko', 'cost', '2024-01-12', 'KOS/1/01/2024', 'Dostawca D',
                 'Usługi', 'services', 2200, 23, 506, 2706, '', '', 'unpaid', '', '2024-01-12T10:00:00Z', '2024-01-14T08:00:00Z', 'user-admin', 'user-admin', 0)
                """
            )
            connection.execute(
                """
                INSERT INTO time_entries
                (id, month_id, employee_id, employee_name, contract_id, contract_name, hours, cost_amount)
                VALUES
                ('te-plan', 'm-2026-04', 'e1', 'Pracownik A', 'c-plan', 'Kontrakt Plan', 160, 8000),
                ('te-risk', 'm-2024-01', 'e2', 'Pracownik B', 'c-risk', 'Kontrakt Ryzyko', 32, 1200)
                """
            )
            connection.execute(
                """
                INSERT INTO planning_assignments
                (id, assignment_date, employee_id, employee_name, contract_id, contract_name, note)
                VALUES
                ('plan-plan', '2026-04-09', 'e1', 'Pracownik A', 'c-plan', 'Kontrakt Plan', ''),
                ('plan-risk', '2024-01-09', 'e2', 'Pracownik B', 'c-risk', 'Kontrakt Ryzyko', '')
                """
            )
            connection.execute(
                """
                INSERT INTO contract_controls
                (contract_id, planned_revenue_total, planned_invoice_cost_total, planned_labor_cost_total,
                 forecast_revenue_total, forecast_invoice_cost_total, forecast_labor_cost_total, note, updated_at, updated_by)
                VALUES
                ('c-plan', NULL, 30000, 25000, NULL, 35000, 27000, 'Kontrola kwartalna', '2026-04-20T09:00:00Z', 'user-admin'),
                ('c-risk', NULL, 1500, 1000, NULL, 25000, 20000, 'Kontrakt wymaga reakcji', '2024-01-20T09:00:00Z', 'user-admin')
                """
            )
            connection.commit()

    def test_snapshot_with_plan_and_forecast_derives_margin_percent_and_variance(self) -> None:
        snapshot = self.service.get_contract_snapshot("c-plan", self.current_user)

        self.assertEqual(snapshot["metrics"]["margin"], 20000.0)
        self.assertEqual(snapshot["actual"]["margin_percent"], 50.0)
        self.assertTrue(snapshot["plan"]["is_configured"])
        self.assertEqual(snapshot["plan"]["revenue_total"], 100000.0)
        self.assertEqual(snapshot["plan"]["total_cost"], 55000.0)
        self.assertEqual(snapshot["plan"]["margin"], 45000.0)
        self.assertEqual(snapshot["plan"]["margin_percent"], 45.0)
        self.assertTrue(snapshot["forecast"]["is_configured"])
        self.assertEqual(snapshot["forecast"]["total_cost"], 62000.0)
        self.assertEqual(snapshot["forecast"]["margin"], 38000.0)
        self.assertEqual(snapshot["forecast"]["margin_percent"], 38.0)
        self.assertEqual(snapshot["variance"]["status"], "on_track")
        self.assertEqual(snapshot["health"]["level"], "good")

    def test_snapshot_without_data_reports_missing_plan_and_forecast(self) -> None:
        snapshot = self.service.get_contract_snapshot("c-empty", self.current_user)
        alert_codes = {alert["code"] for alert in snapshot["alerts"]}

        self.assertFalse(snapshot["activity"]["has_data"])
        self.assertIsNone(snapshot["actual"]["margin_percent"])
        self.assertIn("missing-plan", alert_codes)
        self.assertIn("missing-forecast", alert_codes)
        self.assertEqual(snapshot["health"]["level"], "attention")
        self.assertEqual(snapshot["monthly_breakdown"], [])

    def test_snapshot_for_risk_contract_is_critical_and_stale(self) -> None:
        snapshot = self.service.get_contract_snapshot("c-risk", self.current_user)
        alert_codes = {alert["code"] for alert in snapshot["alerts"]}

        self.assertEqual(snapshot["metrics"]["margin"], -2400.0)
        self.assertEqual(snapshot["health"]["level"], "critical")
        self.assertIn("actual-negative-margin", alert_codes)
        self.assertIn("forecast-negative-margin", alert_codes)
        self.assertIn("cost-over-plan", alert_codes)
        self.assertIn("contract-overdue", alert_codes)
        self.assertIn("stale-financial-data", alert_codes)
        self.assertIn("stale-operational-data", alert_codes)
        self.assertGreater(snapshot["freshness"]["days_since_financial_activity"], 30)
        self.assertGreater(snapshot["freshness"]["days_since_operational_activity"], 21)

    def test_archived_contract_does_not_raise_missing_plan_or_forecast_alerts(self) -> None:
        snapshot = self.service.get_contract_snapshot("c-archived", self.current_user)
        alert_codes = {alert["code"] for alert in snapshot["alerts"]}

        self.assertNotIn("missing-plan", alert_codes)
        self.assertNotIn("missing-forecast", alert_codes)
        self.assertEqual(snapshot["health"]["level"], "good")

    def test_update_contract_control_returns_snapshot_with_manual_values(self) -> None:
        snapshot = self.service.update_contract_control(
            "c-empty",
            {
                "planned_invoice_cost_total": 12000,
                "planned_labor_cost_total": 9000,
                "forecast_invoice_cost_total": 13000,
                "forecast_labor_cost_total": 11000,
                "note": "Nowa kontrola kosztowa",
            },
            self.current_user,
        )

        self.assertEqual(snapshot["control"]["planned_invoice_cost_total"], 12000.0)
        self.assertEqual(snapshot["control"]["forecast_labor_cost_total"], 11000.0)
        self.assertTrue(snapshot["plan"]["is_configured"])
        self.assertTrue(snapshot["forecast"]["is_configured"])
        self.assertEqual(snapshot["plan"]["margin"], 59000.0)
        self.assertEqual(snapshot["forecast"]["margin"], 56000.0)
        self.assertEqual(snapshot["health"]["level"], "good")


if __name__ == "__main__":
    unittest.main()
