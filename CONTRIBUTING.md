# Contributing

## Working model

This project is developed stage by stage with explicit delivery gates:
- Dev implements changes,
- QA validates the stage,
- no stage is closed without QA PASS.

## Branching

Recommended branch naming:
- `main` for the stable line
- `codex/<short-topic>` for implementation work

Examples:
- `codex/stage-6-time-entries`
- `codex/ui-polish-dashboard`

## Commit style

Prefer clear, scoped commit messages, for example:
- `feat: add backend time entry CRUD`
- `fix: remove contract name fallback in hours module`
- `docs: add MVP roadmap and QA process`

## Pull request expectations

Each PR should include:
- business intent,
- changed modules,
- QA scope,
- risks,
- screenshots for UI changes when relevant.

## Quality rules

- Backend is the source of truth for operational data.
- Do not reintroduce business logic based on display names where stable IDs exist.
- Keep demo data safe and non-production.
- Avoid hidden local-only behavior.
- Treat regressions between modules as blocking.

## Before requesting QA

Confirm at minimum:
- runtime starts correctly,
- main user flow works,
- no known blocker is left undocumented,
- affected documentation is updated.
