# Demo Handoff

## Purpose

This repository can be handed off as a demo-safe operational MVP with `frontend/` as the primary frontend.

## Supported local runtime

- Primary frontend: `http://127.0.0.1:3100/login`
- Backend: `http://127.0.0.1:8787`
- Primary frontend: `http://127.0.0.1:3100/login`

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
- frontend runtime is single-source and Next.js-based
- final backend-first hardening and security cleanup are still planned

## What should be included in the handoff package

- repository link
- supported startup steps
- demo credentials
- MVP scope
- known limitations
- latest QA result
- note that `frontend/` is the only product frontend in the repository
