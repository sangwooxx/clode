# Clode backend

To jest etap przejsciowy miedzy frontendem opartym o `localStorage` a architektura:

`frontend -> API -> SQL`

Zalozenia:
- serwer jest uruchamialny bez zewnetrznych zaleznosci,
- warstwa API obsluguje przejsciowe `store_documents`,
- baza lokalna dziala na SQLite,
- docelowy model danych jest przygotowany pod relacyjna baze SQL i dalsze przejscie na PostgreSQL.

## Uruchomienie

Z katalogu repozytorium:

```powershell
python .\backend\run_server.py
```

albo przez skrypt:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-backend.ps1
```

Serwer domyslnie startuje na:

- `http://127.0.0.1:8787`
- health: `http://127.0.0.1:8787/api/health`

## Co jest gotowe

- konfiguracja srodowiska,
- bootstrap bazy,
- migracje SQL,
- przejsciowe endpointy `/api/v1/stores/*`,
- modele domenowe,
- import snapshotu wyeksportowanego z `localStorage`.
