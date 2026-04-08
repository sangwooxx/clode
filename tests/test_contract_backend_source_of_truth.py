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

from agent_backend.config import load_settings  # noqa: E402
from agent_backend.db.bootstrap import ensure_database  # noqa: E402
from agent_backend.db.connection import connect  # noqa: E402
from agent_backend.repositories.contract_metrics_repository import ContractMetricsRepository  # noqa: E402
from agent_backend.repositories.contract_repository import ContractRepository  # noqa: E402
from agent_backend.services.contract_service import ContractService  # noqa: E402


class ContractBackendSourceOfTruthTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.previous_database_url = os.environ.get("AGENT_DATABASE_URL")
        self.test_db_path = PROJECT_DIR / "backend" / "var" / f"agent-test-contract-backend-{uuid4().hex}.db"
        os.environ["AGENT_DATABASE_URL"] = f"sqlite:///{self.test_db_path.as_posix()}"
        self.settings = load_settings()
        ensure_database(self.settings)
        self.repository = ContractRepository(self.settings)
        self.metrics_repository = ContractMetricsRepository(self.settings)
        self.service = ContractService(self.repository, self.metrics_repository)
        self.current_user = {"id": "user-admin", "role": "admin"}
        with connect(self.settings) as connection:
            connection.execute(
                """
                INSERT INTO users
                (id, name, username, email, password_hash, role, status, permissions_json, can_approve_vacations, is_active, created_at, updated_at, last_login_at)
                VALUES
                ('user-admin', 'Admin', 'admin', 'admin@example.com', 'hash', 'admin', 'active', '{}', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, '')
                """
            )
            connection.commit()

    def tearDown(self) -> None:
        if self.previous_database_url is None:
            os.environ.pop("AGENT_DATABASE_URL", None)
        else:
            os.environ["AGENT_DATABASE_URL"] = self.previous_database_url

    def test_create_update_and_bulk_archive_keep_backend_state_consistent(self) -> None:
        first = self.service.create_contract(
            {
                "name": "Kontrakt QA 1",
                "investor": "Inwestor A",
                "signed_date": "2026-04-01",
                "end_date": "2026-06-30",
                "contract_value": 1000,
                "status": "active",
            },
            self.current_user,
        )
        second = self.service.create_contract(
            {
                "name": "Kontrakt QA 2",
                "investor": "Inwestor B",
                "signed_date": "2026-04-02",
                "end_date": "2026-07-31",
                "contract_value": 2000,
                "status": "active",
            },
            self.current_user,
        )

        updated = self.service.update_contract(
            first["id"],
            {
                "name": "Kontrakt QA 1 po edycji",
                "investor": "Inwestor A+",
                "signed_date": "2026-04-01",
                "end_date": "2026-08-31",
                "contract_value": 1500,
                "status": "active",
            },
            self.current_user,
        )

        self.assertEqual(updated["name"], "Kontrakt QA 1 po edycji")
        active_before_archive = self.service.list_contracts(self.current_user, include_archived=False)
        self.assertEqual({item["id"] for item in active_before_archive}, {first["id"], second["id"]})

        result = self.service.bulk_archive_contracts([first["id"], second["id"]], self.current_user)
        self.assertEqual(result["archived_count"], 2)

        active_after_archive = self.service.list_contracts(self.current_user, include_archived=False)
        archived_all = self.service.list_contracts(self.current_user, include_archived=True)

        self.assertEqual(active_after_archive, [])
        self.assertEqual(
            {item["id"] for item in archived_all if item["status"] == "archived"},
            {first["id"], second["id"]},
        )


if __name__ == "__main__":
    unittest.main()
