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

import { render, screen } from '@testing-library/react'
import { ActionDeck } from '@/components/inbox/action-deck'
import type { EmailAction } from '@/lib/store'

const actions: EmailAction[] = [
  { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo', sourceQuote: 'Zoo Thursday.', confidence: 'high', status: 'PROPOSED' },
  { id: 'a2', type: 'TODO', title: 'RSVP', sourceQuote: 'RSVP by Fri.', confidence: 'medium', status: 'PROPOSED' },
]

const defaultProps = {
  emailId: 'e1',
  timeZone: 'America/Los_Angeles',
}

describe('ActionDeck', () => {
  it('renders one card per action with the right primary labels', () => {
    render(<ActionDeck actions={actions} {...defaultProps} />)
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create a todo/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no actions', () => {
    render(<ActionDeck actions={[]} {...defaultProps} />)
    expect(screen.getByText(/no suggested actions/i)).toBeInTheDocument()
  })

  it('hides cards whose action.status is already DISMISSED from server data', () => {
    const withDismissed: EmailAction[] = [
      ...actions,
      { id: 'a3', type: 'TODO', title: 'Dismissed task', sourceQuote: 'q', confidence: 'high', status: 'DISMISSED' },
    ]
    render(<ActionDeck actions={withDismissed} {...defaultProps} />)
    expect(screen.queryByText('Dismissed task')).toBeNull()
    // The two PROPOSED cards are still visible
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
  })

  it('hides cards whose action.status is already COMMITTED from server data', () => {
    const withCommitted: EmailAction[] = [
      ...actions,
      { id: 'a4', type: 'CALENDAR_EVENT', title: 'Committed event', sourceQuote: 'q', confidence: 'high', status: 'COMMITTED' },
    ]
    render(<ActionDeck actions={withCommitted} {...defaultProps} />)
    expect(screen.queryByText('Committed event')).toBeNull()
  })

  it('shows an empty state when all actions are terminal (dismissed/committed)', () => {
    const allTerminal: EmailAction[] = [
      { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo', sourceQuote: 'q', confidence: 'high', status: 'COMMITTED' },
      { id: 'a2', type: 'TODO', title: 'RSVP', sourceQuote: 'q', confidence: 'high', status: 'DISMISSED' },
    ]
    render(<ActionDeck actions={allTerminal} {...defaultProps} />)
    expect(screen.getByText(/no suggested actions/i)).toBeInTheDocument()
  })
})
