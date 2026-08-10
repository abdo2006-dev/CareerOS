export interface RefreshResult {
  checked: number
  created: number
  updated: number
  unchanged: number
  errors: number
}

export interface RefreshStatus {
  state: 'idle' | 'refreshing' | 'ready' | 'failed'
  lastCompletedAt: string | null
  result: RefreshResult | null
  error: string | null
}

const runtimeUrl = import.meta.env.VITE_PERSONAL_RUNTIME_URL

async function request(
  path: string,
  init?: RequestInit,
): Promise<RefreshStatus | null> {
  if (!runtimeUrl) return null
  try {
    const response = await fetch(`${runtimeUrl}${path}`, init)
    if (!response.ok) return null
    return (await response.json()) as RefreshStatus
  } catch {
    return null
  }
}

export const personalRuntime = {
  status: () => request('/status'),
  refresh: () => request('/refresh', { method: 'POST' }),
  enabled: Boolean(runtimeUrl),
}
