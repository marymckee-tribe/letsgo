import { render, screen, fireEvent } from '@testing-library/react'
import { QueueRow } from '@/components/inbox/queue-row'
import type { Email, EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

const baseEmail: Email = {
  id: 'm1',
  accountEmail: 'mary@tribe.ai',
  subject: 'Zoo Trip Thursday',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
  classification: 'CALENDAR_EVENT',
  snippet: 'Zoo trip Thursday 8am. Please send peanut-free lunches.',
  fullBody: '',
  attachments: [],
  suggestedActions: [
    { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo trip', sourceQuote: 'Zoo trip Thursday 8am.', confidence: 'high', status: 'PROPOSED' },
  ],
  date: Date.now(),
  hubStatus: 'UNREAD',
}

describe('QueueRow', () => {
  it('renders subject, summary, sender identity, and action badge', () => {
    render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('Zoo Trip Thursday')).toBeInTheDocument()
    expect(screen.getByText(/Zoo trip Thursday 8am/)).toBeInTheDocument()
    expect(screen.getByText(/Blessed Sacrament/)).toBeInTheDocument()
    expect(screen.getByText('CAL')).toBeInTheDocument()
  })

  it('shows ⏳ waiting badge when classification is WAITING_ON', () => {
    const e = { ...baseEmail, classification: 'WAITING_ON' as const }
    render(<QueueRow email={e} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(screen.getByText(/Waiting on/)).toBeInTheDocument()
  })

  it('dims the row when classification is NEWSLETTER', () => {
    const e = { ...baseEmail, classification: 'NEWSLETTER' as const }
    const { container } = render(<QueueRow email={e} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(container.firstChild).toHaveClass('opacity-60')
  })

  it('applies selected styling when selected', () => {
    const { container } = render(<QueueRow email={baseEmail} profiles={profiles} selected={true} onSelect={() => {}} />)
    expect(container.firstChild).toHaveClass('bg-foreground')
  })

  it('fires onSelect when clicked', () => {
    const onSelect = jest.fn()
    render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('m1')
  })

  it('uses text-muted-foreground for small labels, never text-foreground/40', () => {
    const { container } = render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(container.innerHTML).not.toMatch(/text-foreground\/40/)
  })
})
