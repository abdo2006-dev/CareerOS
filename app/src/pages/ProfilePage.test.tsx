import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { ProfilePage } from './ProfilePage'

const getProfile = vi.fn()
const listEducation = vi.fn()
const listExperience = vi.fn()
const sectionState = vi.fn()

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}))
vi.mock('../lib/profileRepository', () => ({
  profileRepository: {
    get: (...args: unknown[]) => getProfile(...args),
    create: vi.fn(),
    update: vi.fn(),
  },
}))
vi.mock('../lib/educationRepository', () => ({
  educationRepository: { list: (...args: unknown[]) => listEducation(...args) },
}))
vi.mock('../lib/experienceRepository', () => ({
  experienceRepository: {
    list: (...args: unknown[]) => listExperience(...args),
  },
}))
vi.mock('../lib/profileReviewRepository', () => ({
  profileReviewRepository: {
    state: (...args: unknown[]) => sectionState(...args),
  },
}))

describe('ProfilePage', () => {
  it('shows a loading state before profile data resolves', () => {
    getProfile.mockReturnValue(new Promise(() => {}))
    listEducation.mockResolvedValue({ data: [], error: null })
    listExperience.mockResolvedValue({ data: [], error: null })
    sectionState.mockResolvedValue({ data: [], error: null })
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })
  it('shows actionable partial completeness without a percentage', async () => {
    getProfile.mockResolvedValue({ data: { user_id: 'user-1' }, error: null })
    listEducation.mockResolvedValue({ data: [], error: null })
    listExperience.mockResolvedValue({ data: [], error: null })
    sectionState.mockResolvedValue({
      data: [
        {
          section_key: 'basic_profile',
          content_revision: 1,
          reviewed_content_revision: 1,
        },
        {
          section_key: 'education',
          content_revision: 0,
          reviewed_content_revision: null,
        },
        {
          section_key: 'experience',
          content_revision: 0,
          reviewed_content_revision: null,
        },
      ],
      error: null,
    })
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    )
    expect(
      await screen.findByText(/add or select primary education/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /not yet available/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Projects are not yet available/i),
    ).toBeInTheDocument()
  })
})
