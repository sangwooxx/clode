from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = CURRENT_DIR.parent
SRC_DIR = PROJECT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from clode_backend.app import create_runtime_context, run_runtime_maintenance  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run explicit legacy bootstrap and repair operations outside normal runtime startup."
    )
    parser.add_argument("--bootstrap-admin", action="store_true", help="Create bootstrap admin from env when database is empty.")
    parser.add_argument("--legacy-employees", action="store_true", help="Import employees from legacy store_documents when SQL table is empty.")
    parser.add_argument("--legacy-domains", action="store_true", help="Import vacations/planning/work-cards from legacy store_documents when runtime tables are empty.")
    parser.add_argument("--legacy-settings", action="store_true", help="Import workflow and audit log from legacy store_documents when SQL targets are empty.")
    parser.add_argument("--legacy-workwear", action="store_true", help="Import workwear catalog/issues from legacy store_documents when SQL tables are empty.")
    parser.add_argument("--repair-time-entries", action="store_true", help="Run explicit time-entry legacy repair routines.")
    parser.add_argument("--purge-imported-legacy", action="store_true", help="Delete imported legacy store rows only after a successful explicit import.")
    parser.add_argument("--all", action="store_true", help="Run every explicit bootstrap and repair operation.")
    args = parser.parse_args()

    run_all = args.all
    runtime = create_runtime_context()
    report = run_runtime_maintenance(
        runtime["services"],
        bootstrap_admin=run_all or args.bootstrap_admin,
        import_legacy_employees=run_all or args.legacy_employees,
        import_legacy_domains=run_all or args.legacy_domains,
        import_legacy_settings=run_all or args.legacy_settings,
        import_legacy_workwear=run_all or args.legacy_workwear,
        repair_time_entries=run_all or args.repair_time_entries,
        purge_imported_legacy=args.purge_imported_legacy,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
