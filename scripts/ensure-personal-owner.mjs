#!/usr/bin/env node
/**
 * Personal Mode's local-only identity bootstrap.
 *
 * This deliberately keeps Supabase Auth and the existing user_id/RLS model
 * intact. It reuses the original local development owner when present, so a
 * transition to Personal Mode cannot orphan that owner's existing data.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const runtimeDir = new URL('../.careeros/', import.meta.url)
const runtimeFile = new URL('../.careeros/personal.env', import.meta.url)

const supabaseUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !secretKey) {
  throw new Error('Personal Mode could not read the local Supabase runtime configuration.')
}

const host = new URL(supabaseUrl).hostname
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('Personal Mode only manages a loopback Supabase stack.')
}

async function readRuntime() {
  try {
    const raw = await readFile(runtimeFile, 'utf8')
    return Object.fromEntries(
      raw
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    )
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') return {}
    throw error
  }
}

function headers(extra = {}) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function api(path, options = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers: headers(options.headers),
  })
  if (!response.ok) {
    throw new Error(`Local owner setup failed (${response.status}).`)
  }
  return response
}

async function findUser(email) {
  const response = await api('/auth/v1/admin/users?page=1&per_page=200')
  const body = await response.json()
  const users = body.users ?? body
  return users.find((user) => user.email === email) ?? null
}

async function ensureProfile(userId) {
  const response = await api(`/rest/v1/profiles?user_id=eq.${userId}&select=user_id`)
  const rows = await response.json()
  if (rows.length > 0) return
  await api('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: userId, headline: 'Personal CareerOS workspace' }),
  })
}

const runtime = await readRuntime()
const email = runtime.PERSONAL_OWNER_EMAIL ?? 'dev-owner@careeros.local'
const password = runtime.PERSONAL_OWNER_PASSWORD ?? randomBytes(24).toString('base64url')
const existing = await findUser(email)

let userId
if (existing) {
  userId = existing.id
  // The stored local-only credential gives the browser an invisible session.
  // Resetting to the same value is idempotent and leaves this user's rows intact.
  await api(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password, email_confirm: true }),
  })
} else {
  const response = await api('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email, password, email_confirm: true }),
  })
  userId = (await response.json()).id
}

await ensureProfile(userId)
await mkdir(runtimeDir, { recursive: true, mode: 0o700 })
await writeFile(
  runtimeFile,
  `PERSONAL_OWNER_EMAIL=${email}\nPERSONAL_OWNER_PASSWORD=${password}\n`,
  { mode: 0o600 },
)

// This line is intentionally machine-readable for the parent launcher and
// contains no service-role credential or password.
console.log(JSON.stringify({ email, userId }))
