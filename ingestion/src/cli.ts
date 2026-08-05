#!/usr/bin/env node
import { loadEnv } from './env.js'
import { createServiceClient } from './db.js'
import {
  fetchGreenhouseBoard,
  parseGreenhouseJob,
  normalizeGreenhouseJob,
  GREENHOUSE_ADAPTER_KIND,
} from './adapters/greenhouse.js'
import { ingestDryRun, ingestReal } from './orchestrator.js'
import type { SourceRow } from './adapters/types.js'
import type { SupabaseClient } from '@supabase/supabase-js'

interface CliArgs {
  source: string
  board?: string
  dryRun: boolean
}

function parseArgs(argv: string[]): {
  command: string | undefined
  args: CliArgs
} {
  const [command, ...rest] = argv
  const args: CliArgs = { source: '', dryRun: false }
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (token === '--source') {
      args.source = rest[(index += 1)]
    } else if (token === '--board') {
      args.board = rest[(index += 1)]
    } else if (token === '--dry-run') {
      args.dryRun = true
    } else {
      throw new Error(`Unknown argument: ${token}`)
    }
  }
  return { command, args }
}

async function loadSources(
  client: SupabaseClient,
  adapterKind: string,
  board: string | undefined,
): Promise<SourceRow[]> {
  let query = client
    .from('sources')
    .select('id, source_key, adapter_kind, display_name, base_url, enabled')
    .eq('adapter_kind', adapterKind)
    .eq('enabled', true)
  if (board) query = query.eq('source_key', `${adapterKind}:${board}`)

  const { data, error } = await query
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error(
      board
        ? `No enabled source is configured for "${adapterKind}:${board}".`
        : `No enabled sources are configured for adapter "${adapterKind}".`,
    )
  }
  return data as SourceRow[]
}

async function runIngest(args: CliArgs): Promise<void> {
  if (args.source !== GREENHOUSE_ADAPTER_KIND) {
    throw new Error(
      `Unsupported --source "${args.source}". Only "greenhouse" is implemented.`,
    )
  }

  const env = loadEnv()
  const client = createServiceClient(env)
  const sources = await loadSources(client, args.source, args.board)

  for (const source of sources) {
    console.log(`\n[${source.source_key}] fetching...`)
    const fetchResult = await fetchGreenhouseBoard(source.base_url)
    console.log(
      `[${source.source_key}] fetched ${fetchResult.records.length} record(s); ` +
        `complete response: ${fetchResult.pageComplete}`,
    )

    if (args.dryRun) {
      const summary = await ingestDryRun({
        client,
        source,
        records: fetchResult.records,
        pageComplete: fetchResult.pageComplete,
        parse: parseGreenhouseJob,
        normalize: (raw, s) =>
          normalizeGreenhouseJob(
            raw as ReturnType<typeof parseGreenhouseJob>,
            s,
          ),
      })
      console.log(
        `[${source.source_key}] DRY RUN -- no writes were made. Would create ` +
          `${summary.wouldCreate}, update ${summary.wouldUpdate}, leave ` +
          `${summary.wouldBeUnchanged} unchanged, and (if this were a complete ` +
          `run) close up to ${summary.wouldClose}. ${summary.errorCount} record ` +
          `error(s).`,
      )
      if (summary.errors.length > 0) {
        console.log(`[${source.source_key}] errors:`, summary.errors)
      }
      continue
    }

    const summary = await ingestReal({
      client,
      source,
      records: fetchResult.records,
      pageComplete: fetchResult.pageComplete,
      parse: parseGreenhouseJob,
      normalize: (raw, s) =>
        normalizeGreenhouseJob(raw as ReturnType<typeof parseGreenhouseJob>, s),
    })
    console.log(
      `[${source.source_key}] run ${summary.runId} (${summary.status}) -- ` +
        `${summary.recordsNew} new, ${summary.recordsUpdated} updated, ` +
        `${summary.recordsUnchanged} unchanged, ${summary.errorCount} error(s).`,
    )
    if (summary.errors.length > 0) {
      console.log(`[${source.source_key}] errors:`, summary.errors)
    }
  }
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2))
  if (command !== 'ingest') {
    throw new Error(
      `Unknown command "${command ?? ''}". Usage: ingest --source greenhouse [--board <token>] [--dry-run]`,
    )
  }
  await runIngest(args)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
