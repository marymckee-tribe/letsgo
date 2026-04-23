// Mock useCommitAction so ActionCard can render without a trpc/QueryClient provider.
jest.mock('@/hooks/use-commit-action', () => ({
  useCommitAction: () => ({
    lastStatus: 'PROPOSED',
    errorMessage: null,
    isPending: false,
    commitCalendar: jest.fn().mockResolvedValue(undefined),
    commitTask: jest.fn().mockResolvedValue(undefined),
    dismiss: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
  }),
}))

import { render, screen, within, fireEvent } from '@testing-library/react'
import InboxPage from '@/app/inbox/page'

const mockUseSearchParams = jest.fn()

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockUseSearchParams(),
}))

jest.mock('@/lib/store', () => {
  const clearMutate = jest.fn()
  const restoreMutate = jest.fn()
  const emails = [
    {
      id: 'm1', subject: 'Zoo trip', sender: 'Ms. Redd <office@blessedsacrament.org>',
      senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
      classification: 'CALENDAR_EVENT', snippet: 'Zoo trip Thursday 8am. Peanut-free lunches.', fullBody: 'fb',
      attachments: [], suggestedActions: [
        { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo trip', sourceQuote: 'Zoo Thursday.', confidence: 'high', status: 'PROPOSED' },
      ],
      date: new Date('2026-04-21T15:00:00').getTime(), hubStatus: 'UNREAD',
    },
    {
      id: 'm2', subject: 'Weekly digest', sender: 'news@substack.com',
      classification: 'NEWSLETTER', snippet: 'Weekly.', fullBody: 'fb',
      attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD',
    },
  ]
  return {
    useHub: () => ({ profiles: [{ id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' }] }),
    useInboxEmails: () => ({ data: { emails } }),
    useClearEmail: () => ({ mutate: clearMutate }),
    useRestoreEmail: () => ({ mutate: restoreMutate }),
    __clearMutate: clearMutate,
    __restoreMutate: restoreMutate,
  }
})

describe('InboxPage', () => {
  beforeEach(() => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams())
  })

  it('renders three landmarks (queue / reader / action deck)', () => {
    render(<InboxPage />)
    expect(screen.getByLabelText(/triage queue/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email reader/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/suggested actions/i)).toBeInTheDocument()
  })

  it('auto-selects the first active email and renders it', () => {
    render(<InboxPage />)
    const reader = screen.getByLabelText(/email reader/i)
    expect(within(reader).getByRole('heading', { name: 'Zoo trip' })).toBeInTheDocument()
  })

  it('shows NEWSLETTER row dimmed and excluded from unread count (count = 1, not 2)', () => {
    render(<InboxPage />)
    expect(screen.getByText(/1 unread/)).toBeInTheDocument()
  })

  it('clicking Clear calls clearMutate with the email id', () => {
    render(<InboxPage />)
    const reader = screen.getByLabelText(/email reader/i)
    fireEvent.click(within(reader).getByRole('button', { name: /clear/i }))
    const { __clearMutate } = jest.requireMock('@/lib/store') as { __clearMutate: jest.Mock }
    expect(__clearMutate).toHaveBeenCalledWith({ emailId: 'm1' })
  })

  it('selects the email from ?thread= query param on mount if present in the list; falls back to first if not present', () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams('thread=m2'))
    const { unmount } = render(<InboxPage />)
    const reader1 = screen.getByLabelText(/email reader/i)
    expect(within(reader1).getByRole('heading', { name: 'Weekly digest' })).toBeInTheDocument()
    expect(within(reader1).queryByRole('heading', { name: 'Zoo trip' })).toBeNull()
    unmount()

    mockUseSearchParams.mockReturnValue(new URLSearchParams('thread=does-not-exist'))
    render(<InboxPage />)
    const reader2 = screen.getByLabelText(/email reader/i)
    expect(within(reader2).getByRole('heading', { name: 'Zoo trip' })).toBeInTheDocument()
  })
})
