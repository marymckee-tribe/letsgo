import { render, screen, fireEvent } from '@testing-library/react'
import { ActionCard } from '@/components/inbox/action-card'
import type { EmailAction } from '@/lib/store'

const calAction: EmailAction = {
  id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo trip',
  date: new Date('2026-04-23T08:00:00').getTime(), time: '8:00 AM', context: 'FAMILY',
  sourceQuote: 'Zoo trip Thursday 8am.', confidence: 'high', status: 'PROPOSED',
}

const todoAction: EmailAction = {
  id: 'a2', type: 'TODO', title: 'Send RSVP',
  sourceQuote: 'please RSVP by Friday.', confidence: 'high', status: 'PROPOSED',
}

const replyAction: EmailAction = {
  id: 'a3', type: 'NEEDS_REPLY', title: 'Re: Zoo trip',
  sourceQuote: 'Let us know if she can come.', confidence: 'high', status: 'PROPOSED',
}

describe('ActionCard', () => {
  it('CALENDAR_EVENT: renders title, date, time, location, context fields and "Add to Google Calendar" button', () => {
    render(<ActionCard action={calAction} onSkip={() => {}} />)
    expect(screen.getByLabelText(/title/i)).toHaveValue('Zoo trip')
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time/i)).toHaveValue('8:00 AM')
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/context/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('TODO: renders "Add to Google Tasks" button and due-date field', () => {
    render(<ActionCard action={todoAction} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /add to google tasks/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument()
  })

  it('NEEDS_REPLY: renders "Send reply" button and textarea', () => {
    render(<ActionCard action={replyAction} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /send reply/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('clicking the primary button is a no-op in Phase 3 (fires onNoop callback, not a commit)', () => {
    const onNoop = jest.fn()
    render(<ActionCard action={calAction} onSkip={() => {}} onNoop={onNoop} />)
    fireEvent.click(screen.getByRole('button', { name: /add to google calendar/i }))
    expect(onNoop).toHaveBeenCalled()
  })

  it('Skip fires onSkip with the action id', () => {
    const onSkip = jest.fn()
    render(<ActionCard action={calAction} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalledWith('a1')
  })

  it('shows a ? glyph in the header when confidence is low', () => {
    const low = { ...calAction, confidence: 'low' as const }
    render(<ActionCard action={low} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /low confidence/i })).toBeInTheDocument()
  })

  it('does not show the ? glyph for medium or high confidence', () => {
    render(<ActionCard action={calAction} onSkip={() => {}} />)
    expect(screen.queryByRole('button', { name: /low confidence/i })).toBeNull()
  })
})
