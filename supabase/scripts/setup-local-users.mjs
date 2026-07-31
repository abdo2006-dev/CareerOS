#!/usr/bin/env node
// Creates (or resets) two clearly-labeled, password-based, local-only
// development login users against the LOCAL Supabase Auth Admin API, and
// makes sure each has a matching `profiles` row.
//
// This is deliberately separate from the pgTAP fixtures in
// supabase/tests/database/ -- those are created and rolled back entirely
// inside a single test transaction and never actually persist. These users
// are real, persistent, local-only accounts meant for manually exercising
// the frontend sign-in flow during development.
//
// Requirements enforced by this script:
//   - refuses to run unless SUPABASE_URL resolves to a loopback address
//   - reads the secret key from an environment variable only -- never
//     hardcoded, never printed, never logged
//   - no fixed/committed development password: uses CAREEROS_DEV_PASSWORD
//     if deliberately supplied, otherwise generates a fresh cryptographically
//     random password every run and prints it once -- it is never written to
//     a tracked file
//   - idempotent: safe to re-run; existing users are reset (to the newly
//     supplied or generated password), not duplicated
//   - no dependency beyond Node's built-in fetch and crypto (Node 18+)
//
// Usage:
//   SUPABASE_URL=http://127.0.0.1:54321 \
//   SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxx \
//   node supabase/scripts/setup-local-users.mjs
//
// Optionally set CAREEROS_DEV_PASSWORD to choose the password yourself
// instead of getting a freshly generated one.

import { randomBytes } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const DEV_PASSWORD = process.env.CAREEROS_DEV_PASSWORD ?? randomBytes(18).toString('base64url');

const USERS = [
  { label: 'primary', email: 'dev-owner@careeros.local', headline: 'Local dev owner account' },
  { label: 'secondary', email: 'dev-secondary@careeros.local', headline: 'Local dev secondary account' },
];

function assertLoopback(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    console.error(`error: SUPABASE_URL ("${rawUrl}") is not a valid URL`);
    process.exit(1);
  }
  const host = parsed.hostname;
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback) {
    console.error(
      `error: refusing to run against a non-loopback host ("${host}"). ` +
        'This script only ever targets the local Supabase stack -- never a hosted project.',
    );
    process.exit(1);
  }
  return parsed;
}

async function adminFetch(path, options) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  return res;
}

async function findUserByEmail(email) {
  const res = await adminFetch(`/auth/v1/admin/users?page=1&per_page=200`, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`listing users failed: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const users = body.users ?? body;
  return users.find((u) => u.email === email) ?? null;
}

async function createOrResetUser({ email }) {
  const existing = await findUserByEmail(email);

  if (existing) {
    const res = await adminFetch(`/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ password: DEV_PASSWORD, email_confirm: true }),
    });
    if (!res.ok) {
      throw new Error(`resetting existing user ${email} failed: ${res.status} ${await res.text()}`);
    }
    return { id: existing.id, status: 'reset' };
  }

  const res = await adminFetch(`/auth/v1/admin/users`, {
    method: 'POST',
    body: JSON.stringify({ email, password: DEV_PASSWORD, email_confirm: true }),
  });
  if (!res.ok) {
    throw new Error(`creating user ${email} failed: ${res.status} ${await res.text()}`);
  }
  const created = await res.json();
  return { id: created.id, status: 'created' };
}

async function upsertProfile(userId, headline) {
  const res = await adminFetch(`/rest/v1/profiles`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: userId, headline }),
  });
  if (!res.ok) {
    throw new Error(`upserting profile for ${userId} failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  if (!SECRET_KEY) {
    console.error('error: SUPABASE_SECRET_KEY environment variable is required (not printed by this script).');
    process.exit(1);
  }
  assertLoopback(SUPABASE_URL);

  console.log(`Target: ${SUPABASE_URL} (loopback confirmed)`);
  console.log(
    `LOCAL-ONLY dev password for all accounts below (shown once, not written to any file): "${DEV_PASSWORD}"\n`,
  );

  for (const user of USERS) {
    const { id, status } = await createOrResetUser(user);
    await upsertProfile(id, user.headline);
    console.log(`[${user.label}] ${user.email} -> ${status} (id ${id}), profile row upserted`);
  }

  console.log('\nDone. Secret key was never printed. Re-run this script to reset to a new password.');
}

main().catch((err) => {
  console.error('error:', err.message);
  process.exit(1);
});
