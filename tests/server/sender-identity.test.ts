import { resolveDirectSenderIdentity, parseFrom } from '@/lib/server/sender-identity'
import type { EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  {
    id: 'ellie', name: 'Ellie', type: 'Child',
    currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    knownDomains: ['blessedsacrament.org'],
    knownSenders: ['Ms. Redd <office@blessedsacrament.org>'],
  },
  {
    id: 'annie', name: 'Annie', type: 'Child',
    currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    knownDomains: ['audaucy.org'],
  },
]

describe('parseFrom', () => {
  it('parses "Name <email>"', () => {
    expect(parseFrom('Ms. Redd <office@blessedsacrament.org>')).toEqual({
      name: 'Ms. Redd',
      email: 'office@blessedsacrament.org',
    })
  })
  it('parses bare email', () => {
    expect(parseFrom('office@blessedsacrament.org')).toEqual({
      name: '',
      email: 'office@blessedsacrament.org',
    })
  })
  it('handles quoted names', () => {
    expect(parseFrom('"Ms. Redd" <office@blessedsacrament.org>')).toEqual({
      name: 'Ms. Redd',
      email: 'office@blessedsacrament.org',
    })
  })
  it('handles names with commas via quoted form', () => {
    expect(parseFrom('"Redd, Ms." <office@blessedsacrament.org>')).toEqual({
      name: 'Redd, Ms.',
      email: 'office@blessedsacrament.org',
    })
  })
  it('returns empty name+email for unparsable input', () => {
    expect(parseFrom('not an address at all')).toEqual({ name: '', email: '' })
  })
})

describe('resolveDirectSenderIdentity', () => {
  it('matches by exact known sender string → high confidence', () => {
    const match = resolveDirectSenderIdentity('Ms. Redd <office@blessedsacrament.org>', profiles)
    expect(match).toEqual({ personId: 'ellie', confidence: 'high' })
  })

  it('matches by domain when sender string is not on the known list → medium confidence', () => {
    const match = resolveDirectSenderIdentity('Principal <principal@blessedsacrament.org>', profiles)
    expect(match).toEqual({ personId: 'ellie', confidence: 'medium' })
  })

  it('matches subdomain against registered parent domain', () => {
    const match = resolveDirectSenderIdentity('<billing@accounts.audaucy.org>', profiles)
    expect(match).toEqual({ personId: 'annie', confidence: 'medium' })
  })

  it('returns null when unknown', () => {
    const match = resolveDirectSenderIdentity('Random <noreply@example.com>', profiles)
    expect(match).toBeNull()
  })

  it('is case-insensitive on email comparison', () => {
    const match = resolveDirectSenderIdentity('OFFICE@BlessedSacrament.ORG', profiles)
    expect(match?.personId).toBe('ellie')
  })

  it('returns null for unparsable From headers', () => {
    const match = resolveDirectSenderIdentity('not an address', profiles)
    expect(match).toBeNull()
  })
})
