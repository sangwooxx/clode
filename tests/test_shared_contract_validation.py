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


if __name__ == "__main__":
    unittest.main()
