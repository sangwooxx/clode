# Clode Next Frontend

`frontend-next` is the primary frontend of Clode. It replaces the older static frontend for normal product use and is designed to become the main deployed web entrypoint.

## What it contains

- Next.js App Router shell and auth flow
- same-origin `/api/v1/*` proxy to the backend
- operational modules:
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

## Local development

From the repo root, the default startup path is:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-frontend.ps1
```

Direct commands from this directory:

```powershell
npm install
npm run dev
```

Production-like local start:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3100
```

## Deployment

Recommended deployment:
- separate Vercel project,
- `rootDirectory=frontend-next`,
- framework detected as Next.js,
- `CLODE_BACKEND_ORIGIN` configured to the backend service.

The legacy frontend in `../app/` should remain only as an emergency fallback after cutover.
