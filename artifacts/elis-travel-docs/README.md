# Manuale segreteria ElisTravel

Sito di documentazione interno basato su Astro Starlight.

## Sviluppo

```sh
pnpm --filter @workspace/elis-travel-docs dev
```

## Verifica e build

```sh
pnpm --filter @workspace/elis-travel-docs build
```

I contenuti si trovano in `src/content/docs`. La build di produzione viene
pubblicata dall'API server sotto `/manuale/`; in sviluppo Astro usa invece la
radice del proprio server locale.

Il sito statico non include autenticazione propria: se il manuale dovesse
contenere informazioni riservate, proteggere `/manuale/` a livello applicativo
o infrastrutturale.
