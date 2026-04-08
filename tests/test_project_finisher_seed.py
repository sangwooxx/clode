import datetime as dt
import json
import pathlib
import re
import unittest
from collections import defaultdict


ROOT = pathlib.Path(__file__).resolve().parents[1]
TODAY = dt.date(2026, 3, 31)


def extract_json_object(path: pathlib.Path, prefix_pattern: str, suffix_pattern: str) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    match = re.search(prefix_pattern + r"(\{.*?\})" + suffix_pattern, text, re.S)
    if not match:
        raise AssertionError(f"Cannot extract JSON object from {path}")
    return json.loads(match.group(1))


def load_project_seed() -> dict:
    return extract_json_object(
        ROOT / "data" / "project-finisher-seed.js",
        r"const PROJECT_FINISHER_SEED = ",
        r";\s*window\.PROJECT_FINISHER_SEED",
    )


def load_hours_seed() -> dict:
    return extract_json_object(
        ROOT / "data" / "hours-form-seed.js",
        r"window\.HOURS_FORM_SEED\s*=\s*",
        r";\s*$",
    )


def invoice_status(entry: dict) -> str:
    if entry.get("payment_date"):
        return "paid"
    due_date = entry.get("due_date") or ""
    if not due_date:
        return "open"
    due = dt.date.fromisoformat(due_date)
    return "overdue" if due < TODAY else "not_due"


def invoice_warnings(entry: dict, all_entries: list[dict], contracts_by_name: dict[str, dict]) -> list[str]:
    warnings: list[str] = []
    contract_name = (entry.get("contract_name") or "").strip()
    contract = contracts_by_name.get(contract_name)
    document_number = (entry.get("document_number") or "").strip()
    duplicate = any(
        item.get("id") != entry.get("id")
        and (item.get("document_number") or "").strip() == document_number
        and (item.get("contract_name") or "").strip() == contract_name
        for item in all_entries
    )

    net_amount = float(entry.get("net_amount") or 0)
    if not contract_name:
        warnings.append("Brak przypisania do kontraktu")
    if duplicate:
        warnings.append("Duplikat numeru faktury")
    if net_amount <= 0:
        warnings.append("Kwota netto wymaga weryfikacji")
    if contract and float(contract.get("contract_value") or 0) > 0 and net_amount > float(contract["contract_value"]):
        warnings.append("Kwota przekracza wartość kontraktu")
    elif not contract and net_amount >= 100000:
        warnings.append("Nietypowo wysoka kwota")

    issue_date = entry.get("issue_date") or ""
    due_date = entry.get("due_date") or ""
    payment_date = entry.get("payment_date") or ""
    if issue_date and due_date and due_date < issue_date:
        warnings.append("Termin płatności przed datą dokumentu")
    if issue_date and payment_date and payment_date < issue_date:
        warnings.append("Płatność przed datą dokumentu")
    return warnings


def compute_hours_costs(project_seed: dict, hours_seed: dict) -> tuple[dict[str, float], dict[str, float]]:
    finance_overrides = project_seed["hours_finance_overrides"]
    contract_hours: defaultdict[str, float] = defaultdict(float)
    contract_costs: defaultdict[str, float] = defaultdict(float)

    for month in hours_seed["months"]:
        month_key = month["month_key"]
        if month_key not in finance_overrides:
            continue

        active_contracts = set(month.get("investments") or [])
        total_hours = 0.0
        month_hours: defaultdict[str, float] = defaultdict(float)

        for row in month.get("rows", []):
            for contract_name, hours in (row.get("project_hours") or {}).items():
                if active_contracts and contract_name not in active_contracts:
                    continue
                numeric_hours = float(hours or 0)
                if not numeric_hours:
                    continue
                month_hours[contract_name] += numeric_hours
                total_hours += numeric_hours

        employer_cost = sum(float(value) for value in finance_overrides[month_key].values())
        rh_value = employer_cost / total_hours if total_hours else 0.0

        for contract_name, hours in month_hours.items():
            contract_hours[contract_name] += hours
            contract_costs[contract_name] += hours * rh_value

    return dict(contract_hours), dict(contract_costs)


class ProjectFinisherSeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.project_seed = load_project_seed()
        cls.hours_seed = load_hours_seed()
        cls.contracts_by_name = {item["name"]: item for item in cls.project_seed["contracts"]}
        cls.hours_by_contract, cls.labor_cost_by_contract = compute_hours_costs(cls.project_seed, cls.hours_seed)

    def test_seed_contains_minimum_business_dataset(self) -> None:
        self.assertGreaterEqual(len(self.project_seed["contracts"]), 10)
        self.assertGreaterEqual(len(self.project_seed["employees"]), 10)
        self.assertGreaterEqual(len(self.project_seed["invoices"]), 20)
        self.assertGreaterEqual(len(self.project_seed["workwear_issues"]), 4)
        statuses = {request["status"] for request in self.project_seed["vacation_requests"]}
        self.assertEqual(statuses, {"approved", "pending", "rejected"})

    def test_hours_finance_overrides_cover_expected_months(self) -> None:
        self.assertEqual(set(self.project_seed["hours_finance_overrides"]), {"2026-01", "2026-02"})
        january_total = sum(self.project_seed["hours_finance_overrides"]["2026-01"].values())
        february_total = sum(self.project_seed["hours_finance_overrides"]["2026-02"].values())
        self.assertAlmostEqual(january_total, 369547.72, places=2)
        self.assertAlmostEqual(february_total, 388259.37, places=2)

    def test_seed_builds_profitability_mix(self) -> None:
        invoice_sales: defaultdict[str, float] = defaultdict(float)
        invoice_costs: defaultdict[str, float] = defaultdict(float)
        for invoice in self.project_seed["invoices"]:
            contract_name = invoice["contract_name"]
            if not contract_name:
                continue
            if invoice["type"] == "sales":
                invoice_sales[contract_name] += float(invoice["net_amount"])
            else:
                invoice_costs[contract_name] += float(invoice["net_amount"])

        margins: dict[str, float] = {}
        for contract_name in self.contracts_by_name:
            total_cost = invoice_costs[contract_name] + self.labor_cost_by_contract.get(contract_name, 0.0)
            margins[contract_name] = invoice_sales[contract_name] - total_cost

        positive = [name for name, margin in margins.items() if margin > 0]
        negative = [name for name, margin in margins.items() if margin < 0]
        self.assertGreaterEqual(len(positive), 5)
        self.assertGreaterEqual(len(negative), 4)
        self.assertLess(abs(margins["MAGAZYN"]), 1000)
        self.assertLess(margins["BIURO"], 0)
        self.assertEqual(invoice_sales["BIURO"], 0)
        self.assertGreater(margins["WROCANKA"], 100000)

    def test_invoice_statuses_and_warnings_cover_edge_cases(self) -> None:
        statuses = {invoice_status(invoice) for invoice in self.project_seed["invoices"]}
        self.assertTrue({"paid", "overdue", "not_due", "open"}.issubset(statuses))

        warning_pool = {
            warning
            for invoice in self.project_seed["invoices"]
            for warning in invoice_warnings(invoice, self.project_seed["invoices"], self.contracts_by_name)
        }
        self.assertIn("Brak przypisania do kontraktu", warning_pool)
        self.assertIn("Duplikat numeru faktury", warning_pool)
        self.assertIn("Kwota przekracza wartość kontraktu", warning_pool)
        self.assertIn("Nietypowo wysoka kwota", warning_pool)

    def test_seed_contracts_are_backed_by_hours_or_invoices(self) -> None:
        covered_contracts = set(self.hours_by_contract) | {
            invoice["contract_name"] for invoice in self.project_seed["invoices"] if invoice["contract_name"]
        }
        for contract_name in self.contracts_by_name:
            with self.subTest(contract=contract_name):
                self.assertIn(contract_name, covered_contracts)

    def test_approved_absences_collide_with_planning_for_audit(self) -> None:
        approved_requests = [request for request in self.project_seed["vacation_requests"] if request["status"] == "approved"]
        collisions = []
        for request in approved_requests:
            start_date = dt.date.fromisoformat(request["start_date"])
            end_date = dt.date.fromisoformat(request["end_date"])
            current = start_date
            while current <= end_date:
                assignment = self.project_seed["planning_assignments"].get(current.isoformat(), {}).get(request["employee_name"])
                if assignment and assignment.get("contract_name"):
                    collisions.append((request["employee_name"], current.isoformat(), assignment["contract_name"]))
                current += dt.timedelta(days=1)

        self.assertGreaterEqual(len(collisions), 2)
        self.assertIn(("Karaś Marcin", "2026-04-01", "WROCANKA"), collisions)
        self.assertIn(("Sanocki Piotr", "2026-04-01", "ZUN"), collisions)


if __name__ == "__main__":
    unittest.main()
