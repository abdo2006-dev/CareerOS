#!/usr/bin/env bash
set -euo pipefail

# Exercise the current merged profile schema and data before applying only the
# new forward migration. This complements the Phase 0 compatibility test.
supabase db reset --local --version 20260801213000 --no-seed
supabase db query --local --file supabase/fixtures/migration/current_profile_fixture.sql
supabase migration up --local
supabase db query --local --file supabase/fixtures/migration/assert_work_experience_migration.sql
echo 'Profile-core-to-work-experience migration compatibility test passed.'
