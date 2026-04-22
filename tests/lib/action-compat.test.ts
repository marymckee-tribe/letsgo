import {
  toLegacyStatus,
  fromLegacyStatus,
  isActionable,
} from '@/lib/action-compat'

describe('action-compat', () => {
  it('maps PROPOSED to PENDING (legacy)', () => {
    expect(toLegacyStatus('PROPOSED')).toBe('PENDING')
  })

  it('maps COMMITTED to APPROVED (legacy)', () => {
    expect(toLegacyStatus('COMMITTED')).toBe('APPROVED')
  })

  it('maps WRITING to PENDING (still actionable from UI perspective)', () => {
    expect(toLegacyStatus('WRITING')).toBe('PENDING')
  })

  it('maps DISMISSED/FAILED/EDITING through to legacy DISMISSED/APPROVED/PENDING', () => {
    expect(toLegacyStatus('DISMISSED')).toBe('DISMISSED')
    expect(toLegacyStatus('FAILED')).toBe('DISMISSED')
    expect(toLegacyStatus('EDITING')).toBe('PENDING')
  })

  it('round-trips legacy PENDING to PROPOSED', () => {
    expect(fromLegacyStatus('PENDING')).toBe('PROPOSED')
  })

  it('flags actionable statuses', () => {
    expect(isActionable('PROPOSED')).toBe(true)
    expect(isActionable('EDITING')).toBe(true)
    expect(isActionable('WRITING')).toBe(false)
    expect(isActionable('COMMITTED')).toBe(false)
    expect(isActionable('DISMISSED')).toBe(false)
    expect(isActionable('FAILED')).toBe(false)
  })
})
