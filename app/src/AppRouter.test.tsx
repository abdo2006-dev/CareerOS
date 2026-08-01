import { render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { describe, expect, it } from 'vitest'

describe('router foundation', () => {
  it('uses an in-memory router to honor a bookmarkable route', async () => {
    const memoryRouter = createMemoryRouter(
      [{ path: '/profile/education', element: <h1>Education</h1> }],
      { initialEntries: ['/profile/education'] },
    )
    render(<RouterProvider router={memoryRouter} />)
    expect(
      await screen.findByRole('heading', { name: 'Education' }),
    ).toBeInTheDocument()
  })
})
