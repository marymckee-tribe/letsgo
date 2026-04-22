import { render, screen, fireEvent } from '@testing-library/react'
import { ActionDeck } from '@/components/inbox/action-deck'
import type { EmailAction } from '@/lib/store'

const actions: EmailAction[] = [
  { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo', sourceQuote: 'Zoo Thursday.', confidence: 'high', status: 'PROPOSED' },
  { id: 'a2', type: 'TODO', title: 'RSVP', sourceQuote: 'RSVP by Fri.', confidence: 'medium', status: 'PROPOSED' },
]

describe('ActionDeck', () => {
  it('renders one card per action with the right primary labels', () => {
    render(<ActionDeck actions={actions} />)
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to google tasks/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no actions', () => {
    render(<ActionDeck actions={[]} />)
    expect(screen.getByText(/no suggested actions/i)).toBeInTheDocument()
  })

  it('dismisses a card from local state when Skip is clicked', () => {
    render(<ActionDeck actions={actions} />)
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /skip/i })[0])
    expect(screen.queryByRole('button', { name: /add to google calendar/i })).toBeNull()
  })
})
