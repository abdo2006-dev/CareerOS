export interface IngestionEnv {
  supabaseUrl: string
  serviceRoleKey: string
}

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * Reads the trusted service-role credential from the process environment
 * only -- never from a committed file, and never printed or logged. Run
 * with `node --env-file=.env.local` (Node 22) to populate it locally.
 */
export function loadEnv(): IngestionEnv {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to ' +
        '.env.local, fill in the local Supabase values (see `supabase status`), and ' +
        'run with `node --env-file=.env.local dist/cli.js ingest ...`.',
    )
  }

  let hostname: string
  try {
    hostname = new URL(supabaseUrl).hostname
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL.')
  }

  if (
    !LOOPBACK_HOSTNAMES.has(hostname) &&
    process.env.INGESTION_ALLOW_REMOTE !== '1'
  ) {
    throw new Error(
      `Refusing to run against a non-loopback SUPABASE_URL (host: ${hostname}). ` +
        'This CLI holds a trusted, RLS-bypassing service-role credential (see ' +
        'docs/adr/ADR-017-local-first-ingestion-execution.md); set INGESTION_ALLOW_REMOTE=1 ' +
        'only if you have deliberately configured a real hosted target.',
    )
  }

  return { supabaseUrl, serviceRoleKey }
}
