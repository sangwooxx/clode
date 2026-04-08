# Architecture

## Overview

Clode MVP is a local-first operational system with an ongoing transition from legacy frontend state to backend-first domain logic.

Current architecture:

```text
Frontend views (app/)
    -> frontend data clients (frontend/src/data)
        -> backend HTTP API
            -> services
                -> repositories
                    -> SQLite
```

## Core domains

### Contracts
- backend source of truth,
- stable `contract_id`,
- active vs archived lifecycle,
- shared operational registry for dependent modules.

### Invoices
- SQL-backed invoice records,
- logic based on `contract_id`,
- `unassigned` supported through `NULL contract_id`,
- filters and aggregates exposed through API.

### Time tracking
- currently in transition,
- operational contract list aligned with backend active contracts,
- Stage 6 will move the full `time_entries` model and CRUD to backend-first.

### Employees
- present in demo data and backend,
- full backend-first hardening remains part of future roadmap.

## Design principles

- backend first,
- stable identifiers instead of names,
- historical data preserved,
- archived entities excluded from new operational input,
- module-to-module consistency is mandatory.

## Data integrity rules

- `contract_id` is the business key for cross-module logic,
- missing relation should become `unassigned`, not guessed,
- archived contracts may stay in history but must disappear from new-entry selectors,
- demo data must remain isolated from real business records.
