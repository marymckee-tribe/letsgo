import { render, screen } from '@testing-library/react'
import { SenderIdentityChip } from '@/components/inbox/sender-identity-chip'
import type { EntityProfile, SenderIdentity } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

describe('SenderIdentityChip', () => {
  it('renders ORG · PERSON when both are present', () => {
    const si: SenderIdentity = { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' }
    render(<SenderIdentityChip senderIdentity={si} sender="office@blessedsacrament.org" profiles={profiles} />)
    expect(screen.getByText(/Blessed Sacrament/)).toBeInTheDocument()
    expect(screen.getByText(/Ellie/)).toBeInTheDocument()
  })

  it('renders just the person when there is no org', () => {
    const si: SenderIdentity = { personId: 'ellie', confidence: 'high' }
    render(<SenderIdentityChip senderIdentity={si} sender="ellie@school.com" profiles={profiles} />)
    expect(screen.getByText('Ellie')).toBeInTheDocument()
  })

  it('falls back to the raw sender when no identity is resolved', () => {
    render(<SenderIdentityChip senderIdentity={undefined} sender="random@example.com" profiles={profiles} />)
    expect(screen.getByText('random@example.com')).toBeInTheDocument()
  })

  it('renders a colored dot', () => {
    const si: SenderIdentity = { personId: 'ellie', confidence: 'high' }
    const { container } = render(<SenderIdentityChip senderIdentity={si} sender="x" profiles={profiles} />)
    expect(container.querySelector('[data-testid="sender-dot"]')).toBeInTheDocument()
  })
})
