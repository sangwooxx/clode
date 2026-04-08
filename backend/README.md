# Backend skeleton

To jest etap przejściowy między frontendem opartym o `localStorage` a architekturą:

`frontend -> API -> SQL`

Założenia:
- serwer jest uruchamialny bez zewnętrznych zależności,
- warstwa API obsługuje przejściowe `store_documents`,
- baza lokalna działa na SQLite,
- docelowy model danych jest przygotowany pod relacyjną bazę SQL i dalsze przejście na PostgreSQL.

## Uruchomienie

```powershell
C:\Users\kubaz\AppData\Local\Programs\Python\Python312\python.exe backend\run_server.py
```

Serwer domyślnie startuje na:

- `http://127.0.0.1:8787`
- health: `http://127.0.0.1:8787/api/health`

## Co jest gotowe

- konfiguracja środowiska,
- bootstrap bazy,
- migracja SQL,
- przejściowe endpointy `/api/v1/stores/*`,
- modele domenowe,
- import snapshotu wyeksportowanego z `localStorage`.
