from __future__ import annotations

import argparse
from pathlib import Path
import sys


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agent_backend.config import load_settings  # noqa: E402
from agent_backend.db.bootstrap import ensure_database  # noqa: E402
from agent_backend.repositories.store_repository import StoreRepository  # noqa: E402
from agent_backend.repositories.user_repository import UserRepository  # noqa: E402
from agent_backend.services.user_service import UserService  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or update the first admin account.")
    parser.add_argument("--name", required=True, help="Display name")
    parser.add_argument("--username", required=True, help="Login username")
    parser.add_argument("--password", required=True, help="Plain password to hash")
    parser.add_argument("--email", default="", help="Optional email")
    args = parser.parse_args()

    settings = load_settings()
    ensure_database(settings)
    user_service = UserService(UserRepository(settings), StoreRepository(settings))
    user = user_service.create_or_update_user(
        {
            "name": args.name,
            "username": args.username,
            "password": args.password,
            "email": args.email,
            "role": "admin",
            "status": "active",
            "canApproveVacations": True,
        }
    )
    print(f"Admin user ready: {user['username']} ({user['name']})")


if __name__ == "__main__":
    main()
