# Clode

Clode is an operational ERP-style system for contract businesses. The product frontend lives in `frontend/`, the Next.js App Router application in this repository.

## Product state

The operational MVP is live on `frontend/` and covers:
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

The main remaining engineering debt is no longer basic screen coverage. The current focus is stricter production hardening, deeper integration coverage, and continued reduction of transitional legacy paths.

## Repository layout

- `frontend/` - primary product frontend in Next.js
- `backend/` - API, domain services, repositories, migrations, seed data
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
- primary frontend on `3100`
- browser on `/login`

### Start only the primary frontend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
```

### Start only the backend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

## Deployment model

Current production-oriented model:
- dedicated Vercel project `clode` deploys the main frontend
- `rootDirectory=frontend`
- `CLODE_BACKEND_ORIGIN` points to the backend service when frontend and backend are not served from the same origin
- dedicated Vercel project `backend` serves the backend API and router for the main frontend

Operational details and rollback procedure live in [`docs/FRONTEND_CUTOVER.md`](docs/FRONTEND_CUTOVER.md).

## Canonical QA frontend

- the canonical frontend for browser QA is `https://clode-web.vercel.app`
- the Vercel project behind that frontend is `clode`
- `clode-iota.vercel.app` is the backend/router project and is not the direct QA frontend target
- `clode-next.vercel.app` is a historical alias and should not be used for QA

Current PDF exports that are expected to be verified on the canonical QA frontend:
- employees
- workwear
- work cards
- hours

## Source Of Truth And Deploy Discipline

- `origin/main` is the only source of truth for the product state
- deploy only from a committed state that is already pushed to `origin/main`
- QA only against a deployment that is known to come from that pushed commit
- do not deploy from an uncommitted or undocumented local workspace
- preferred order is: commit -> push -> deploy -> QA

## Current priorities

- backend / frontend permission consistency and regression coverage
- production-safe deploy discipline and explicit environment configuration
- further reduction of remaining transitional legacy adapters
- product expansion toward tender workflow integration

## Repository guide

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Project Status](docs/PROJECT_STATUS.md)
- [QA Process](docs/QA_PROCESS.md)
- [PDF QA Frontend](docs/PDF_QA_FRONTEND.md)
- [Demo Handoff](docs/DEMO_HANDOFF.md)
- [Cutover Runbook](docs/FRONTEND_CUTOVER.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
