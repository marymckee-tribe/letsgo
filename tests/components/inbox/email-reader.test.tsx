import { render, screen, fireEvent } from '@testing-library/react'
import { EmailReader } from '@/components/inbox/email-reader'
import type { Email, EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

const email: Email = {
  id: 'm1',
  subject: 'Zoo Trip Thursday',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
  classification: 'CALENDAR_EVENT',
  snippet: 'Ms. Redd writes about the Thursday zoo trip. Peanut-free lunches requested. Permission slip due Monday.',
  fullBody: 'Full body of the email with more context that the reader toggle will expose.',
  attachments: [{ id: 'att1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 42_000 }],
  suggestedActions: [],
  date: new Date('2026-04-21T15:00:00').getTime(),
  hubStatus: 'UNREAD',
}

describe('EmailReader', () => {
  it('renders subject, sender name + address, 12-hour timestamp, and Clear button', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.getByText('Zoo Trip Thursday')).toBeInTheDocument()
    expect(screen.getAllByText(/Ms. Redd/)[0]).toBeInTheDocument()
    expect(screen.getByText(/office@blessedsacrament\.org/)).toBeInTheDocument()
    expect(screen.getByText(/3:00 PM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('renders the AI summary inside a boxed block', () => {
    const { container } = render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    const summary = screen.getByText(/Ms\. Redd writes about the Thursday zoo trip/)
    expect(summary).toBeInTheDocument()
    expect(container.querySelector('[data-testid="summary-box"]')).toBeInTheDocument()
  })

  it('hides full email until "Read full email" is clicked', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.queryByText(/Full body of the email/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /read full email/i }))
    expect(screen.getByText(/Full body of the email/)).toBeInTheDocument()
  })

  it('fires onClear when Clear is clicked', () => {
    const onClear = jest.fn()
    render(<EmailReader email={email} profiles={profiles} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalledWith('m1')
  })

  it('renders attachment stubs with filename', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.getByText('permission.pdf')).toBeInTheDocument()
  })

  it('uses text-muted-foreground for metadata, not text-foreground/40', () => {
    const { container } = render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(container.innerHTML).not.toMatch(/text-foreground\/40/)
  })
})
