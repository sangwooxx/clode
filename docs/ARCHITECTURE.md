# Architecture

## Overview

Clode runs as a split frontend/backend system with a single product frontend.

```text
Primary user entry
    -> frontend (Next.js App Router)
        -> same-origin /api/v1 proxy
            -> backend HTTP API
                -> services
                    -> repositories
                        -> SQL tables and transitional store documents

Backend service / router
    -> repo-root deploy
        -> backend HTTP API
```

## Current product surface

The primary product UI lives in `frontend/` and includes:
- dashboard
- contracts
- invoices
- hours
- work cards
- employees
- vacations
- planning
- settings
- workwear

## Source-of-truth map

### Employees
- canonical source: backend `/api/v1/employees`
- persistence: SQL `employees` plus transitional overlay synchronization
- cross-module key: stable employee id / employee key, never display name alone

### Contracts
- canonical source: backend `/api/v1/contracts`
- lifecycle: active vs archived
- usage: contracts drive selectors in hours, work cards, and planning

### Invoices
- canonical source: backend invoice endpoints and SQL storage
- relation key: `contract_id`

### Time entries
- canonical source: backend `/api/v1/time-entries` and `/api/v1/time-months`
- work cards synchronize into time entries for operational consistency

### Store-backed transitional domains
- vacations: `stores/vacations`
- planning: `stores/planning`
- work cards: `stores/work_cards`
- workwear: `stores/workwear_catalog`, `stores/workwear_issues`
- settings/audit: `stores/settings`, `stores/audit_logs`

These domains are operationally integrated, but they are still not fully backend-first APIs.

## Design principles

- stable identifiers over display names
- one source of truth per business entity
- historical records preserved even when entities leave the active pool
- archived / inactive entities excluded from new operational input
- module-to-module consistency is mandatory
- fallback layers must not silently override canonical data

## Current transitional debt

- several operational domains remain store-backed
- employee persistence still uses a synchronized SQL + overlay model
- some historical records still require defensive compatibility mapping
