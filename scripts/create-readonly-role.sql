-- Read-only role for Growth Operator Postgres MCP (DBHub).
-- Database: growth_operator (PostgreSQL 17, see docker-compose.yml)
-- App schema: public (Prisma default; see packages/db/prisma/schema.prisma)
--
-- Purpose: least-privilege SELECT-only role for the MCP connection string.
-- DBHub also has a tool-level readonly flag (TOML only), but per DBHub docs
-- you must still use a least-privilege DB role. This script creates that role.
--
-- DO NOT run automatically. Run manually once Postgres is up:
--   1. Start Postgres:  docker compose up -d postgres
--   2. Apply migrations first (so tables exist):
--        pnpm --filter=@growth-operator/db db:migrate
--   3. Run this file as a superuser (example):
--        docker exec -i growth_operator_postgres psql -U growth_operator -d growth_operator < scripts/create-readonly-role.sql
--      or:
--        psql "postgresql://growth_operator@127.0.0.1:5432/growth_operator" -f scripts/create-readonly-role.sql
--   4. Set a strong password for the role (never commit it):
--        docker exec -it growth_operator_postgres psql -U growth_operator -d growth_operator -c "\password growth_operator_readonly"
--   5. Export the read-only DSN in your shell (never hardcode it in opencode.json):
--        PowerShell: $env:DATABASE_URL_READONLY = "postgresql://growth_operator_readonly:<password>@127.0.0.1:5432/growth_operator?sslmode=disable"
--        Bash:       export DATABASE_URL_READONLY="postgresql://growth_operator_readonly:<password>@127.0.0.1:5432/growth_operator?sslmode=disable"
--
-- Idempotent where possible (uses IF NOT EXISTS / ON CONFLICT-free GRANTs).

-- 1. Create the login role (no password set here; set it manually per step 4).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'growth_operator_readonly') THEN
    CREATE ROLE growth_operator_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- 2. Allow connection and schema usage.
GRANT CONNECT ON DATABASE growth_operator TO growth_operator_readonly;
GRANT USAGE ON SCHEMA public TO growth_operator_readonly;

-- 3. SELECT-only on all existing tables, views, and sequences (sequences need USAGE+SELECT for nextval visibility in some clients; no UPDATE).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO growth_operator_readonly;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO growth_operator_readonly;

-- 4. SELECT-only by default on future tables/sequences created by the app owner.
ALTER DEFAULT PRIVILEGES FOR ROLE growth_operator IN SCHEMA public GRANT SELECT ON TABLES TO growth_operator_readonly;
ALTER DEFAULT PRIVILEGES FOR ROLE growth_operator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO growth_operator_readonly;

-- 5. Explicitly revoke all write privileges (defense in depth; GRANTs above never gave them, but revoke anyway).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM growth_operator_readonly;

-- 6. Verification queries (read-only; safe to run):
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants WHERE grantee = 'growth_operator_readonly' ORDER BY table_name, privilege_type;
-- SET ROLE growth_operator_readonly; CREATE TABLE mcp_write_test (id int); -- must fail with "permission denied"
-- RESET ROLE;
