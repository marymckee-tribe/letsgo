import { render, screen, fireEvent, act } from '@testing-library/react'
import { ActionCardInner } from '@/components/inbox/action-card'
import type { EmailAction } from '@/lib/store'
import type { CommitShape } from '@/components/inbox/action-card'

// ─── fixtures ────────────────────────────────────────────────────────────────

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

function makeCommit(overrides: Partial<CommitShape> = {}): CommitShape {
  return {
    lastStatus: 'PROPOSED',
    errorMessage: null,
    isPending: false,
    commitCalendar: jest.fn().mockResolvedValue(undefined),
    commitTask: jest.fn().mockResolvedValue(undefined),
    dismiss: jest.fn().mockResolvedValue(undefined),
    retry: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

// ─── PROPOSED-state tests (preview card) ─────────────────────────────────────

describe('ActionCard — PROPOSED state', () => {
  it('CALENDAR_EVENT: renders title, meta (date · time · context), and "Add to calendar" button — no form fields', () => {
    render(<ActionCardInner action={calAction} commit={makeCommit()} />)
    expect(screen.getByRole('heading', { name: 'Zoo trip', level: 4 })).toBeInTheDocument()
    expect(screen.getByText(/8:00 AM/)).toBeInTheDocument()
    expect(screen.getByText(/FAMILY/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/title/i)).toBeNull()
    expect(screen.queryByLabelText(/date/i)).toBeNull()
  })

  it('TODO: renders "Create a todo" button and "Due <date>" meta — no form fields', () => {
    render(<ActionCardInner action={todoAction} commit={makeCommit()} />)
    expect(screen.getByRole('heading', { name: 'Send RSVP', level: 4 })).toBeInTheDocument()
    expect(screen.getByText(/Due /i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create a todo/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByLabelText(/due date/i)).toBeNull()
  })

  it('NEEDS_REPLY: renders "Write a reply" button and the subject as the title — no textarea', () => {
    render(<ActionCardInner action={replyAction} commit={makeCommit()} />)
    expect(screen.getByRole('heading', { name: 'Re: Zoo trip', level: 4 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /write a reply/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('clicking the primary button on CALENDAR_EVENT calls commitCalendar', async () => {
    const commit = makeCommit()
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    })
    expect(commit.commitCalendar).toHaveBeenCalled()
  })

  it('clicking the primary button on TODO calls commitTask', async () => {
    const commit = makeCommit()
    render(<ActionCardInner action={todoAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /create a todo/i }))
    })
    expect(commit.commitTask).toHaveBeenCalled()
  })

  it('Dismiss button calls commit.dismiss with the action id', async () => {
    const commit = makeCommit()
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    })
    expect(commit.dismiss).toHaveBeenCalled()
  })

  it('shows a ? glyph in the header when confidence is low', () => {
    const low = { ...calAction, confidence: 'low' as const }
    render(<ActionCardInner action={low} commit={makeCommit()} />)
    expect(screen.getByRole('button', { name: /low confidence/i })).toBeInTheDocument()
  })

  it('does not show the ? glyph for high confidence', () => {
    render(<ActionCardInner action={calAction} commit={makeCommit()} />)
    expect(screen.queryByRole('button', { name: /low confidence/i })).toBeNull()
  })

  it('buttons are disabled while isPending', () => {
    const commit = makeCommit({ isPending: true })
    render(<ActionCardInner action={calAction} commit={commit} />)
    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeDisabled()
  })
})

// ─── COMMITTED state ─────────────────────────────────────────────────────────

describe('ActionCard — COMMITTED state', () => {
  it('renders a ✓ Done banner instead of CTA buttons', () => {
    const commit = makeCommit({ lastStatus: 'COMMITTED' })
    render(<ActionCardInner action={calAction} commit={commit} />)
    expect(screen.getByText(/✓ Done/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to calendar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull()
  })

  it('renders a Google Calendar link when googleId is present', () => {
    const commit = makeCommit({ lastStatus: 'COMMITTED' })
    const withGoogleId = { ...calAction, googleId: 'gid_abc' }
    render(<ActionCardInner action={withGoogleId} commit={commit} />)
    const link = screen.getByRole('link', { name: /view in google calendar/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', expect.stringContaining('gid_abc'))
  })

  it('shows COMMITTED when action.status is already COMMITTED and lastStatus is PROPOSED', () => {
    const commit = makeCommit({ lastStatus: 'PROPOSED' })
    const alreadyCommitted = { ...calAction, status: 'COMMITTED' as const }
    render(<ActionCardInner action={alreadyCommitted} commit={commit} />)
    expect(screen.getByText(/✓ Done/i)).toBeInTheDocument()
  })
})

// ─── FAILED state ────────────────────────────────────────────────────────────

describe('ActionCard — FAILED state', () => {
  it('renders the errorMessage and Retry + Dismiss buttons', () => {
    const commit = makeCommit({ lastStatus: 'FAILED', errorMessage: 'Google API returned 500' })
    render(<ActionCardInner action={calAction} commit={commit} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Google API returned 500')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add to calendar/i })).toBeNull()
  })

  it('Retry button calls commit.retry', async () => {
    const commit = makeCommit({ lastStatus: 'FAILED', errorMessage: 'oops' })
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    })
    expect(commit.retry).toHaveBeenCalled()
  })
})

// ─── CONFLICT duplicate-warning dialog ───────────────────────────────────────

describe('ActionCard — CONFLICT duplicate-warning dialog', () => {
  it('shows the duplicate-warning dialog when commitCalendar throws a CONFLICT message', async () => {
    const commit = makeCommit({
      commitCalendar: jest.fn().mockRejectedValue(
        new Error('An event titled "Ellie zoo trip" already exists near that time'),
      ),
    })
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    })
    expect(screen.getByRole('dialog', { name: /duplicate event warning/i })).toBeInTheDocument()
    expect(screen.getByText(/Ellie zoo trip/)).toBeInTheDocument()
  })

  it('"Add anyway" calls commitCalendar with force: true', async () => {
    const commit = makeCommit({
      commitCalendar: jest.fn()
        .mockRejectedValueOnce(new Error('An event titled "Ellie zoo trip" already exists near that time'))
        .mockResolvedValueOnce(undefined),
    })
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add anyway/i }))
    })
    expect(commit.commitCalendar).toHaveBeenNthCalledWith(2, { force: true })
  })

  it('"Cancel" dismisses the duplicate dialog', async () => {
    const commit = makeCommit({
      commitCalendar: jest.fn().mockRejectedValue(
        new Error('An event titled "Ellie zoo trip" already exists near that time'),
      ),
    })
    render(<ActionCardInner action={calAction} commit={commit} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /add to calendar/i }))
    })
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
