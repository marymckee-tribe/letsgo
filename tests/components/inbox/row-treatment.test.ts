import { rowTreatmentFor, shouldIncludeInUnreadCount } from '@/components/inbox/row-treatment'

describe('rowTreatmentFor', () => {
  it('CALENDAR_EVENT: normal row, no waiting badge, not dimmed', () => {
    expect(rowTreatmentFor('CALENDAR_EVENT')).toEqual({
      dimmed: false,
      showWaitingBadge: false,
    })
  })

  it('TODO: normal row', () => {
    expect(rowTreatmentFor('TODO')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('NEEDS_REPLY: normal row', () => {
    expect(rowTreatmentFor('NEEDS_REPLY')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('WAITING_ON: normal row with waiting badge', () => {
    expect(rowTreatmentFor('WAITING_ON')).toEqual({ dimmed: false, showWaitingBadge: true })
  })

  it('FYI: normal row, no badge', () => {
    expect(rowTreatmentFor('FYI')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('NEWSLETTER: dimmed row, no badge', () => {
    expect(rowTreatmentFor('NEWSLETTER')).toEqual({ dimmed: true, showWaitingBadge: false })
  })
})

describe('shouldIncludeInUnreadCount', () => {
  it('excludes NEWSLETTER', () => {
    expect(shouldIncludeInUnreadCount('NEWSLETTER')).toBe(false)
  })

  it('includes all other classifications', () => {
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI'] as const) {
      expect(shouldIncludeInUnreadCount(c)).toBe(true)
    }
  })
})
