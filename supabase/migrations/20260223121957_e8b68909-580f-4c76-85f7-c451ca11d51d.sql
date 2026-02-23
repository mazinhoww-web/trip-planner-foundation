-- Legacy duplicate migration kept intentionally as no-op.
-- Canonical collaboration migration:
--   20260223110000_trip_members_collaboration.sql
DO $$
BEGIN
  RAISE NOTICE 'Skipping duplicate migration 20260223121957 (already superseded by 20260223110000).';
END $$;
