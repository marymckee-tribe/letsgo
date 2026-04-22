import { parseFixture, FIXTURE } from './emails-by-classification'

describe('classification fixtures', () => {
  it('parses cleanly against the shared schema', () => {
    expect(() => parseFixture()).not.toThrow()
  })

  it('covers all 6 classifications exactly once', () => {
    const seen = new Set(FIXTURE.emails.map(e => e.classification))
    expect(seen.size).toBe(6)
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER']) {
      expect(seen.has(c as (typeof FIXTURE.emails)[number]['classification'])).toBe(true)
    }
  })

  it('never produces actions for WAITING_ON / FYI / NEWSLETTER', () => {
    for (const e of FIXTURE.emails) {
      if (['WAITING_ON', 'FYI', 'NEWSLETTER'].includes(e.classification)) {
        expect(e.suggestedActions).toEqual([])
      }
    }
  })
})
