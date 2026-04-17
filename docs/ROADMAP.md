# Product Roadmap

## Delivery principle

The project still follows strict delivery gates:
- Dev implements
- QA validates
- no PASS means no closure

## Completed

### Foundation and migration
- backend-first contracts
- backend-first invoices
- Next.js operational frontend in `frontend-next`
- migration of operational modules:
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
- front-back integration pass for the operational MVP
- cutover to `frontend-next` as the primary frontend

## Current focus

### Stage A
- backend-first hardening of store-backed operational domains
- reduction of overlay/compatibility layers where they are no longer needed

## Planned next stages

### Stage B
- security and deployment hardening
- secret hygiene
- cookie/session hardening
- cleanup of legacy deployment assumptions

### Stage C
- controlled retirement of the legacy fallback frontend
- repository cleanup after cutover
- simpler developer onboarding and runtime defaults

### Stage D
- product expansion into tender workflow integration

### Stage E
- labor cost logic and contract profitability

### Stage F
- management analytics and reporting hardening
