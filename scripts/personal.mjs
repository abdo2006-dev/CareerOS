#!/usr/bin/env node
/** Personal-first launcher. It is intentionally non-destructive: no db reset. */
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const appDir = `${root}/app`
const ingestionDir = `${root}/ingestion`
const localUrl = 'http://127.0.0.1:54321'

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
}

function fail(message) {
  console.error(`\nCareerOS could not start: ${message}`)
  process.exit(1)
}

const docker = spawnSync('docker', ['info'], { stdio: 'ignore' })
if (docker.error || docker.status !== 0) {
  fail('Docker or Colima is not reachable. Start Colima (for example, `colima start`) and run `npm run personal` again.')
}

try {
  run('supabase', ['start'])
  // Applies only unapplied migrations to the running local stack; it never
  // drops tables or calls db reset, preserving personal data on every run.
  run('supabase', ['migration', 'up', '--local'])
} catch {
  fail('Supabase could not start or apply pending migrations. Verify the Supabase CLI is installed and try again.')
}

let status
try {
  status = run('supabase', ['status', '-o', 'env'])
} catch {
  fail('The local Supabase stack did not provide its runtime configuration.')
}
const env = Object.fromEntries(status.split(/\r?\n/).filter(Boolean).map((line) => {
  const index = line.indexOf('=')
  return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')]
}))
const publishableKey = env.PUBLISHABLE_KEY ?? env.ANON_KEY
const serviceRoleKey = env.SECRET_KEY ?? env.SERVICE_ROLE_KEY
if (!publishableKey || !serviceRoleKey) fail('Supabase did not provide the required local API keys.')

try {
  const owner = JSON.parse(run('node', ['scripts/ensure-personal-owner.mjs'], {
    env: { ...process.env, SUPABASE_URL: env.API_URL ?? localUrl, SUPABASE_SECRET_KEY: serviceRoleKey },
  }))
  const runtime = await import('node:fs/promises').then(({ readFile }) => readFile(`${root}/.careeros/personal.env`, 'utf8'))
  const password = runtime.match(/^PERSONAL_OWNER_PASSWORD=(.+)$/m)?.[1]
  if (!password) throw new Error('missing personal credential')
  writeFileSync(`${appDir}/.env.local`, [
    `VITE_SUPABASE_URL=${env.API_URL ?? localUrl}`,
    `VITE_SUPABASE_PUBLISHABLE_KEY=${publishableKey}`,
    'VITE_PERSONAL_MODE=true',
    `VITE_PERSONAL_OWNER_EMAIL=${owner.email}`,
    `VITE_PERSONAL_OWNER_PASSWORD=${password}`,
    'VITE_PERSONAL_RUNTIME_URL=http://127.0.0.1:4798',
    '',
  ].join('\n'), { mode: 0o600 })
} catch {
  fail('The local personal owner could not be prepared.')
}
writeFileSync(`${ingestionDir}/.env.local`, [
  `SUPABASE_URL=${env.API_URL ?? localUrl}`,
  `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
  '',
].join('\n'), { mode: 0o600 })

for (const dir of [appDir, ingestionDir]) {
  if (!existsSync(`${dir}/node_modules`)) {
    const installed = spawnSync('npm', ['ci'], { cwd: dir, stdio: 'inherit' })
    if (installed.status !== 0) fail(`Dependencies could not be installed in ${dir}.`)
  }
}

const runtime = spawn('node', ['scripts/personal-runtime.mjs'], {
  cwd: root,
  env: { ...process.env, CAREEROS_REFRESH_ON_START: '1' },
  stdio: 'inherit',
})
const vite = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1'], { cwd: appDir, stdio: 'inherit' })

console.log('\nCareerOS is starting in Personal Mode at http://127.0.0.1:5173')
function stop() {
  runtime.kill('SIGTERM')
  vite.kill('SIGTERM')
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
vite.on('exit', (code) => process.exit(code ?? 0))
