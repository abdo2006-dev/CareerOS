#!/usr/bin/env node
/**
 * Loopback-only companion for Personal Mode. The browser can ask it to run
 * ingestion, but it never receives the service-role key used by the CLI.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const host = '127.0.0.1'
const port = Number(process.env.CAREEROS_RUNTIME_PORT ?? 4798)
let activeRefresh = null
let status = {
  state: 'idle',
  lastCompletedAt: null,
  result: null,
  error: null,
}

function conciseOutput(output) {
  const match = output.match(/fetched (\d+) record\(s\)[\s\S]*?-- (\d+) new, (\d+) updated, (\d+) unchanged, (\d+) error\(s\)/)
  if (!match) return { checked: 0, created: 0, updated: 0, unchanged: 0, errors: 0 }
  return {
    checked: Number(match[1]),
    created: Number(match[2]),
    updated: Number(match[3]),
    unchanged: Number(match[4]),
    errors: Number(match[5]),
  }
}

function ingest() {
  if (activeRefresh) return activeRefresh
  status = { ...status, state: 'refreshing', error: null }
  activeRefresh = new Promise((resolve) => {
    const child = spawn('npm', ['run', 'ingest', '--', '--source', 'greenhouse'], {
      cwd: `${root}/ingestion`,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    let errors = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (errors += chunk))
    child.on('close', (code) => {
      if (code === 0) {
        status = {
          state: 'ready',
          lastCompletedAt: new Date().toISOString(),
          result: conciseOutput(output),
          error: null,
        }
      } else {
        status = {
          ...status,
          state: 'failed',
          error: 'The configured sources could not be refreshed. Check that your local runtime is running and try again.',
        }
      }
      activeRefresh = null
      resolve(status)
    })
  })
  return activeRefresh
}

function send(response, code, body) {
  response.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, { 'Access-Control-Allow-Origin': 'http://127.0.0.1:5173', 'Access-Control-Allow-Methods': 'GET, POST' })
    response.end()
    return
  }
  if (request.url === '/status' && request.method === 'GET') return send(response, 200, status)
  if (request.url === '/refresh' && request.method === 'POST') {
    void ingest()
    return send(response, 202, status)
  }
  return send(response, 404, { error: 'Not found' })
}).listen(port, host, () => {
  console.log(`CareerOS local refresh service listening on http://${host}:${port}`)
})

if (process.env.CAREEROS_REFRESH_ON_START === '1') void ingest()
