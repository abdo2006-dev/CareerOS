export interface RetryOptions {
  maxAttempts: number
  baseDelayMs: number
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = { maxAttempts: 3, baseDelayMs: 500 }

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Retries only on 429/5xx responses or network errors, per
 * docs/INGESTION_ARCHITECTURE.md #4 -- never on a 4xx response, since that
 * indicates a request the server will never accept regardless of retrying.
 * Honors a numeric `Retry-After` header (seconds) when present.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = DEFAULT_RETRY_OPTIONS,
): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, init)
      const shouldRetry = response.status === 429 || response.status >= 500
      if (!shouldRetry || attempt === options.maxAttempts) return response

      const retryAfterHeader = response.headers.get('retry-after')
      const retryAfterSeconds = retryAfterHeader
        ? Number(retryAfterHeader)
        : NaN
      const delayMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : options.baseDelayMs * 2 ** (attempt - 1)
      await sleep(delayMs)
    } catch (error) {
      lastError = error
      if (attempt === options.maxAttempts) throw error
      await sleep(options.baseDelayMs * 2 ** (attempt - 1))
    }
  }
  throw lastError
}
