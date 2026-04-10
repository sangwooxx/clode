# Frontend data layer

Etap 2 wprowadza warstwę dostępu do danych bez przepisywania UI od zera.

Aktualny model przejściowy:

- widoki dalej są renderowane przez istniejące pliki w `app/`,
- dane przechodzą przez `window.ClodeDataAccess`,
- domyślnie źródłem jest `localStorage`,
- backend API i SQL są już gotowe do dalszego przełączania modułów w Etapie 3.

Najważniejsze pliki:

- `src/data/storage-keys.js`
- `src/data/adapters/local-storage-adapter.js`
- `src/data/adapters/api-adapter.js`
- `src/data/data-access.js`
- `src/data/migration-tools.js`

