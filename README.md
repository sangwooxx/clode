# Clode

Clode is now operated primarily through `frontend-next`, the Next.js App Router frontend in this repository. The legacy static frontend in `app/` remains available only as a technical fallback.

## Current runtime map

- Primary frontend: `http://127.0.0.1:3100`
- Login entrypoint: `http://127.0.0.1:3100/login`
- Backend API: `http://127.0.0.1:8787`
- Legacy fallback frontend: `http://127.0.0.1:8082/app/index.html`

## Main product scope

The operational MVP now runs in `frontend-next` and covers:
- dashboard,
- contracts,
- invoices,
- hours,
- work cards,
- employees,
- vacations,
- planning,
- settings,
- workwear.

## Local quick start

### Start the full app with the primary frontend

```powershell
Set-Location <repo-root>
powershell -ExecutionPolicy Bypass -File .\scripts\start-mvp.ps1
```

This starts:
- backend on `8787`,
- primary frontend-next on `3100`,
- the browser on `/login`.

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

Recommended cutover model:
- deploy `frontend-next` as a separate Vercel project,
- set `rootDirectory=frontend-next`,
- set `CLODE_BACKEND_ORIGIN` to the backend origin,
- keep the current repo-root deploy as backend plus legacy fallback.

See the runbook in [`docs/FRONTEND_NEXT_CUTOVER.md`](docs/FRONTEND_NEXT_CUTOVER.md).

## Repository guide

- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Project Status](docs/PROJECT_STATUS.md)
- [QA Process](docs/QA_PROCESS.md)
- [Demo Handoff](docs/DEMO_HANDOFF.md)
- [Cutover Runbook](docs/FRONTEND_NEXT_CUTOVER.md)
- [Contributing](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)
