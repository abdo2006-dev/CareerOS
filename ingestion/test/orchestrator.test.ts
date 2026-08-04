import { describe, expect, it } from 'vitest'
import { ingestDryRun, ingestReal } from '../src/orchestrator.js'
import type { NormalizedListing, SourceRow } from '../src/adapters/types.js'

interface FakeSourceListingRow {
  id: string
  opportunity_id: string
  currentVersionId: string | null
}

interface RpcCall {
  name: string
  args: Record<string, unknown>
}

class FakeQueryBuilder {
  private filters: Record<string, unknown> = {}
  constructor(
    private readonly table: string,
    private readonly resolve: (
      table: string,
      filters: Record<string, unknown>,
      single: boolean,
    ) => { data: unknown; error: unknown },
  ) {}

  select(): this {
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters[column] = value
    return this
  }

  maybeSingle(): Promise<{ data: unknown; error: unknown }> {
    return Promise.resolve(this.resolve(this.table, this.filters, true))
  }

  then<T>(
    onfulfilled: (value: { data: unknown; error: unknown }) => T,
    onrejected?: (reason: unknown) => T,
  ): Promise<T> {
    return Promise.resolve(this.resolve(this.table, this.filters, false)).then(
      onfulfilled,
      onrejected,
    )
  }
}

function createFakeClient(options: {
  sourceListings?: Map<string, FakeSourceListingRow>
  versionHashes?: Map<string, string>
  activeListings?: { external_id: string; absence_count: number }[]
  rpcHandler?: (
    name: string,
    args: Record<string, unknown>,
  ) => { data: unknown; error: unknown }
}) {
  const rpcCalls: RpcCall[] = []
  const sourceListings = options.sourceListings ?? new Map()
  const versionHashes = options.versionHashes ?? new Map()
  const activeListings = options.activeListings ?? []

  const client = {
    from(table: string) {
      return new FakeQueryBuilder(table, (t, filters, single) => {
        if (t === 'source_listings' && single) {
          const row = sourceListings.get(filters.external_id as string)
          if (!row) return { data: null, error: null }
          return {
            data: {
              id: row.id,
              opportunity_id: row.opportunity_id,
              opportunities: { current_version_id: row.currentVersionId },
            },
            error: null,
          }
        }
        if (t === 'opportunity_versions' && single) {
          const hash = versionHashes.get(filters.id as string)
          return { data: hash ? { content_hash: hash } : null, error: null }
        }
        if (t === 'source_listings' && !single) {
          return { data: activeListings, error: null }
        }
        return { data: null, error: null }
      })
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args })
      if (options.rpcHandler)
        return Promise.resolve(options.rpcHandler(name, args))
      return Promise.resolve({ data: null, error: null })
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any

  return { client, rpcCalls }
}

const source: SourceRow = {
  id: 'source-1',
  source_key: 'greenhouse:synthetic-example',
  adapter_kind: 'greenhouse',
  display_name: 'Synthetic Example',
  base_url: 'https://boards-api.greenhouse.io/v1/boards/synthetic-example/jobs',
  enabled: true,
}

function baseListing(id: string, title: string): NormalizedListing {
  return {
    externalId: id,
    canonicalUrl: `https://example.test/jobs/${id}`,
    applicationUrl: `https://example.test/jobs/${id}`,
    title,
    organization: 'Synthetic Example',
    description: 'Body.',
    locationText: 'Bremen',
    country: null,
    region: null,
    city: null,
    remoteMode: 'onsite',
    opportunityKind: 'internship',
    employmentType: 'internship',
    postedAt: null,
    applicationDeadline: null,
    sourceUpdatedAt: null,
    sourceMetadata: {},
  }
}

describe('ingestDryRun', () => {
  it('performs zero writes -- no rpc call is ever made', async () => {
    const { client, rpcCalls } = createFakeClient({})
    await ingestDryRun({
      client,
      source,
      records: [{ id: 'a' }],
      pageComplete: true,
      parse: (raw) => raw,
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })
    expect(rpcCalls).toHaveLength(0)
  })

  it('classifies an unseen external id as would-create', async () => {
    const { client } = createFakeClient({})
    const summary = await ingestDryRun({
      client,
      source,
      records: [{ id: 'new-1' }],
      pageComplete: true,
      parse: (raw) => raw,
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })
    expect(summary.wouldCreate).toBe(1)
    expect(summary.wouldUpdate).toBe(0)
    expect(summary.wouldBeUnchanged).toBe(0)
  })

  it('classifies an existing listing with a changed hash as would-update', async () => {
    const sourceListings = new Map([
      [
        'existing-1',
        { id: 'sl-1', opportunity_id: 'opp-1', currentVersionId: 'v-1' },
      ],
    ])
    const versionHashes = new Map([['v-1', 'stale-hash']])
    const { client } = createFakeClient({ sourceListings, versionHashes })
    const summary = await ingestDryRun({
      client,
      source,
      records: [{ id: 'existing-1' }],
      pageComplete: true,
      parse: (raw) => raw,
      normalize: (raw) =>
        baseListing((raw as { id: string }).id, 'Changed Title'),
    })
    expect(summary.wouldUpdate).toBe(1)
  })

  it('isolates a single malformed record without failing the whole run', async () => {
    const { client } = createFakeClient({})
    const summary = await ingestDryRun({
      client,
      source,
      records: [{ id: 'ok-1' }, { bad: true }],
      pageComplete: true,
      parse: (raw) => {
        if (!('id' in (raw as object))) throw new Error('missing id')
        return raw
      },
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })
    expect(summary.wouldCreate).toBe(1)
    expect(summary.errorCount).toBe(1)
  })
})

describe('ingestReal', () => {
  it('begins a run, applies each parseable record once, and finalizes with status complete', async () => {
    const { client, rpcCalls } = createFakeClient({
      rpcHandler: (name) => {
        if (name === 'begin_ingestion_run')
          return { data: 'run-1', error: null }
        if (name === 'apply_source_listing') {
          return {
            data: [
              {
                outcome: 'created',
                opportunity_id: 'opp-x',
                source_listing_id: 'sl-x',
                opportunity_version_id: 'v-x',
              },
            ],
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const summary = await ingestReal({
      client,
      source,
      records: [{ id: 'a' }, { id: 'b' }],
      pageComplete: true,
      parse: (raw) => raw,
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })

    expect(summary.status).toBe('complete')
    expect(summary.recordsNew).toBe(2)
    expect(
      rpcCalls.filter((c) => c.name === 'apply_source_listing'),
    ).toHaveLength(2)
    expect(
      rpcCalls.filter((c) => c.name === 'begin_ingestion_run'),
    ).toHaveLength(1)
    const finalizeCall = rpcCalls.find(
      (c) => c.name === 'finalize_ingestion_run',
    )
    expect(finalizeCall?.args.p_status).toBe('complete')
    expect(finalizeCall?.args.p_run_id).toBe('run-1')
  })

  it('finalizes with status partial when the page was not complete', async () => {
    const { client, rpcCalls } = createFakeClient({
      rpcHandler: (name) => {
        if (name === 'begin_ingestion_run')
          return { data: 'run-2', error: null }
        return { data: null, error: null }
      },
    })

    await ingestReal({
      client,
      source,
      records: [],
      pageComplete: false,
      parse: (raw) => raw,
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })

    const finalizeCall = rpcCalls.find(
      (c) => c.name === 'finalize_ingestion_run',
    )
    expect(finalizeCall?.args.p_status).toBe('partial')
  })

  it('isolates a single malformed record and still applies the rest', async () => {
    const applied: unknown[] = []
    const { client } = createFakeClient({
      rpcHandler: (name, args) => {
        if (name === 'begin_ingestion_run')
          return { data: 'run-3', error: null }
        if (name === 'apply_source_listing') {
          applied.push(args.p_external_id)
          return {
            data: [
              {
                outcome: 'created',
                opportunity_id: 'opp',
                source_listing_id: 'sl',
                opportunity_version_id: 'v',
              },
            ],
            error: null,
          }
        }
        return { data: null, error: null }
      },
    })

    const summary = await ingestReal({
      client,
      source,
      records: [{ id: 'good-1' }, { bad: true }],
      pageComplete: true,
      parse: (raw) => {
        if (!('id' in (raw as object))) throw new Error('missing id')
        return raw
      },
      normalize: (raw) => baseListing((raw as { id: string }).id, 'Intern'),
    })

    expect(applied).toEqual(['good-1'])
    expect(summary.recordsNew).toBe(1)
    expect(summary.errorCount).toBe(1)
  })
})
