from __future__ import annotations

import sys
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.auth.rbac import effective_permissions, normalize_role  # noqa: E402


class RbacRoleNormalizationTestCase(unittest.TestCase):
    def test_normalize_role_handles_polish_diacritics(self) -> None:
        self.assertEqual(normalize_role("księgowość"), "ksiegowosc")
        self.assertEqual(normalize_role("użytkownik"), "read-only")

    def test_effective_permissions_keep_accounting_hours_access_for_polish_role(self) -> None:
        permissions = effective_permissions("księgowość", {})

        self.assertTrue(permissions["hoursView"])
        self.assertTrue(permissions["invoicesManage"])
        self.assertFalse(permissions["employeesView"])

    def test_effective_permissions_keep_read_only_scope_for_polish_user_role(self) -> None:
        permissions = effective_permissions("użytkownik", {})

        self.assertFalse(permissions["hoursView"])
        self.assertTrue(permissions["dashboardView"])
        self.assertTrue(permissions["contractsView"])
        self.assertTrue(permissions["invoicesView"])


if __name__ == "__main__":
    unittest.main()
