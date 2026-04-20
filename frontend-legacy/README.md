# Legacy frontend data layer

This directory is not the primary product frontend anymore.

It exists only to support the legacy static fallback in `app/`. New product work should go to `frontend/`.

## What it does

- provides `window.ClodeDataAccess` for the legacy frontend
- bridges the old static UI in `app/` to local storage / API helpers
- remains available only for rollback and emergency fallback scenarios

## Maintenance rule

- keep it stable enough for fallback use
- do not add new product modules here
- do not treat it as the main application surface

## Key files

- `src/data/storage-keys.js`
- `src/data/adapters/local-storage-adapter.js`
- `src/data/adapters/api-adapter.js`
- `src/data/data-access.js`
- `src/data/migration-tools.js`
