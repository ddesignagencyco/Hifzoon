-- Gives every `updated_at` column a database default.
--
-- Prisma's `@updatedAt` sets the value on write through the client, so the column is
-- never actually null when Prisma inserts. But the column itself is NOT NULL with no
-- default, which means any insert that does not go through Prisma — a data migration,
-- a psql session, a future service in another language, a support script — fails with a
-- constraint violation instead of working.
--
-- The default is a safety net, not the primary mechanism: the `set_updated_at` trigger
-- added in the initial migration still maintains the value on every UPDATE.

DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.is_nullable = 'NO'
      AND c.column_default IS NULL
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN updated_at SET DEFAULT now()',
      table_name
    );
  END LOOP;
END $$;