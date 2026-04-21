# Clode backend

Backend odpowiada za model `frontend -> API -> SQL` z warstwa:

- `api routes`
- `services`
- `repositories`

Aktualny stan nie opiera juz krytycznych domen runtime na generycznym `store_documents` jako source of truth. `employees`, `settings`, `workwear`, `planning`, `vacations` i `work_cards` sa bootstrapowane z legacy store tylko jawnie przy starcie albo migracji, a biezacy runtime czyta i zapisuje do docelowych tabel / repozytoriow domenowych.

## Uruchomienie lokalne

Z katalogu repozytorium:

```powershell
python .\backend\run_server.py
```

albo:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

Domyslne adresy:

- `http://127.0.0.1:8787`
- `http://127.0.0.1:8787/api/health`

## Konfiguracja

Lokalny development:

- `CLODE_DATABASE_URL` moze wskazywac na lokalne SQLite
- brak `CLODE_SESSION_SECRET` przechodzi na jawny dev-secret

Production / preview runtime:

- `DATABASE_URL` albo `CLODE_DATABASE_URL` jest wymagane
- `CLODE_SESSION_SECRET` jest wymagane
- brak tych zmiennych konczy start bledem zamiast fallbacku do slabszego trybu

Przykladowe zmienne sa w [backend/.env.example](/C:/Users/kubaz/Documents/Codex/clode/backend/.env.example).

## Legacy bootstrap

Legacy snapshoty moga byc dalej wykorzystane do pierwszego bootstrapu demo lub naprawy danych:

- `backend/seed/clode-demo.db` - opcjonalny seed demo dla swiezego runtime
- `store_documents` - tylko jako zrodlo importu / migracji, nie jako glowny runtime persistence dla krytycznych domen

## Testy

Backendowe quality gates:

```powershell
python -m pytest -q -rs
```

Najwazniejsze pokryte obszary:

- auth / RBAC / permissions
- session lifecycle i uniewaznianie po zmianie hasla
- fail-fast config dla production
- brak write side effects w read pathach
- atomowosc lifecycle kontraktow
- walidacja krytycznych payloadow
