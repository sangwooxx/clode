from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.auth.rbac import (  # noqa: E402
    derive_capabilities,
    derive_profile,
    derive_scope,
    effective_permissions,
    normalize_role,
)


class RbacRoleNormalizationTestCase(unittest.TestCase):
    def test_normalize_role_handles_polish_diacritics(self) -> None:
        self.assertEqual(normalize_role("ksi\u0119gowo\u015b\u0107"), "ksiegowosc")
        self.assertEqual(normalize_role("u\u017cytkownik"), "read-only")

    def test_effective_permissions_keep_accounting_hours_access_for_polish_role(self) -> None:
        permissions = effective_permissions("ksi\u0119gowo\u015b\u0107", {})

        self.assertTrue(permissions["hoursView"])
        self.assertTrue(permissions["invoicesManage"])
        self.assertFalse(permissions["employeesView"])

    def test_effective_permissions_keep_read_only_scope_for_polish_user_role(self) -> None:
        permissions = effective_permissions("u\u017cytkownik", {})

        self.assertFalse(permissions["hoursView"])
        self.assertTrue(permissions["dashboardView"])
        self.assertTrue(permissions["contractsView"])
        self.assertTrue(permissions["invoicesView"])

    def test_derived_profile_capabilities_and_scope_stay_compatible_with_legacy_authority(self) -> None:
        self.assertEqual(derive_profile("ksi\u0119gowo\u015b\u0107"), "finance")
        self.assertEqual(derive_scope(None), {"contracts": {"mode": "all"}})

        capabilities = derive_capabilities(
            "kierownik",
            {
                "invoicesView": False,
                "invoicesManage": False,
                "employeesView": True,
                "employeesManage": True,
                "workwearView": False,
                "workwearManage": False,
                "hoursView": False,
                "hoursManage": False,
                "planningView": True,
                "planningManage": True,
                "vacationsView": True,
                "vacationsManage": False,
            },
            can_approve_vacations=True,
        )

        self.assertTrue(capabilities["resources.view"])
        self.assertTrue(capabilities["resources.manage"])
        self.assertTrue(capabilities["operations.view"])
        self.assertTrue(capabilities["operations.manage"])
        self.assertTrue(capabilities["vacations.approve"])
        self.assertFalse(capabilities["finance.view"])


if __name__ == "__main__":
    unittest.main()
