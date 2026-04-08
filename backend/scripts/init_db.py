from pathlib import Path
import sys


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from agent_backend.config import load_settings  # noqa: E402
from agent_backend.db.bootstrap import ensure_database  # noqa: E402


if __name__ == "__main__":
    settings = load_settings()
    ensure_database(settings)
    print(f"Database initialized at {settings.database_url}")
