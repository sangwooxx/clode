# Project Status

## Current delivery status

- operational MVP in `frontend/`: complete
- cross-module front-back integration of the operational MVP: complete
- live cutover to `frontend/` as the primary frontend: complete
- legacy frontend status: fallback only

## What is stable today

- primary frontend is `frontend/`
- contracts and invoices are backend-first
- employees, vacations, planning, work cards, workwear, settings, and hours are integrated end-to-end
- `inactive` semantics are consistent across operational modules
- workflow from settings affects vacations
- legacy frontend remains available as a technical rollback surface

## What is not yet fully mature

- store-backed operational domains still need backend-first hardening:
  - vacations
  - planning
  - work cards
  - workwear
  - settings
- employee persistence is still a synchronized SQL + overlay model, not a single physical source
- deployment/security hygiene still needs follow-up:
  - secret handling
  - cookie hardening
  - cleanup of fallback-only assets and documentation

## Current engineering priorities

1. Reduce store-backed transitional domains behind backend APIs.
2. Retire legacy fallback from active development and eventually from deployment.
3. Harden security and secret-management practices.
4. Expand toward the next product layer, including tender workflow integration.
