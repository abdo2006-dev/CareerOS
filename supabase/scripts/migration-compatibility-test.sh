#!/usr/bin/env bash
set -euo pipefail

# Exercise the actual supported CLI path: reset through Phase 0, insert
# synthetic Phase 0 data, then apply pending local migrations.
supabase db reset --local --version 20260726145144 --no-seed
supabase db query --local --file supabase/fixtures/migration/phase0_fixture.sql
supabase migration up --local
supabase db query --local --file supabase/fixtures/migration/assert_phase1_migration.sql
echo 'Phase 0-to-Phase 1A migration compatibility test passed.'
