# Cutover `frontend-next` na glowny frontend

## Status

Cutover jest wykonany.

- `frontend-next` jest glownym frontendem produktu
- lokalne skrypty startowe promuja Next jako domyslny frontend
- legacy frontend w `app/` zostaje tylko jako fallback techniczny

## Aktualny model deployu

### Frontend glowny
- osobny projekt Vercel dla `frontend-next`
- `rootDirectory=frontend-next`
- framework: Next.js
- backend origin ustawiony przez `CLODE_BACKEND_ORIGIN`

### Backend i fallback legacy
- repo-root deploy nadal utrzymuje backend API
- ten sam deploy moze dalej serwowac legacy frontend jako awaryjny fallback

## Stan repo po cutoverze

- `scripts/start-frontend.ps1` uruchamia `frontend-next`
- `scripts/start-mvp.ps1` uruchamia `frontend-next` domyslnie
- `scripts/start-frontend-legacy.ps1` zostawia jawny fallback lokalny
- README repo i README `frontend-next` wskazuja Next jako glowny frontend

## Zasada operacyjna po cutoverze

- GitHub `main` jest jedynym zrodlem prawdy dla produktu
- deployment robimy tylko z commita, ktory jest juz wypchniety na `origin/main`
- QA robimy tylko na deploymentcie zgodnym z tym commitem
- nie wdrazamy zmian z lokalnego, brudnego workspace
- podstawowa kolejnosc pracy: `commit -> push -> deploy -> QA`

## Minimalny smoke po cutoverze

Po kazdej zmianie deployowej powinny przejsc co najmniej:
- `/` -> redirect do `/login`
- `/login`
- login
- `/dashboard`
- `/contracts`
- `/invoices`
- `/hours`
- `/work-cards`
- `/employees`
- `/vacations`
- `/planning`
- `/settings`
- `/workwear`
- logout
- refresh sesji
- `/api/v1/auth/me`
- backend `/api/health`

## Rollback

1. Odpinac glowna domene od projektu `frontend-next`.
2. Przepiac domene z powrotem na repo-root deploy.
3. Sprawdzic:
   - `/app/index.html`
   - login
   - dashboard
   - contracts
   - invoices
   - hours
   - backend `/api/health`

## Co dalej po cutoverze

- utwardzenie store-backed domen backend-first
- wygaszenie legacy fallbacku, kiedy rollback nie bedzie juz potrzebny
- porzadek w repo i dokumentacji pod finalny produkt
