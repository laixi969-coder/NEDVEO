#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v app_password="$DB_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE nedveo_app LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', :'app_password') \gexec
GRANT CONNECT ON DATABASE nedveo TO nedveo_app;
GRANT CREATE, USAGE ON SCHEMA public TO nedveo_app;
SQL
