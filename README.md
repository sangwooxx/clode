# Clode MVP

Clode MVP is a desktop-first operations system for a contract-based company. The project combines contract management, invoice handling, time tracking, planning, and reporting into one backend-first application.

This repository is prepared as a professional MVP workspace:
- demo-safe sample data only,
- local frontend + backend runtime,
- documented roadmap and QA process,
- staged delivery model with Dev and QA sign-off.

## Current scope

Implemented and stabilized:
- contract registry backed by SQL and API,
- invoice registry backed by SQL and API,
- contract identity based on `contract_id`,
- backend-first contract source of truth across contracts, invoices, and the operational contract list in time tracking,
- demo dataset for presentation and verification.

In progress:
- Stage 6: backend-first time tracking (`time_entries`) as a full system module.

## Product goals

The MVP is being built to be:
- consistent,
- predictable,
- operationally useful,
- safe for high-value project work,
- easy to verify stage by stage.

## Technology overview

- Frontend: vanilla HTML/CSS/JavaScript served locally
- Backend: Python HTTP server with SQLite
- Data model: SQL migrations + backend services + transitional frontend adapters where still required
- Demo runtime:
  - frontend: `http://127.0.0.1:8082/app/index.html`
  - backend: `http://127.0.0.1:8787`

## Quick start

### 1. Start the full MVP

```powershell
Set-Location <repo-root>
powershell -ExecutionPolicy Bypass -File .\scripts\start-mvp.ps1
```

### 2. Start only the backend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

### 3. Start only the frontend

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
```

## Vercel deployment

The repository is now prepared for a professional Vercel demo deployment:
- static frontend served directly from the repository,
- Python API exposed from `/api/index.py`,
- same-origin frontend to API communication on Vercel (`/api/v1`),
- first-run demo database bootstrapped from `backend/seed/clode-demo.db` into the serverless temp directory (on Vercel this is `/tmp/clode.db`).

### Deploy

```powershell
Set-Location <repo-root>
vercel
vercel --prod
```

### Important deployment note

The current Vercel profile is suitable for a polished demo / review environment, but it is not yet a durable production persistence model.

Reason:
- Vercel Functions use ephemeral filesystem storage,
- the app currently boots a demo SQLite copy into the serverless temp directory,
- data written during usage can be lost between cold starts or deployments.

For full production persistence, the next hardening step is moving the backend database from SQLite to a managed SQL service.

## Repository guide

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Project Status](docs/PROJECT_STATUS.md)
- [QA Process](docs/QA_PROCESS.md)
- [Demo Handoff](docs/DEMO_HANDOFF.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Demo data

The repository is prepared around random demonstration data only.

Current demo parameters:
- 10 contracts
- 50 employees
- 123 invoices
- 3 time-tracking months
- contract values between `1,500,000 PLN` and `12,000,000 PLN`

## Delivery model

This project is managed stage by stage:
- Dev implements,
- QA validates,
- no stage is closed without QA PASS,
- UI quality is verified explicitly before MVP handoff.

## MVP quality bar

The project is considered MVP-ready only when:
- modules use one backend-first source of truth,
- operational flows work end to end,
- demo handoff is stable,
- UI passes dedicated QA without layout regressions.

## Notes

- The repository supports both local MVP verification and Vercel-hosted demo deployment.
- Some older frontend adapters still exist as compatibility layers outside the active core flow.
- This repository is intentionally prepared for staged hardening and ongoing cleanup.
