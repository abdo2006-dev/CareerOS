import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  classifyEmploymentType,
  classifyOpportunityKind,
  classifyRemoteMode,
  fetchGreenhouseBoard,
  normalizeGreenhouseJob,
  parseGreenhouseJob,
} from '../../src/adapters/greenhouse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixturesDir = path.join(__dirname, '..', 'fixtures')

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8'))
}

function readFixtureRaw(name: string): string {
  return readFileSync(path.join(fixturesDir, name), 'utf8')
}

describe('parseGreenhouseJob', () => {
  it('parses a valid job record', () => {
    const board = readFixture('greenhouse-board-valid.json') as {
      jobs: unknown[]
    }
    const job = parseGreenhouseJob(board.jobs[0])
    expect(job.id).toBe(1000001)
    expect(job.title).toBe('Working Student, Flight Software')
    expect(job.locationName).toBe('Munich, Germany')
  })

  it('handles missing optional fields gracefully', () => {
    const job = parseGreenhouseJob({
      id: 42,
      title: 'Minimal Job',
      absolute_url:
        'https://job-boards.greenhouse.io/synthetic-example/jobs/42',
      content: '<p>Minimal.</p>',
    })
    expect(job.locationName).toBeNull()
    expect(job.updatedAt).toBeNull()
    expect(job.applicationDeadline).toBeNull()
    expect(job.companyName).toBeNull()
    expect(job.departments).toEqual([])
  })

  it('throws on a record missing a required field (isolatable per-record)', () => {
    const board = readFixture(
      'greenhouse-board-with-malformed-record.json',
    ) as {
      jobs: unknown[]
    }
    expect(() => parseGreenhouseJob(board.jobs[1])).toThrow(/id/)
  })

  it('throws on a non-object record', () => {
    expect(() => parseGreenhouseJob('not an object')).toThrow()
  })
})

describe('classification heuristics', () => {
  it('classifies working-student and internship titles', () => {
    expect(classifyOpportunityKind('Working Student, Flight Software')).toBe(
      'working_student',
    )
    expect(classifyOpportunityKind('Software Engineering Intern')).toBe(
      'internship',
    )
    expect(classifyOpportunityKind('Senior Staff Engineer')).toBe('other')
  })

  it('derives employment type from kind first', () => {
    expect(classifyEmploymentType('internship', 'Any Title')).toBe('internship')
    expect(classifyEmploymentType('other', 'Part-time Analyst')).toBe(
      'part_time',
    )
    expect(classifyEmploymentType('other', 'Staff Engineer')).toBe('full_time')
  })

  it('classifies remote mode from the location text', () => {
    expect(classifyRemoteMode('Remote - Germany')).toBe('remote')
    expect(classifyRemoteMode('Hybrid, Munich')).toBe('hybrid')
    expect(classifyRemoteMode('Munich, Germany')).toBe('onsite')
    expect(classifyRemoteMode(null)).toBe('unknown')
  })
})

describe('normalizeGreenhouseJob', () => {
  it('sanitizes content and normalizes the URL deterministically', () => {
    const board = readFixture('greenhouse-board-valid.json') as {
      jobs: unknown[]
    }
    const job = parseGreenhouseJob(board.jobs[0])
    const normalized = normalizeGreenhouseJob(job, {
      display_name: 'Fallback Inc.',
    })
    expect(normalized.externalId).toBe('1000001')
    expect(normalized.description).not.toMatch(/<[a-z]/i)
    expect(normalized.description).toContain('autonomy team')
    expect(normalized.organization).toBe('Synthetic Example GmbH')
    expect(normalized.canonicalUrl).toBe(normalized.applicationUrl)
  })

  it('falls back to the source display name when company_name is absent', () => {
    const job = parseGreenhouseJob({
      id: 7,
      title: 'Role',
      absolute_url: 'https://job-boards.greenhouse.io/synthetic-example/jobs/7',
      content: '<p>Body</p>',
    })
    const normalized = normalizeGreenhouseJob(job, {
      display_name: 'Fallback Inc.',
    })
    expect(normalized.organization).toBe('Fallback Inc.')
  })
})

describe('fetchGreenhouseBoard', () => {
  let server: Server | undefined

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()))
      server = undefined
    }
  })

  async function listen(
    handler: (
      req: import('node:http').IncomingMessage,
      res: import('node:http').ServerResponse,
    ) => void,
  ): Promise<string> {
    server = createServer(handler)
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    )
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('failed to bind')
    return `http://127.0.0.1:${address.port}/v1/boards/synthetic-example/jobs`
  }

  it('returns a complete result for a valid response', async () => {
    const body = readFixtureRaw('greenhouse-board-valid.json')
    const url = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
    })
    const result = await fetchGreenhouseBoard(url)
    expect(result.pageComplete).toBe(true)
    expect(result.records).toHaveLength(2)
  })

  it('reports incomplete on a non-2xx response', async () => {
    const url = await listen((req, res) => {
      res.writeHead(404)
      res.end('not found')
    })
    const result = await fetchGreenhouseBoard(url)
    expect(result.pageComplete).toBe(false)
    expect(result.records).toHaveLength(0)
  })

  it('reports incomplete on a malformed (non-JSON) body', async () => {
    const url = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end('{not valid json')
    })
    const result = await fetchGreenhouseBoard(url)
    expect(result.pageComplete).toBe(false)
  })

  it('reports incomplete when the response has no jobs array', async () => {
    const url = await listen((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ unexpected: true }))
    })
    const result = await fetchGreenhouseBoard(url)
    expect(result.pageComplete).toBe(false)
  })

  it('retries once on a 500 and succeeds on the next attempt', async () => {
    let attempt = 0
    const body = readFixtureRaw('greenhouse-board-valid.json')
    const url = await listen((req, res) => {
      attempt += 1
      if (attempt === 1) {
        res.writeHead(500)
        res.end('server error')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
    })
    const result = await fetchGreenhouseBoard(url)
    expect(attempt).toBe(2)
    expect(result.pageComplete).toBe(true)
    expect(result.records).toHaveLength(2)
  })

  it('sends an honest, non-spoofed User-Agent header', async () => {
    let seenUserAgent = ''
    const body = readFixtureRaw('greenhouse-board-valid.json')
    const url = await listen((req, res) => {
      seenUserAgent = req.headers['user-agent'] ?? ''
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
    })
    await fetchGreenhouseBoard(url)
    expect(seenUserAgent).toContain('CareerOS-Ingestion')
    expect(seenUserAgent.toLowerCase()).not.toContain('mozilla')
  })
})
