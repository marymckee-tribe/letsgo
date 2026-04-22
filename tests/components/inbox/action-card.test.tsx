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
  date: new Date('2026-04-25T12:00:00').getTime(), context: 'FAMILY',
  sourceQuote: 'please RSVP by Friday.', confidence: 'high', status: 'PROPOSED',
}

const replyAction: EmailAction = {
  id: 'a3', type: 'NEEDS_REPLY', title: 'Re: Zoo trip',
  sourceQuote: 'Let us know if she can come.', confidence: 'high', status: 'PROPOSED',
}

describe('ActionCard', () => {
  it('CALENDAR_EVENT: renders title, meta (date · time · context), and "Add to calendar" button — no form fields', () => {
    render(<ActionCard action={calAction} onSkip={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Zoo trip', level: 4 })).toBeInTheDocument()
    expect(screen.getByText(/8:00 AM/)).toBeInTheDocument()
    expect(screen.getByText(/FAMILY/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/title/i)).toBeNull()
    expect(screen.queryByLabelText(/date/i)).toBeNull()
  })

  it('TODO: renders "Create a todo" button and "Due <date>" meta — no form fields', () => {
    render(<ActionCard action={todoAction} onSkip={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Send RSVP', level: 4 })).toBeInTheDocument()
    expect(screen.getByText(/Due /i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create a todo/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/due date/i)).toBeNull()
  })

  it('NEEDS_REPLY: renders "Write a reply" button and the subject as the title — no textarea', () => {
    render(<ActionCard action={replyAction} onSkip={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Re: Zoo trip', level: 4 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /write a reply/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('clicking the primary button is a no-op in Phase 3 (fires onNoop callback, not a commit)', () => {
    const onNoop = jest.fn()
    render(<ActionCard action={calAction} onSkip={() => {}} onNoop={onNoop} />)
    fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
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
