import { buildCalendarDateTime, buildCalendarAllDay } from '@/lib/server/tz-helpers'

describe('buildCalendarDateTime', () => {
  it('combines an epoch-ms date and an HH:mm time in the given tz into RFC3339', () => {
    // 2026-05-15 is a Friday. 9:30 AM Pacific = 16:30 UTC.
    const epochMsForThatMorningUtc = Date.UTC(2026, 4, 15, 0, 0, 0) // midnight UTC on the target day
    const result = buildCalendarDateTime({
      dateEpochMs: epochMsForThatMorningUtc,
      time: '09:30',
      timeZone: 'America/Los_Angeles',
    })
    expect(result.timeZone).toBe('America/Los_Angeles')
    // The ISO string must have a -07:00 offset because May 15 is DST.
    expect(result.dateTime).toMatch(/^2026-05-15T09:30:00(-07:00|-08:00)$/)
  })

  it('honors the provided timezone even when the server runs in UTC', () => {
    const epochMs = Date.UTC(2026, 0, 10, 0, 0, 0) // Jan 10 — standard time
    const result = buildCalendarDateTime({
      dateEpochMs: epochMs,
      time: '18:00',
      timeZone: 'America/New_York',
    })
    expect(result.dateTime).toBe('2026-01-10T18:00:00-05:00')
    expect(result.timeZone).toBe('America/New_York')
  })

  it('throws on invalid HH:mm', () => {
    expect(() =>
      buildCalendarDateTime({ dateEpochMs: 0, time: '9:30', timeZone: 'UTC' }),
    ).toThrow(/HH:mm/)
  })
})

describe('buildCalendarAllDay', () => {
  it('returns { date } in YYYY-MM-DD format in the given tz', () => {
    const epochMs = Date.UTC(2026, 4, 15, 23, 0, 0) // 23:00 UTC on May 15
    // In LA that's 16:00 on May 15 — still the 15th locally.
    const result = buildCalendarAllDay({
      dateEpochMs: epochMs,
      timeZone: 'America/Los_Angeles',
    })
    expect(result.date).toBe('2026-05-15')
  })
})
