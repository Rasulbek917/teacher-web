#!/bin/sh
set -eu
python manage.py migrate --noinput
python manage.py collectstatic --noinput
if [ "${DJANGO_SEED_DEMO:-0}" = "1" ]; then
  python manage.py seed_demo
fi
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers "${WEB_CONCURRENCY:-3}" --timeout 120
