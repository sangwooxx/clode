# Cutover `frontend-next` na glowny frontend

## Aktualny stan

- `frontend-next` jest gotowy produktowo i integracyjnie do roli glownego frontendu.
- Lokalny runtime i dokumentacja zostaly przepiete tak, aby promowac Next jako domyslny frontend.
- Legacy frontend w `app/` zostaje tylko jako fallback techniczny.

## Co jest juz wykonane lokalnie

- domyslny skrypt `scripts/start-frontend.ps1` uruchamia `frontend-next`
- domyslny skrypt `scripts/start-mvp.ps1` uruchamia `frontend-next`
- legacy zostal wydzielony do `scripts/start-frontend-legacy.ps1`
- README repo i README `frontend-next` wskazuja Next jako glowny frontend

## Docelowy model deployu

- osobny projekt Vercel dla `frontend-next`
- `rootDirectory=frontend-next`
- framework: Next.js
- env:
  - `CLODE_BACKEND_ORIGIN=https://<backend-origin>`
- obecny repo-root deploy pozostaje jako:
  - backend API
  - awaryjny legacy fallback

## Twardy blocker zdalnego cutoveru

Realny cutover domeny nie moze byc wykonany z tego srodowiska bez poprawnej autoryzacji Vercela.

Aktualny stan:
- lokalny CLI `vercel` jest zainstalowany
- zdalny dostep nie jest gotowy do uzycia
- bez waznej autoryzacji nie da sie:
  - utworzyc osobnego projektu Next
  - ustawic env w projekcie
  - wykonac preview deployu
  - przepiac glownej domeny

## Checklista wykonania po odblokowaniu Vercela

1. Zalogowac `vercel` albo przywrocic wazny token.
2. Utworzyc projekt dla `frontend-next`.
3. Ustawic `rootDirectory=frontend-next`.
4. Ustawic `CLODE_BACKEND_ORIGIN`.
5. Zrobic preview deploy.
6. Wykonac smoke:
   - `/`
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
   - `/api/v1`
7. Przepiac glowna domene na projekt Next.
8. Zostawic repo-root deploy jako fallback legacy.

## Rollback

1. Odpiac glowna domene od projektu `frontend-next`.
2. Przepiac domene z powrotem na obecny repo-root deploy.
3. Sprawdzic:
   - `/app/index.html`
   - login
   - dashboard
   - contracts
   - invoices
   - hours

## Rekomendacja

Status wykonawczy:
- lokalny cutover prep: gotowy
- zdalny cutover domeny: zablokowany na autoryzacji Vercela

Rekomendacja:
- GO WITH CONDITIONS
- warunek: przywrocic wazny dostep do Vercela i dopiero wtedy wykonac finalny cutover domeny
