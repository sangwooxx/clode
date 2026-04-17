# Clode

Clode is an operational ERP-style system for contract businesses. The primary product frontend is now `frontend-next`, the Next.js App Router application in this repository. The older static frontend in `app/` remains only as a technical fallback.

## Product state

The operational MVP is live on `frontend-next` and covers:
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

The main remaining engineering debt is not screen coverage. It is backend-first hardening of store-backed domains and eventual retirement of the legacy fallback.

## Repository layout

- `frontend-next/` - primary product frontend in Next.js
- `backend/` - API, domain services, repositories, migrations, seed data
- `app/` - legacy static frontend kept only for rollback/fallback
- `frontend/` - legacy data-access layer used by `app/`
- `docs/` - current architecture, roadmap, status, and release notes
- `scripts/` - local runtime entrypoints

## Local runtime

### Start the full app with the primary frontend

```powershell
Set-Location <repo-root>
powershell -ExecutionPolicy Bypass -File .\scripts\start-mvp.ps1
```

This starts:
- backend on `8787`
- primary frontend-next on `3100`
- browser on `/login`

### Start only the primary frontend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
```

### Start only the backend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

### Start the legacy fallback frontend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend-legacy.ps1
```

### Start the full app with legacy fallback instead of Next

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-mvp.ps1 -Frontend legacy
```

## Deployment model

Current production-oriented model:
- `frontend-next` is deployed as a dedicated Vercel project
- `rootDirectory=frontend-next`
- `CLODE_BACKEND_ORIGIN` points to the backend/legacy service
- repo-root deploy stays available as backend plus legacy fallback

Operational details and rollback procedure live in [`docs/FRONTEND_NEXT_CUTOVER.md`](docs/FRONTEND_NEXT_CUTOVER.md).

## Source Of Truth And Deploy Discipline

- `origin/main` is the only source of truth for the product state
- deploy only from a committed state that is already pushed to `origin/main`
- QA only against a deployment that is known to come from that pushed commit
- do not deploy from an uncommitted or undocumented local workspace
- preferred order is: commit -> push -> deploy -> QA

## Current priorities

- backend-first hardening of store-backed domains:
  - vacations
  - planning
  - work cards
  - workwear
  - settings
- security hardening of auth/session and deployment secrets
- planned retirement of the legacy fallback once rollback is no longer needed
- product expansion toward tender workflow integration

## Repository guide

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Project Status](docs/PROJECT_STATUS.md)
- [QA Process](docs/QA_PROCESS.md)
- [Demo Handoff](docs/DEMO_HANDOFF.md)
- [Cutover Runbook](docs/FRONTEND_NEXT_CUTOVER.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
