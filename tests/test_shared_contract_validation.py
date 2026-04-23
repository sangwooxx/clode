from __future__ import annotations

import sys
import unittest
from pathlib import Path


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract  # noqa: E402


class SharedContractValidationTestCase(unittest.TestCase):
    def test_additional_properties_false_is_enforced(self) -> None:
        with self.assertRaises(ContractValidationError):
            validate_shared_contract(
                "settings_workflow",
                {
                    "vacationApprovalMode": "admin",
                    "vacationNotifications": "on",
                    "unexpected": True,
                },
            )

    def test_user_contract_accepts_derived_context_fields(self) -> None:
        payload = validate_shared_contract(
            "user",
            {
                "id": "user-1",
                "name": "Anna Test",
                "displayName": "Anna Test",
                "username": "anna.test",
                "email": "anna@example.com",
                "role": "kierownik",
                "status": "active",
                "is_active": True,
                "permissions": {
                    "employeesView": True,
                    "employeesManage": True,
                },
                "canApproveVacations": True,
                "profile": "delivery",
                "capabilities": {
                    "resources.view": True,
                    "resources.manage": True,
                    "vacations.approve": True,
                },
                "scope": {
                    "contracts": {
                        "mode": "all",
                    }
                },
            },
        )

        self.assertEqual(payload["profile"], "delivery")
        self.assertEqual(payload["scope"]["contracts"]["mode"], "all")


if __name__ == "__main__":
    unittest.main()
