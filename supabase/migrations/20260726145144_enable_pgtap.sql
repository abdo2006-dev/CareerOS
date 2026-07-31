-- pgTAP is used for the database/RLS test suite under supabase/tests/database/.
-- It is a real Postgres extension (ships in the Supabase local Postgres image),
-- not a mocking framework -- tests run against this real local instance.
create extension if not exists pgtap with schema extensions;
