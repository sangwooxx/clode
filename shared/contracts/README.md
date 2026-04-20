# Shared data contracts

Te schematy nie sa juz tylko dokumentacja. Dla backend-owned DTO:

- `contract.schema.json`
- `employee.schema.json`
- `invoice.schema.json`
- `user.schema.json`

backend waliduje payloady runtime przed zapisem i testy pilnuja zgodnosci z tymi kontraktami.

Dla przejsciowych domen store-backed, ale juz za dedykowanymi endpointami:

- `settings-workflow.schema.json`
- `settings-audit-log.schema.json`
- `vacation-store.schema.json`
- `planning-store.schema.json`
- `work-card-store.schema.json`
- `workwear-catalog.schema.json`
- `workwear-issues.schema.json`

backend waliduje je na granicy transportu przed zapisem do storage.

Zasady:

- schemat opisuje transport/publiczny DTO, nie wewnetrzny model widoku frontendowego,
- zmiana pola w backend-owned API wymaga aktualizacji odpowiedniego schematu,
- store-backed wrappery pozostaja przejsciowe, ale nie sa juz zapisywane przez generyczne `/stores/*` w krytycznych modulach frontu,
- zmiana pola w dedykowanym endpointcie domeny przejsciowej wymaga aktualizacji odpowiedniego schematu wrappera.

Najwazniejsze relacje:

- `contracts` -> `invoices`
- `contracts` -> `time_entries`
- `employees` -> `time_entries`
- `employees` -> `vacation_requests`
- `employees` -> `planning_assignments`
- `employees` -> `workwear_issues`
- `users` -> `audit_logs`
