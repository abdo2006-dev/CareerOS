#!/usr/bin/env node
// Real API-path integration test: Auth -> JWT -> Supabase Data API
// (PostgREST) -> RLS -> Postgres.
//
// Unlike the frontend component tests (which mock the Supabase client for
// speed and determinism) and the pgTAP tests (which exercise RLS directly
// in Postgres), this suite drives the actual HTTP surface a real browser
// session would use: it signs real, temporary users in through the normal
// password grant endpoint and issues real REST requests with their real
// JWTs, against the running local stack.
//
// This must only ever run against a loopback Supabase URL. Cleanup for every
// temporary user is always attempted, even if an assertion fails; a cleanup
// failure fails the test command too (see the `finally` block), and cleanup
// is verified, not just attempted -- deleting a user is expected to cascade
// to their profile row (see the `on delete cascade` in the profiles
// migration), and this suite checks that it actually did.
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxx \
//   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxxxxxxxxxx \
//   node supabase/scripts/api-integration-test.mjs

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

// Freshly generated every run -- never a committed constant. Not printed.
const TEST_PASSWORD = randomBytes(18).toString('base64url');
const runId = randomUUID().slice(0, 8);

function assertLoopback(rawUrl) {
  const parsed = new URL(rawUrl);
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '::1';
  if (!isLoopback) {
    console.error(`error: refusing to run against a non-loopback host ("${parsed.hostname}"). This suite only ever targets the local stack.`);
    process.exit(1);
  }
}

async function adminCreateUser(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password: TEST_PASSWORD, email_confirm: true }),
  });
  if (!res.ok) throw new Error(`admin create user failed: HTTP ${res.status}`);
  return res.json();
}

async function adminDeleteUser(id) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`delete failed: HTTP ${res.status}`);
  }
}

async function adminGetUser(id) {
  return fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
  });
}

async function adminGetProfile(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${userId}`, {
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`admin profile lookup failed: HTTP ${res.status}`);
  return res.json();
}

async function adminGetRows(table, userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${userId}`, {
    headers: { apikey: SECRET_KEY, Authorization: `Bearer ${SECRET_KEY}` },
  });
  if (!res.ok) throw new Error(`admin ${table} lookup failed: HTTP ${res.status}`);
  return res.json();
}

async function verifyUserFullyRemoved(id) {
  const problems = [];
  const userRes = await adminGetUser(id);
  if (userRes.status !== 404) {
    problems.push(`auth user ${id} still retrievable after deletion (HTTP ${userRes.status}, expected 404)`);
  }
  const profileRows = await adminGetProfile(id);
  if (profileRows.length !== 0) {
    problems.push(`profile row for ${id} still present after user deletion (expected cascade delete)`);
  }
  for (const table of ['education_entries', 'work_experience', 'profile_section_revisions', 'profile_section_reviews']) {
    const rows = await adminGetRows(table, id);
    if (rows.length !== 0) problems.push(`${table} rows for ${id} still present after user deletion (expected cascade delete)`);
  }
  return problems;
}

async function signIn(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: HTTP ${res.status}`);
  return res.json();
}

async function rest(token, path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

// Trusted, service-role-authenticated request -- used only to seed/tear down
// the shared opportunity-domain fixture rows this suite needs (a real
// browser session can never do this; see the "cannot forge" checks below).
async function restAsService(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: res.ok, status: res.status, data };
}

let checkCount = 0;
function check(description, condition) {
  checkCount += 1;
  assert.ok(condition, `FAILED: ${description}`);
  console.log(`  ok ${checkCount} - ${description}`);
}

async function main() {
  if (!SECRET_KEY || !PUBLISHABLE_KEY) {
    console.error('error: SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY environment variables are required.');
    process.exit(1);
  }
  assertLoopback(SUPABASE_URL);
  console.log(`Target: ${SUPABASE_URL} (loopback confirmed)\n`);

  const emailA = `it-test-a-${runId}@careeros.local`;
  const emailB = `it-test-b-${runId}@careeros.local`;
  let userA;
  let userB;
  let seededSourceId;
  let seededOpportunityId;

  try {
    // ---- setup: two temporary users via the trusted Admin API -----------
    userA = await adminCreateUser(emailA);
    userB = await adminCreateUser(emailB);

    // ---- Auth -> JWT: real password sign-in for each ---------------------
    const sessionA = await signIn(emailA);
    const sessionB = await signIn(emailB);
    const tokenA = sessionA.access_token;
    const tokenB = sessionB.access_token;
    check('user A obtained a real access token via password sign-in', typeof tokenA === 'string' && tokenA.length > 0);
    check('user B obtained a real access token via password sign-in', typeof tokenB === 'string' && tokenB.length > 0);

    // ---- JWT -> Data API -> RLS -> Postgres: owners create their own rows
    const createA = await rest(tokenA, '/profiles', {
      method: 'POST',
      body: { user_id: userA.id, headline: 'Integration test A' },
      prefer: 'return=representation',
    });
    check('user A can create their own profile via the REST API', createA.ok && createA.data[0].headline === 'Integration test A');

    const createB = await rest(tokenB, '/profiles', {
      method: 'POST',
      body: { user_id: userB.id, headline: 'Integration test B' },
      prefer: 'return=representation',
    });
    check('user B can create their own profile via the REST API', createB.ok && createB.data[0].headline === 'Integration test B');

    // ---- owner behavior ---------------------------------------------------
    const readOwnA = await rest(tokenA, `/profiles?user_id=eq.${userA.id}`, {});
    check('user A can read their own profile', readOwnA.ok && readOwnA.data.length === 1);

    const updateOwnA = await rest(tokenA, `/profiles?user_id=eq.${userA.id}`, {
      method: 'PATCH',
      body: { headline: 'Updated by A' },
      prefer: 'return=representation',
    });
    check('user A can update their own profile', updateOwnA.ok && updateOwnA.data[0].headline === 'Updated by A');

    const forgeProfileMetadata = await rest(tokenA, `/profiles?user_id=eq.${userA.id}`, {
      method: 'PATCH',
      body: { created_via: 'migration' },
      prefer: 'return=representation',
    });
    check('user A cannot forge profile provenance through the REST API', !forgeProfileMetadata.ok && forgeProfileMetadata.status === 403);

    const deleteOwnProfile = await rest(tokenA, `/profiles?user_id=eq.${userA.id}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    check('user A cannot delete their own root profile through the browser role', !deleteOwnProfile.ok && deleteOwnProfile.status === 403);

    // ---- experience CRUD, validation, and review freshness -----------------
    const reviewEmptyExperience = await rest(tokenA, '/rpc/review_profile_section', {
      method: 'POST', body: { requested_section_key: 'experience' },
    });
    const emptyExperienceState = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    const emptyExperienceReview = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=reviewed_content_revision');
    check('user A can review an intentionally empty experience section', reviewEmptyExperience.ok && emptyExperienceState.ok && emptyExperienceReview.ok && emptyExperienceState.data[0].content_revision === 0 && emptyExperienceReview.data[0].reviewed_content_revision === 0);

    const createExperienceA = await rest(tokenA, '/work_experience', {
      method: 'POST',
      body: {
        user_id: userA.id,
        experience_kind: 'research',
        organization: 'Synthetic Integration Lab',
        role: 'Research Assistant',
        start_year: 2025,
        start_month: 10,
        is_current: true,
        description: 'Synthetic public-safe experience fixture.',
      },
      prefer: 'return=representation',
    });
    const experienceA = createExperienceA.data?.[0];
    check('user A can create experience through the REST API', createExperienceA.ok && experienceA?.experience_kind === 'research' && experienceA?.start_month === 10);

    const experienceReviewAfterCreate = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=reviewed_content_revision');
    const experienceRevisionAfterCreate = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    check('experience creation makes an empty-section review stale', experienceReviewAfterCreate.ok && experienceRevisionAfterCreate.ok && experienceReviewAfterCreate.data[0].reviewed_content_revision !== experienceRevisionAfterCreate.data[0].content_revision);

    const invalidExperienceKind = await rest(tokenA, '/work_experience', {
      method: 'POST',
      body: { user_id: userA.id, experience_kind: 'invalid', organization: 'Synthetic', role: 'Role', start_year: 2025 },
    });
    check('invalid experience kind is rejected through the REST API', !invalidExperienceKind.ok && invalidExperienceKind.status >= 400);

    const invalidExperienceDates = await rest(tokenA, '/work_experience', {
      method: 'POST',
      body: { user_id: userA.id, experience_kind: 'employment', organization: 'Synthetic', role: 'Role', start_year: 2025, start_month: 7, end_year: 2025, end_month: 6 },
    });
    check('invalid experience date ordering is rejected through the REST API', !invalidExperienceDates.ok && invalidExperienceDates.status >= 400);

    const currentWithEndPeriod = await rest(tokenA, '/work_experience', {
      method: 'POST',
      body: { user_id: userA.id, experience_kind: 'employment', organization: 'Synthetic', role: 'Role', start_year: 2025, end_year: 2026, is_current: true },
    });
    check('current experience with an end period is rejected through the REST API', !currentWithEndPeriod.ok && currentWithEndPeriod.status >= 400);

    const readExperienceA = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`);
    check('user A can read their own experience through the REST API', readExperienceA.ok && readExperienceA.data.length === 1);

    const updateExperienceA = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'PATCH', body: { location: 'Bremen' }, prefer: 'return=representation',
    });
    check('user A can update their own experience through the REST API', updateExperienceA.ok && updateExperienceA.data[0].location === 'Bremen');

    const forgedExperienceProvenance = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'PATCH', body: { created_via: 'migration' }, prefer: 'return=representation',
    });
    const forgedExperienceTimestamp = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'PATCH', body: { updated_at: '2025-01-01T00:00:00Z' }, prefer: 'return=representation',
    });
    check('user A cannot forge experience provenance or timestamps', !forgedExperienceProvenance.ok && forgedExperienceProvenance.status === 403 && !forgedExperienceTimestamp.ok && forgedExperienceTimestamp.status === 403);

    const reviewExperience = await rest(tokenA, '/rpc/review_profile_section', {
      method: 'POST', body: { requested_section_key: 'experience' },
    });
    const experienceReviewCurrent = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=reviewed_content_revision');
    const experienceRevisionCurrent = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    check('user A can renew their experience review at the current revision', reviewExperience.ok && experienceReviewCurrent.data[0].reviewed_content_revision === experienceRevisionCurrent.data[0].content_revision);

    const revisionBeforeConcurrentExperienceUpdates = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    const concurrentExperienceUpdates = await Promise.all([
      rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, { method: 'PATCH', body: { role: 'Research Engineering Assistant' }, prefer: 'return=representation' }),
      rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, { method: 'PATCH', body: { description: 'Synthetic updated public-safe experience fixture.' }, prefer: 'return=representation' }),
    ]);
    const revisionAfterConcurrentExperienceUpdates = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    const experienceReviewAfterUpdate = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=reviewed_content_revision');
    check('concurrent experience mutations advance revision monotonically without losing increments', concurrentExperienceUpdates.every((result) => result.ok) && revisionAfterConcurrentExperienceUpdates.data[0].content_revision >= revisionBeforeConcurrentExperienceUpdates.data[0].content_revision + 2);
    check('later experience mutations make its review stale', experienceReviewAfterUpdate.ok && experienceReviewAfterUpdate.data[0].reviewed_content_revision !== revisionAfterConcurrentExperienceUpdates.data[0].content_revision);

    const zeroRowExperienceUpdate = await rest(tokenA, '/work_experience?id=eq.00000000-0000-0000-0000-000000000000', {
      method: 'PATCH', body: { role: 'Missing' }, prefer: 'return=representation',
    });
    check('a missing experience update returns zero rows', zeroRowExperienceUpdate.ok && zeroRowExperienceUpdate.data.length === 0);

    const readExperienceAAsB = await rest(tokenB, `/work_experience?id=eq.${experienceA.id}`);
    const updateExperienceAAsB = await rest(tokenB, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'PATCH', body: { role: 'Hacked' }, prefer: 'return=representation',
    });
    const deleteExperienceAAsB = await rest(tokenB, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    check('user B cannot read, update, or delete user A\'s experience', readExperienceAAsB.ok && readExperienceAAsB.data.length === 0 && updateExperienceAAsB.ok && updateExperienceAAsB.data.length === 0 && deleteExperienceAAsB.ok && deleteExperienceAAsB.data.length === 0);

    const forgedExperienceInsert = await rest(tokenA, '/work_experience', {
      method: 'POST', body: { user_id: userB.id, experience_kind: 'internship', organization: 'Forged', role: 'Forged', start_year: 2025 },
    });
    const experienceOwnerRewrite = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'PATCH', body: { user_id: userB.id }, prefer: 'return=representation',
    });
    check('user A cannot forge or rewrite experience ownership', !forgedExperienceInsert.ok && forgedExperienceInsert.status === 403 && !experienceOwnerRewrite.ok && experienceOwnerRewrite.status === 403);

    const reviewExperienceB = await rest(tokenB, '/rpc/review_profile_section', {
      method: 'POST', body: { requested_section_key: 'experience' },
    });
    const experienceReviewAAfterB = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=user_id,reviewed_content_revision');
    check('user B\'s experience review changes only user B\'s state', reviewExperienceB.ok && experienceReviewAAfterB.ok && experienceReviewAAfterB.data.length === 1 && experienceReviewAAfterB.data[0].user_id === userA.id);

    const deleteExperienceA = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    const experienceReviewAfterDelete = await rest(tokenA, '/profile_section_reviews?section_key=eq.experience&select=reviewed_content_revision');
    const experienceRevisionAfterDelete = await rest(tokenA, '/profile_section_revisions?section_key=eq.experience&select=content_revision');
    const zeroRowExperienceDelete = await rest(tokenA, `/work_experience?id=eq.${experienceA.id}`, {
      method: 'DELETE', prefer: 'return=representation',
    });
    check('owner can delete experience and the prior review remains stale', deleteExperienceA.ok && deleteExperienceA.data.length === 1 && experienceReviewAfterDelete.data[0].reviewed_content_revision !== experienceRevisionAfterDelete.data[0].content_revision);
    check('a deleted experience returns zero rows on a later delete', zeroRowExperienceDelete.ok && zeroRowExperienceDelete.data.length === 0);

    // ---- education CRUD, primary RPC, and review freshness -----------------
    const createEducationA = await rest(tokenA, '/education_entries', {
      method: 'POST',
      body: {
        user_id: userA.id,
        institution: 'Synthetic Integration University',
        degree: 'BSc',
        degree_year: 2,
        education_status: 'current',
        expected_graduation_month: 7,
        expected_graduation_year: 2028,
      },
      prefer: 'return=representation',
    });
    const educationA = createEducationA.data?.[0];
    check('user A can create current education via the REST API', createEducationA.ok && educationA?.institution === 'Synthetic Integration University');

    const directPrimary = await rest(tokenA, `/education_entries?id=eq.${educationA.id}`, {
      method: 'PATCH', body: { is_primary: true }, prefer: 'return=representation',
    });
    check('user A cannot directly set primary education', !directPrimary.ok && directPrimary.status === 403);

    const selectPrimary = await rest(tokenA, '/rpc/set_primary_education', {
      method: 'POST', body: { education_id: educationA.id },
    });
    check('user A can select their current education through the primary RPC', selectPrimary.ok);

    const revisionsBeforeReview = await rest(tokenA, '/profile_section_revisions?select=section_key,content_revision');
    check('user A can read their own section revisions', revisionsBeforeReview.ok && revisionsBeforeReview.data.length === 3);
    const reviewEducation = await rest(tokenA, '/rpc/review_profile_section', {
      method: 'POST', body: { requested_section_key: 'education' },
    });
    const reviewBasic = await rest(tokenA, '/rpc/review_profile_section', {
      method: 'POST', body: { requested_section_key: 'basic_profile' },
    });
    check('user A can review the remaining implemented profile and education sections through constrained RPCs', reviewEducation.ok && reviewBasic.ok);

    const mutateProfileAfterReview = await rest(tokenA, `/profiles?user_id=eq.${userA.id}`, {
      method: 'PATCH', body: { headline: 'Changed after review' }, prefer: 'return=representation',
    });
    const basicStateAfterMutation = await rest(tokenA, '/profile_section_revisions?section_key=eq.basic_profile&select=content_revision');
    const basicReviewAfterMutation = await rest(tokenA, '/profile_section_reviews?section_key=eq.basic_profile&select=reviewed_content_revision');
    check('a profile mutation makes the basic-profile review stale', mutateProfileAfterReview.ok && basicStateAfterMutation.ok && basicReviewAfterMutation.ok && basicStateAfterMutation.data[0].content_revision !== basicReviewAfterMutation.data[0].reviewed_content_revision);

    const updateEducationA = await rest(tokenA, `/education_entries?id=eq.${educationA.id}`, {
      method: 'PATCH', body: { field: 'Electrical Engineering' }, prefer: 'return=representation',
    });
    check('user A can update their education via the REST API', updateEducationA.ok && updateEducationA.data[0].field === 'Electrical Engineering');
    const staleReview = await rest(tokenA, '/profile_section_reviews?select=section_key,reviewed_content_revision');
    const afterMutationRevision = await rest(tokenA, '/profile_section_revisions?section_key=eq.education&select=content_revision');
    check('an education mutation makes its recorded review stale', staleReview.ok && afterMutationRevision.ok && staleReview.data.find((row) => row.section_key === 'education').reviewed_content_revision !== afterMutationRevision.data[0].content_revision);

    const createSecondEducationA = await rest(tokenA, '/education_entries', {
      method: 'POST', body: { user_id: userA.id, institution: 'Second Current University', education_status: 'current' }, prefer: 'return=representation',
    });
    const secondEducationA = createSecondEducationA.data?.[0];
    check('user A can create a second current education entry', createSecondEducationA.ok && secondEducationA?.education_status === 'current');
    const switchPrimary = await rest(tokenA, '/rpc/set_primary_education', {
      method: 'POST', body: { education_id: secondEducationA.id },
    });
    const primaryRows = await rest(tokenA, '/education_entries?select=id,is_primary');
    check('switching primary leaves exactly the selected second entry primary', switchPrimary.ok && primaryRows.ok && primaryRows.data.filter((row) => row.is_primary).length === 1 && primaryRows.data.find((row) => row.is_primary)?.id === secondEducationA.id);
    const revisionBeforeReselect = await rest(tokenA, '/profile_section_revisions?section_key=eq.education&select=content_revision');
    const reselectPrimary = await rest(tokenA, '/rpc/set_primary_education', { method: 'POST', body: { education_id: secondEducationA.id } });
    const revisionAfterReselect = await rest(tokenA, '/profile_section_revisions?section_key=eq.education&select=content_revision');
    check('reselecting the current primary is idempotent', reselectPrimary.ok && revisionBeforeReselect.data[0].content_revision === revisionAfterReselect.data[0].content_revision);
    const createCompletedEducationA = await rest(tokenA, '/education_entries', {
      method: 'POST', body: { user_id: userA.id, institution: 'Completed University', education_status: 'completed', end_date: '2025-01-01' }, prefer: 'return=representation',
    });
    const nonCurrentPrimary = await rest(tokenA, '/rpc/set_primary_education', { method: 'POST', body: { education_id: createCompletedEducationA.data?.[0]?.id } });
    check('a non-current education entry cannot become primary', !nonCurrentPrimary.ok && nonCurrentPrimary.status >= 400);
    const deletePrimary = await rest(tokenA, `/education_entries?id=eq.${secondEducationA.id}`, { method: 'DELETE', prefer: 'return=representation' });
    const primaryAfterDelete = await rest(tokenA, '/education_entries?select=id,is_primary');
    check('deleting the selected primary does not automatically promote another entry', deletePrimary.ok && primaryAfterDelete.ok && primaryAfterDelete.data.filter((row) => row.is_primary).length === 0);
    const reviewEducationAgain = await rest(tokenA, '/rpc/review_profile_section', { method: 'POST', body: { requested_section_key: 'education' } });
    const revisionBeforeConcurrentUpdates = await rest(tokenA, '/profile_section_revisions?section_key=eq.education&select=content_revision');
    const concurrentUpdates = await Promise.all([
      rest(tokenA, `/education_entries?id=eq.${educationA.id}`, { method: 'PATCH', body: { degree: 'BSc revised once' }, prefer: 'return=representation' }),
      rest(tokenA, `/education_entries?id=eq.${educationA.id}`, { method: 'PATCH', body: { field: 'Electrical Engineering revised' }, prefer: 'return=representation' }),
    ]);
    const revisionAfterConcurrentUpdates = await rest(tokenA, '/profile_section_revisions?section_key=eq.education&select=content_revision');
    const educationReviewAfterConcurrentUpdates = await rest(tokenA, '/profile_section_reviews?section_key=eq.education&select=reviewed_content_revision');
    check('concurrent education mutations advance revision monotonically without losing increments', reviewEducationAgain.ok && concurrentUpdates.every((result) => result.ok) && revisionAfterConcurrentUpdates.data[0].content_revision >= revisionBeforeConcurrentUpdates.data[0].content_revision + 2);
    check('education review is stale after a later education mutation', educationReviewAfterConcurrentUpdates.ok && educationReviewAfterConcurrentUpdates.data[0].reviewed_content_revision !== revisionAfterConcurrentUpdates.data[0].content_revision);

    // ---- isolation: A cannot read or update B's data ----------------------
    const readBAsA = await rest(tokenA, `/profiles?user_id=eq.${userB.id}`, {});
    check('user A cannot read user B\'s profile (empty result, not an error)', readBAsA.ok && readBAsA.data.length === 0);

    const updateBAsA = await rest(tokenA, `/profiles?user_id=eq.${userB.id}`, {
      method: 'PATCH',
      body: { headline: 'hacked' },
      prefer: 'return=representation',
    });
    check('user A cannot update user B\'s profile (0 rows affected)', updateBAsA.ok && updateBAsA.data.length === 0);

    // ---- isolation: A cannot insert an education entry owned by B --------
    const forgedInsert = await rest(tokenA, '/education_entries', {
      method: 'POST',
      body: { user_id: userB.id, institution: 'forged via API' },
    });
    check('user A cannot insert an education entry owned by user B', !forgedInsert.ok && forgedInsert.status === 403);

    const createEducationB = await rest(tokenB, '/education_entries', {
      method: 'POST',
      body: { user_id: userB.id, institution: 'Synthetic B University', education_status: 'current' },
      prefer: 'return=representation',
    });
    const foreignPrimary = await rest(tokenA, '/rpc/set_primary_education', {
      method: 'POST', body: { education_id: createEducationB.data?.[0]?.id },
    });
    check('user A cannot select user B\'s education as primary', !foreignPrimary.ok && foreignPrimary.status >= 400);

    const revisionsAAsB = await rest(tokenB, `/profile_section_revisions?user_id=eq.${userA.id}`);
    const reviewsAAsB = await rest(tokenB, `/profile_section_reviews?user_id=eq.${userA.id}`);
    check('user B cannot read user A\'s revisions or reviews', revisionsAAsB.ok && reviewsAAsB.ok && revisionsAAsB.data.length === 0 && reviewsAAsB.data.length === 0);
    const reviewB = await rest(tokenB, '/rpc/review_profile_section', { method: 'POST', body: { requested_section_key: 'basic_profile' } });
    const reviewsAAfterBReview = await rest(tokenA, '/profile_section_reviews?section_key=eq.basic_profile&select=reviewed_content_revision');
    check('user B\'s review RPC changes only user B\'s state', reviewB.ok && reviewsAAfterBReview.ok && reviewsAAfterBReview.data[0].reviewed_content_revision !== null);

    const directRevisionWrite = await rest(tokenA, '/profile_section_revisions', {
      method: 'POST', body: { user_id: userA.id, section_key: 'education', content_revision: 99 },
    });
    check('user A cannot directly forge section revisions', !directRevisionWrite.ok && directRevisionWrite.status === 403);

    const directReviewWrite = await rest(tokenA, '/profile_section_reviews', {
      method: 'POST', body: { user_id: userA.id, section_key: 'education', reviewed_content_revision: 999 },
    });
    check('user A cannot directly forge section reviews', !directReviewWrite.ok && directReviewWrite.status === 403);

    // ---- isolation: B cannot access A's data ------------------------------
    const readAAsB = await rest(tokenB, `/profiles?user_id=eq.${userA.id}`, {});
    check('user B cannot read user A\'s profile', readAAsB.ok && readAAsB.data.length === 0);

    const deleteAAsB = await rest(tokenB, `/profiles?user_id=eq.${userA.id}`, {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    check('user B cannot delete user A\'s profile (browser DELETE is not granted)', !deleteAAsB.ok && deleteAAsB.status === 403);

    // ---- Phase 2A.1: opportunities, applications, interview prep ---------
    // Shared opportunity-domain rows are seeded directly via the service
    // role (trusted, RLS-bypassing) -- exactly the kind of write the
    // ingestion CLI performs, and exactly what the checks below confirm the
    // browser role can never do itself.
    const seededSource = await restAsService('/sources', {
      method: 'POST',
      body: { source_key: `greenhouse:api-test-${runId}`, adapter_kind: 'greenhouse', display_name: 'API Test Board', base_url: 'https://boards-api.greenhouse.io/v1/boards/api-test/jobs', enabled: true },
      prefer: 'return=representation',
    });
    seededSourceId = seededSource.data?.[0]?.id;
    const seededOpportunity = await restAsService('/opportunities', {
      method: 'POST', body: { status: 'active' }, prefer: 'return=representation',
    });
    seededOpportunityId = seededOpportunity.data?.[0]?.id;
    const seededListing = await restAsService('/source_listings', {
      method: 'POST',
      body: { source_id: seededSourceId, external_id: `job-${runId}`, canonical_source_url: `https://job-boards.greenhouse.io/api-test/jobs/${runId}`, application_url: `https://job-boards.greenhouse.io/api-test/jobs/${runId}`, opportunity_id: seededOpportunityId },
      prefer: 'return=representation',
    });
    const seededListingId = seededListing.data?.[0]?.id;
    const seededVersion = await restAsService('/opportunity_versions', {
      method: 'POST',
      body: { opportunity_id: seededOpportunityId, source_listing_id: seededListingId, version_number: 1, title: 'Integration Test Working Student Role', organization: 'API Test Co', description: 'Synthetic integration-test description.', location_text: 'Bremen, Germany', remote_mode: 'onsite', opportunity_kind: 'working_student', employment_type: 'internship', content_hash: `hash-${runId}` },
      prefer: 'return=representation',
    });
    const seededVersionId = seededVersion.data?.[0]?.id;
    const pinCurrentVersion = await restAsService(`/opportunities?id=eq.${seededOpportunityId}`, {
      method: 'PATCH', body: { current_version_id: seededVersionId }, prefer: 'return=representation',
    });
    check('fixture setup: a shared opportunity with a current version is seeded via the trusted service role', seededSourceId && seededOpportunityId && seededListingId && seededVersionId && pinCurrentVersion.ok);

    const readSharedOpportunity = await rest(tokenA, `/opportunity_search?opportunity_id=eq.${seededOpportunityId}`);
    check('user A can read a shared opportunity through opportunity_search', readSharedOpportunity.ok && readSharedOpportunity.data.length === 1 && readSharedOpportunity.data[0].title === 'Integration Test Working Student Role');

    const searchSharedOpportunity = await rest(tokenA, `/opportunity_search?organization=ilike.*API+Test*`);
    check('user A can search/filter shared opportunities', searchSharedOpportunity.ok && searchSharedOpportunity.data.some((row) => row.opportunity_id === seededOpportunityId));

    const searchByLocationText = await rest(tokenA, `/opportunity_search?location_text=ilike.*Bremen*`);
    check('user A can filter shared opportunities by location text (e.g. the Bremen preset)', searchByLocationText.ok && searchByLocationText.data.some((row) => row.opportunity_id === seededOpportunityId));

    const forgeOpportunityInsert = await rest(tokenA, '/opportunities', {
      method: 'POST', body: { status: 'active' },
    });
    check('the browser cannot forge a shared opportunity directly', !forgeOpportunityInsert.ok && forgeOpportunityInsert.status === 403);

    const forgeVersionInsert = await rest(tokenA, '/opportunity_versions', {
      method: 'POST',
      body: { opportunity_id: seededOpportunityId, source_listing_id: seededListingId, version_number: 2, title: 'Forged', organization: 'Forged', description: 'Forged', remote_mode: 'onsite', opportunity_kind: 'other', employment_type: 'other', content_hash: 'forged' },
    });
    check('the browser cannot forge a shared opportunity version directly', !forgeVersionInsert.ok && forgeVersionInsert.status === 403);

    const saveSharedOpportunity = await rest(tokenA, '/user_opportunity_state', {
      method: 'POST',
      body: { user_id: userA.id, opportunity_id: seededOpportunityId, saved_at: new Date().toISOString(), saved_opportunity_version_id: seededVersionId },
      prefer: 'return=representation',
    });
    check('user A can save a shared opportunity, pinning the current version', saveSharedOpportunity.ok && saveSharedOpportunity.data[0].saved_opportunity_version_id === seededVersionId);

    const hideSharedOpportunity = await rest(tokenA, `/user_opportunity_state?opportunity_id=eq.${seededOpportunityId}`, {
      method: 'PATCH', body: { hidden_at: new Date().toISOString() }, prefer: 'return=representation',
    });
    check('user A can additionally hide a saved opportunity', hideSharedOpportunity.ok && hideSharedOpportunity.data[0].hidden_at !== null && hideSharedOpportunity.data[0].saved_at !== null);

    const createManualOpportunity = await rest(tokenA, '/private_opportunities', {
      method: 'POST',
      body: { user_id: userA.id, source_url: 'https://jobs.fraunhofer.de/integration-test', title: 'Integration Test Manual Role', organization_name: 'Fraunhofer Integration Test', location_text: 'Bremen, Germany', opportunity_kind: 'research_assistant', employment_type: 'part_time' },
      prefer: 'return=representation',
    });
    const manualOpportunityId = createManualOpportunity.data?.[0]?.id;
    check('user A can create a manual opportunity for an unsupported source', createManualOpportunity.ok && manualOpportunityId);

    const createSharedApplication = await rest(tokenA, '/applications', {
      method: 'POST', body: { user_id: userA.id, opportunity_version_id: seededVersionId }, prefer: 'return=representation',
    });
    const sharedApplicationId = createSharedApplication.data?.[0]?.id;
    check('user A can create an application pinned to a shared opportunity version', createSharedApplication.ok && createSharedApplication.data[0].opportunity_version_id === seededVersionId && createSharedApplication.data[0].status === 'preparing');
    check('the created application\'s shared_opportunity_id is derived server-side from the pinned version', createSharedApplication.data[0].shared_opportunity_id === seededOpportunityId);

    const duplicateSharedApplication = await rest(tokenA, '/applications', {
      method: 'POST', body: { user_id: userA.id, opportunity_version_id: seededVersionId },
    });
    check('starting a second application for the same shared opportunity is rejected as a duplicate', !duplicateSharedApplication.ok && duplicateSharedApplication.status === 409);

    const createManualApplication = await rest(tokenA, '/applications', {
      method: 'POST', body: { user_id: userA.id, private_opportunity_id: manualOpportunityId }, prefer: 'return=representation',
    });
    const manualApplicationId = createManualApplication.data?.[0]?.id;
    check('user A can create an application from a manual-opportunity snapshot', createManualApplication.ok && manualApplicationId && createManualApplication.data[0].private_opportunity_snapshot?.title === 'Integration Test Manual Role');

    const duplicateManualApplication = await rest(tokenA, '/applications', {
      method: 'POST', body: { user_id: userA.id, private_opportunity_id: manualOpportunityId },
    });
    check('starting a second application for the same existing manual opportunity is rejected as a duplicate', !duplicateManualApplication.ok && duplicateManualApplication.status === 409);

    const correctManualSourceUrl = await rest(tokenA, `/private_opportunities?id=eq.${manualOpportunityId}`, {
      method: 'PATCH', body: { source_url: 'https://jobs.fraunhofer.de/integration-test-corrected' }, prefer: 'return=representation',
    });
    const manualApplicationAfterUrlFix = await rest(tokenA, `/applications?id=eq.${manualApplicationId}`);
    check('user A can correct a manual opportunity\'s source_url without altering the already-captured application snapshot', correctManualSourceUrl.ok && correctManualSourceUrl.data[0].source_url === 'https://jobs.fraunhofer.de/integration-test-corrected' && manualApplicationAfterUrlFix.data[0].private_opportunity_snapshot?.source_url === 'https://jobs.fraunhofer.de/integration-test');

    const updateApplicationStatus = await rest(tokenA, `/applications?id=eq.${sharedApplicationId}`, {
      method: 'PATCH', body: { status: 'applied' }, prefer: 'return=representation',
    });
    check('user A can update application status, and applied_at is set automatically', updateApplicationStatus.ok && updateApplicationStatus.data[0].status === 'applied' && updateApplicationStatus.data[0].applied_at !== null);

    const forgePinnedVersionRewrite = await rest(tokenA, `/applications?id=eq.${sharedApplicationId}`, {
      method: 'PATCH', body: { opportunity_version_id: seededVersionId },
    });
    check('user A cannot rewrite the pinned opportunity_version_id through the REST API', !forgePinnedVersionRewrite.ok && forgePinnedVersionRewrite.status === 403);

    const addInterviewPrepNotes = await rest(tokenA, '/interview_prep_notes', {
      method: 'POST', body: { application_id: sharedApplicationId, likely_questions: 'Tell me about a project you shipped.' }, prefer: 'return=representation',
    });
    check('user A can add interview prep notes, with user_id derived server-side', addInterviewPrepNotes.ok && addInterviewPrepNotes.data[0].user_id === userA.id);

    const readApplicationsAAsB = await rest(tokenB, `/applications?user_id=eq.${userA.id}`);
    check('user B cannot read user A\'s applications', readApplicationsAAsB.ok && readApplicationsAAsB.data.length === 0);

    const readManualOpportunitiesAAsB = await rest(tokenB, `/private_opportunities?user_id=eq.${userA.id}`);
    check('user B cannot read user A\'s manual opportunities', readManualOpportunitiesAAsB.ok && readManualOpportunitiesAAsB.data.length === 0);

    const readInterviewPrepAAsB = await rest(tokenB, `/interview_prep_notes?application_id=eq.${sharedApplicationId}`);
    check('user B cannot read user A\'s interview prep notes', readInterviewPrepAAsB.ok && readInterviewPrepAAsB.data.length === 0);

    // ---- regression: an application survives re-ingestion pinning a new
    // current_version_id (the exact bug the independent review corrections
    // fixed by adding applications.shared_opportunity_id) --------------------
    const seededVersion2 = await restAsService('/opportunity_versions', {
      method: 'POST',
      body: { opportunity_id: seededOpportunityId, source_listing_id: seededListingId, version_number: 2, title: 'Integration Test Working Student Role (Updated)', organization: 'API Test Co', description: 'Synthetic integration-test description, updated.', location_text: 'Bremen, Germany', remote_mode: 'onsite', opportunity_kind: 'working_student', employment_type: 'internship', content_hash: `hash-${runId}-v2` },
      prefer: 'return=representation',
    });
    const seededVersion2Id = seededVersion2.data?.[0]?.id;
    const pinVersion2 = await restAsService(`/opportunities?id=eq.${seededOpportunityId}`, {
      method: 'PATCH', body: { current_version_id: seededVersion2Id }, prefer: 'return=representation',
    });
    check('fixture setup: re-ingestion pins a new current_version_id for the same opportunity', Boolean(seededVersion2Id) && pinVersion2.ok);

    const sharedApplicationAfterReingestion = await rest(tokenA, `/applications?id=eq.${sharedApplicationId}`);
    check('the existing application still points at the original pinned version after re-ingestion, not the new current version', sharedApplicationAfterReingestion.ok && sharedApplicationAfterReingestion.data[0].opportunity_version_id === seededVersionId && sharedApplicationAfterReingestion.data[0].shared_opportunity_id === seededOpportunityId);

    const duplicateAgainstNewVersion = await rest(tokenA, '/applications', {
      method: 'POST', body: { user_id: userA.id, opportunity_version_id: seededVersion2Id },
    });
    check('starting a new application against the re-ingested version of the same opportunity is still rejected as a duplicate', !duplicateAgainstNewVersion.ok && duplicateAgainstNewVersion.status === 409);

    console.log(`\nAll ${checkCount} checks passed.`);
  } finally {
    // ---- cleanup: attempted for every temporary user, always -------------
    // Collected rather than fire-and-forget: a cleanup failure must fail the
    // test command (via process.exitCode below), and if an assertion above
    // also failed, that original failure must still be what's reported as
    // the reason main() rejects -- this block never throws.
    const cleanupErrors = [];
    for (const user of [userA, userB]) {
      if (!user) continue;
      try {
        await adminDeleteUser(user.id);
        const problems = await verifyUserFullyRemoved(user.id);
        cleanupErrors.push(...problems);
      } catch (err) {
        cleanupErrors.push(`failed to delete user ${user.id}: ${err.message}`);
      }
    }

    // Shared opportunity-domain fixtures are cleaned up only after both
    // users are gone -- applications reference opportunity_version_id with
    // no ON DELETE action, so deleting the opportunity first (while an
    // application still pointed at its version) would fail with a foreign
    // key violation. Deleting `opportunities` cascades to its
    // source_listings and opportunity_versions rows (both declared ON
    // DELETE CASCADE), even though no role -- including service_role --
    // holds a direct DELETE grant on opportunity_versions; a cascade delete
    // is a referential action, not a separately grant-checked statement.
    if (seededOpportunityId) {
      try {
        const deleteOpportunity = await restAsService(`/opportunities?id=eq.${seededOpportunityId}`, { method: 'DELETE', prefer: 'return=representation' });
        if (!deleteOpportunity.ok) cleanupErrors.push(`failed to delete seeded opportunity ${seededOpportunityId}: HTTP ${deleteOpportunity.status}`);
      } catch (err) {
        cleanupErrors.push(`failed to delete seeded opportunity ${seededOpportunityId}: ${err.message}`);
      }
    }
    if (seededSourceId) {
      try {
        const deleteSource = await restAsService(`/sources?id=eq.${seededSourceId}`, { method: 'DELETE', prefer: 'return=representation' });
        if (!deleteSource.ok) cleanupErrors.push(`failed to delete seeded source ${seededSourceId}: HTTP ${deleteSource.status}`);
      } catch (err) {
        cleanupErrors.push(`failed to delete seeded source ${seededSourceId}: ${err.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.error('\nCleanup failures:');
      for (const problem of cleanupErrors) console.error(`  - ${problem}`);
      process.exitCode = 1;
    } else if (userA || userB) {
      console.log('Temporary users and their profile rows verified cleaned up.');
    }
  }
}

main().catch((err) => {
  console.error('\n' + err.message);
  process.exit(1);
});
