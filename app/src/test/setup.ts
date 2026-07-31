import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// `test.globals` is intentionally off in vite.config.ts (tests import
// describe/it/expect explicitly), so Testing Library's automatic per-test
// cleanup isn't auto-detected -- register it explicitly instead.
afterEach(() => {
  cleanup()
})
