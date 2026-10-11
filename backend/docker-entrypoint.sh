#!/bin/sh
set -e

echo ">> Waiting for database & running migrations..."
npx prisma migrate deploy

echo ">> Seeding Super Admin (idempotent)..."
npx prisma db seed || echo "Seed skipped/failed (non fatal)."

echo ">> Starting backend..."
exec node dist/src/main.js
