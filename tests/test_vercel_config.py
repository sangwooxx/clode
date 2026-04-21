from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parent.parent
BACKEND_SRC = PROJECT_DIR / "backend" / "src"

if str(BACKEND_SRC) not in sys.path:
    sys.path.insert(0, str(BACKEND_SRC))

from clode_backend.api.cors import resolve_cors_origin  # noqa: E402
from clode_backend.config import load_settings  # noqa: E402
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

    def test_vercel_config_does_not_rewrite_all_pages_to_legacy_frontend(self) -> None:
        config = json.loads((PROJECT_DIR / "vercel.json").read_text(encoding="utf-8"))
        routes = config.get("routes") or []

        legacy_rewrites = [
            route
            for route in routes
            if isinstance(route, dict)
            and isinstance(route.get("dest"), str)
            and "clode-web.vercel.app" in route["dest"]
        ]

        self.assertEqual(legacy_rewrites, [])

    def test_default_allowed_origins_are_local_only(self) -> None:
        previous_allowed_origins = os.environ.pop("CLODE_ALLOWED_ORIGINS", None)
        previous_vercel = os.environ.pop("VERCEL", None)
        previous_vercel_env = os.environ.pop("VERCEL_ENV", None)
        previous_node_env = os.environ.pop("NODE_ENV", None)
        try:
            settings = load_settings()
            self.assertNotIn("null", settings.allowed_origins)
            self.assertFalse(any(origin.endswith(".vercel.app") for origin in settings.allowed_origins))
        finally:
            if previous_allowed_origins is not None:
                os.environ["CLODE_ALLOWED_ORIGINS"] = previous_allowed_origins
            if previous_vercel is not None:
                os.environ["VERCEL"] = previous_vercel
            if previous_vercel_env is not None:
                os.environ["VERCEL_ENV"] = previous_vercel_env
            if previous_node_env is not None:
                os.environ["NODE_ENV"] = previous_node_env

    def test_production_settings_without_session_secret_fall_back_to_stateful_sessions(self) -> None:
        previous_session_secret = os.environ.pop("CLODE_SESSION_SECRET", None)
        previous_vercel = os.environ.get("VERCEL")
        previous_node_env = os.environ.get("NODE_ENV")
        os.environ["VERCEL"] = "1"
        os.environ["NODE_ENV"] = "production"
        try:
            settings = load_settings()
            self.assertEqual(settings.session_secret, "")
            self.assertFalse(settings.use_stateless_sessions)
        finally:
            if previous_vercel is None:
                os.environ.pop("VERCEL", None)
            else:
                os.environ["VERCEL"] = previous_vercel
            if previous_node_env is None:
                os.environ.pop("NODE_ENV", None)
            else:
                os.environ["NODE_ENV"] = previous_node_env
            if previous_session_secret is not None:
                os.environ["CLODE_SESSION_SECRET"] = previous_session_secret

    def test_cors_rejects_unconfigured_cross_origin_vercel_requests(self) -> None:
        previous_allowed_origins = os.environ.get("CLODE_ALLOWED_ORIGINS")
        os.environ["CLODE_ALLOWED_ORIGINS"] = "https://app.example.com"
        try:
            settings = load_settings()
            allowed_origin = resolve_cors_origin(
                settings,
                request_origin="https://preview-random.vercel.app",
                request_host="api.example.com",
            )
            self.assertIsNone(allowed_origin)
        finally:
            if previous_allowed_origins is None:
                os.environ.pop("CLODE_ALLOWED_ORIGINS", None)
            else:
                os.environ["CLODE_ALLOWED_ORIGINS"] = previous_allowed_origins


if __name__ == "__main__":
    unittest.main()
