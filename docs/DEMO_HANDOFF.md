# Demo Handoff

## Purpose

This repository can be handed off as a demo-safe operational MVP with `frontend-next` as the primary frontend.

## Supported local runtime

- Primary frontend: `http://127.0.0.1:3100/login`
- Backend: `http://127.0.0.1:8787`
- Optional legacy fallback: `http://127.0.0.1:8082/app/index.html`

## Demo data profile

- demo contracts only
- demo employees only
- demo invoices only
- controlled demo months only
- no active business data

## Handoff checklist

Before sending the project to an external reviewer, confirm:
- supported start scripts work
- demo login is documented
- data is demo-only
- operational modules are consistent end-to-end
- known limitations are written down
- latest QA status is attached

## Known current limitations

- several operational domains are still store-backed under the backend/runtime layer
- legacy frontend is still present as a rollback fallback
- final backend-first hardening and security cleanup are still planned

## What should be included in the handoff package

- repository link
- supported startup steps
- demo credentials
- MVP scope
- known limitations
- latest QA result
- note that `frontend-next` is the primary frontend and `app/` is fallback only
