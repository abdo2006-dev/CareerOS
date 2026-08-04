import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApplicationDetailPage } from './ApplicationDetailPage'

const get = vi.fn()
const updateStatus = vi.fn()
const updateFields = vi.fn()
const remove = vi.fn()
const getVersion = vi.fn()
const prepGet = vi.fn()
const prepUpsert = vi.fn()
const navigate = vi.fn()

vi.mock('react-router', async () => {
  const actual =
    await vi.importActual<typeof import('react-router')>('react-router')
  return { ...actual, useNavigate: () => navigate }
})
vi.mock('../lib/applicationRepository', () => ({
  applicationRepository: {
    get: (...args: unknown[]) => get(...args),
    updateStatus: (...args: unknown[]) => updateStatus(...args),
    updateFields: (...args: unknown[]) => updateFields(...args),
    remove: (...args: unknown[]) => remove(...args),
  },
}))
vi.mock('../lib/opportunityRepository', () => ({
  opportunityRepository: {
    getVersion: (...args: unknown[]) => getVersion(...args),
  },
}))
vi.mock('../lib/interviewPrepRepository', () => ({
  interviewPrepRepository: {
    get: (...args: unknown[]) => prepGet(...args),
    upsert: (...args: unknown[]) => prepUpsert(...args),
  },
}))

const sharedApp = {
  id: 'app-1',
  user_id: 'user-1',
  opportunity_version_id: 'ver-1',
  private_opportunity_id: null,
  private_opportunity_snapshot: null,
  status: 'preparing' as const,
  applied_at: null,
  status_updated_at: '2026-08-01T00:00:00Z',
  next_action: null,
  next_action_due_at: null,
  notes: null,
  contact_note: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
}

const version = {
  id: 'ver-1',
  opportunity_id: 'opp-1',
  title: 'Senior Data Scientist',
  organization: 'KONUX',
  description: 'About us: KONUX builds sensors.',
  location_text: 'Munich',
  remote_mode: 'onsite',
  opportunity_kind: 'other',
  employment_type: 'full_time',
  application_url: 'https://job-boards.greenhouse.io/konux/jobs/1',
  posted_at: null,
  application_deadline: null,
  captured_at: '2026-08-01T00:00:00Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/applications/app-1']}>
      <Routes>
        <Route
          path="/applications/:applicationId"
          element={<ApplicationDetailPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => vi.resetAllMocks())

describe('ApplicationDetailPage', () => {
  it('shows a missing state for a deleted application', async () => {
    get.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument()
  })

  it('renders the pinned listing snapshot beside interview prep', async () => {
    get.mockResolvedValue({ data: sharedApp, error: null })
    getVersion.mockResolvedValue({ data: version, error: null })
    prepGet.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Senior Data Scientist' }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/About us: KONUX builds sensors\./),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/exact content saved at application time/i),
    ).toBeInTheDocument()
    const applyLink = screen.getByRole('link', {
      name: /authoritative external application page/i,
    })
    expect(applyLink).toHaveAttribute('target', '_blank')
    expect(applyLink).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('changes status and auto-sets an applied date', async () => {
    get.mockResolvedValue({ data: sharedApp, error: null })
    getVersion.mockResolvedValue({ data: version, error: null })
    prepGet.mockResolvedValue({ data: null, error: null })
    updateStatus.mockResolvedValue({
      data: {
        ...sharedApp,
        status: 'applied',
        applied_at: '2026-08-04T00:00:00Z',
      },
      error: null,
    })
    renderPage()
    await screen.findByRole('heading', { name: 'Senior Data Scientist' })
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'applied')
    expect(updateStatus).toHaveBeenCalledWith('app-1', 'applied')
  })

  it('saves interview prep notes', async () => {
    get.mockResolvedValue({ data: sharedApp, error: null })
    getVersion.mockResolvedValue({ data: version, error: null })
    prepGet.mockResolvedValue({ data: null, error: null })
    prepUpsert.mockResolvedValue({
      data: {
        id: 'prep-1',
        application_id: 'app-1',
        responsibilities_to_discuss: null,
        required_technologies: null,
        topics_to_revise: null,
        likely_questions: 'Tell me about a model you deployed.',
        questions_to_ask: null,
        interview_date: null,
        interview_format: null,
        reflections: null,
      },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'Senior Data Scientist' })
    await user.type(
      screen.getByLabelText('Likely interview questions'),
      'Tell me about a model you deployed.',
    )
    await user.click(
      screen.getByRole('button', { name: /save interview prep/i }),
    )
    expect(prepUpsert).toHaveBeenCalledWith(
      'app-1',
      expect.objectContaining({
        likely_questions: 'Tell me about a model you deployed.',
      }),
    )
    expect(
      await screen.findByText(/interview prep notes saved/i),
    ).toBeInTheDocument()
  })

  it('renders a manual application snapshot without fetching a shared version', async () => {
    const manualApp = {
      ...sharedApp,
      opportunity_version_id: null,
      private_opportunity_id: 'priv-1',
      private_opportunity_snapshot: {
        title: 'Research Assistant',
        organization_name: 'Fraunhofer IWES',
        description_text: 'Support the sensor team.',
        application_url: null,
        source_url: 'https://jobs.fraunhofer.de/example',
      },
    }
    get.mockResolvedValue({ data: manualApp, error: null })
    prepGet.mockResolvedValue({ data: null, error: null })
    renderPage()
    expect(
      await screen.findByRole('heading', { name: 'Research Assistant' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Support the sensor team.')).toBeInTheDocument()
    expect(getVersion).not.toHaveBeenCalled()
  })
})
