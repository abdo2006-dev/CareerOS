import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'

describe('router foundation', () => {
  it('uses an in-memory router to honor a bookmarkable nested route', async () => {
    const memoryRouter = createMemoryRouter(
      [{ path: '/profile/experience/new', element: <h1>Add experience</h1> }],
      { initialEntries: ['/profile/experience/new'] },
    )
    render(<RouterProvider router={memoryRouter} />)
    expect(
      await screen.findByRole('heading', { name: 'Add experience' }),
    ).toBeInTheDocument()
  })
})
