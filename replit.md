# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/api-server run seed:admin` — seed initial admin user (admin@elistravel.it / admin123)
- `pnpm --filter @workspace/api-server run migrate:sessions` — create admin_sessions table in DB

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Customers CRM & RivieraTransferRMS ACL

- **DB Tables**: `customersTable`, `customerExternalLinksTable` (con `lastSyncAt`), `customerSyncEventsTable` — in `lib/db/src/schema/customers.ts`
- **Backend routes**: `artifacts/api-server/src/routes/admin/customers.ts`
  - `GET /api/admin/customers` — lista con ricerca (?q=) + stato RMS
  - `POST /api/admin/customers` — crea cliente
  - `GET /api/admin/customers/rms/search` — ricerca su RivieraTransferRMS
  - `GET /api/admin/customers/:id` — dettaglio + syncEvents
  - `PATCH /api/admin/customers/:id` — aggiorna + fire-and-forget sync se collegato
  - `POST /api/admin/customers/:id/link` — collega a profilo RMS
  - `POST /api/admin/customers/:id/sync` — sync manuale (fire-and-forget)
- **ACL service**: `artifacts/api-server/src/services/riviera-integration.service.ts`
  - Headers: `X-Api-Key: RIVIERA_API_KEY`, `X-Base-URL: RIVIERA_RMS_BASE_URL`
  - `searchCustomers(q)` → GET search on RMS
  - `syncCustomerToRms(customer, lastUpdatedAt)` → POST/PUT on RMS
- **Frontend**: `artifacts/elis-travel/src/pages/(admin)/customers/CustomersPage.tsx`
  - Route: `/admin/customers`
  - Sidebar voce "Clienti" (UserRound icon)
  - Ricerca locale, crea cliente (modal), panel dettaglio con collegamento RMS e timeline sync
  - Dalla ricerca RMS: "Collega" (collega cliente locale esistente) o "Importa come nuovo" (crea + collega)
- **Migration**: `pnpm --filter @workspace/api-server run migrate:last-sync-at` — aggiunge `last_sync_at` a `customer_external_links` (IF NOT EXISTS)

## Admin Auth System

- **Login**: POST /api/auth/login (email + password, bcryptjs)
- **Session**: express-session with connect-pg-simple store (table: `admin_sessions`, cookie: `elis.sid`)
- **Auth guard**: `requireAuth` middleware in `artifacts/api-server/src/middlewares/requireAuth.ts`
- **Auth context**: `artifacts/elis-travel/src/contexts/AuthContext.tsx`
- **Login page**: `/admin/login` — `artifacts/elis-travel/src/pages/(admin)/login/LoginPage.tsx`
- **Admin layout**: redirects unauthenticated users to `/admin/login` using `navigate("~/admin/login")`
- **SESSION_SECRET**: Replit Secret (required at startup)
- **Admin credentials**: admin@elistravel.it / admin123 (change after first login)

## DB Schema (lib/db/src/schema/)

- `auth.ts` — admin_users table (UUID PK, email, password_hash, name, role)
- `customers.ts` — customers table
- `excursions.ts` — excursions/gite table
- `offers.ts` — offers/pacchetti table
- `leads.ts` — leads/richieste table
- `admin_sessions` — managed by connect-pg-simple (not in Drizzle schema, created via migrate:sessions)
