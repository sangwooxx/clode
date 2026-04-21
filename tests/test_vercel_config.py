from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.shared_contracts import CONTRACTS_DIR, load_shared_contract  # noqa: E402


class VercelConfigTestCase(unittest.TestCase):
    def test_backend_function_keeps_shared_contracts_in_bundle(self) -> None:
        config = json.loads((PROJECT_DIR / "vercel.json").read_text(encoding="utf-8"))
        api_function = config["functions"]["api/index.py"]
        excluded = str(api_function.get("excludeFiles") or "")

        self.assertNotIn("shared/**", excluded)

    def test_shared_contracts_directory_resolves_to_real_files(self) -> None:
        self.assertTrue((CONTRACTS_DIR / "employee.schema.json").exists())
        self.assertIn("type", load_shared_contract("employee"))


if __name__ == "__main__":
    unittest.main()
