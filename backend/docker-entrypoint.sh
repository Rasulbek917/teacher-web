#!/bin/sh
set -e

# VPS'da startda migratsiya + seed bajariladi. Vercel (serverless/container) uchun
# har cold start'da ishlamasligi uchun RUN_MIGRATIONS_ON_START=false beriladi.
if [ "${RUN_MIGRATIONS_ON_START:-true}" = "true" ]; then
  echo ">> Waiting for database & running migrations..."
  npx prisma migrate deploy

  echo ">> Seeding Super Admin (idempotent)..."
  npx prisma db seed || echo "Seed skipped/failed (non fatal)."
else
  echo ">> RUN_MIGRATIONS_ON_START=false — migratsiya/seed o'tkazib yuborildi."
fi

echo ">> Starting backend..."
exec node dist/src/main.js
