# Cutover `frontend` na glowny frontend

## Status

Cutover jest wykonany.

- `frontend` jest glownym frontendem produktu
- lokalne skrypty startowe promuja Next jako domyslny frontend

## Aktualny model deployu

### Frontend glowny
- osobny projekt Vercel `clode-next` dla glownego frontendu
- `rootDirectory=frontend`
- framework: Next.js
- backend origin ustawiony przez `CLODE_BACKEND_ORIGIN`

### Backend i routing
- repo-root deploy nadal utrzymuje backend API
- ten sam deploy sluzy jako backend/router dla glownego frontendu

## Stan repo po cutoverze

- `scripts/start-frontend.ps1` uruchamia `frontend`
- `scripts/start-mvp.ps1` uruchamia `frontend` domyslnie
- README repo i README `frontend` wskazuja Next jako glowny frontend

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

1. Odpinac glowna domene od projektu `clode-next`.
2. Przepiac domene z powrotem na repo-root deploy.
3. Sprawdzic:
   - `/login`
   - login
   - dashboard
   - contracts
   - invoices
   - hours
   - backend `/api/health`

## Co dalej po cutoverze

- utwardzenie store-backed domen backend-first
- porzadek w repo i dokumentacji pod finalny produkt
