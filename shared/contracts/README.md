# Shared data contracts

To są wspólne kontrakty danych dla etapu przejściowego:

- frontend korzysta z nich jako referencji dla repozytoriów,
- backend używa ich jako docelowego modelu relacyjnego,
- migracja z `localStorage` mapuje snapshoty właśnie do tych encji.

Najważniejsze relacje:

- `contracts` -> `invoices`
- `contracts` -> `time_entries`
- `employees` -> `time_entries`
- `employees` -> `vacation_requests`
- `employees` -> `planning_assignments`
- `employees` -> `workwear_issues`
- `users` -> `audit_logs`
- `notifications` pozostają technicznie niezależne
