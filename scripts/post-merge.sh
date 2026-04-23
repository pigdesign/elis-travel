#!/bin/bash
set -e
pnpm install --frozen-lockfile

if [ -n "$DATABASE_URL" ]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE IF EXISTS excursion_bookings ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE IF EXISTS excursion_bookings ADD COLUMN IF NOT EXISTS phone text;
SQL
fi

pnpm --filter db push
