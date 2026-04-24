import { Temporal } from 'temporal-polyfill'
import { toScheduleXDateTime, formatInZone, userTimeZone } from '@/lib/datetime'

describe('datetime', () => {
  describe('toScheduleXDateTime', () => {
    it('returns a Temporal.ZonedDateTime for timed events in the target zone', () => {
      const iso = '2026-04-23T15:00:00.000Z' // 15:00 UTC
      const la = toScheduleXDateTime(iso, 'America/Los_Angeles')
      expect(la).toBeInstanceOf(Temporal.ZonedDateTime)
      expect((la as Temporal.ZonedDateTime).toString()).toMatch(/^2026-04-23T08:00:00(-07:00|-08:00)\[America\/Los_Angeles\]/)

      const ny = toScheduleXDateTime(iso, 'America/New_York')
      expect((ny as Temporal.ZonedDateTime).toString()).toMatch(/^2026-04-23T11:00:00(-04:00|-05:00)\[America\/New_York\]/)

      const utc = toScheduleXDateTime(iso, 'UTC')
      expect((utc as Temporal.ZonedDateTime).toString()).toMatch(/^2026-04-23T15:00:00(\+00:00|Z)\[UTC\]/)
    })

    it('returns a Temporal.PlainDate for date-only strings (all-day events)', () => {
      const result = toScheduleXDateTime('2026-04-23', 'America/Los_Angeles')
      expect(result).toBeInstanceOf(Temporal.PlainDate)
      expect((result as Temporal.PlainDate).toString()).toBe('2026-04-23')
    })

    it('returns null for undefined/empty input', () => {
      expect(toScheduleXDateTime(undefined, 'UTC')).toBeNull()
      expect(toScheduleXDateTime('', 'UTC')).toBeNull()
    })
  })

  describe('formatInZone', () => {
    it('formats a 12-hour clock time in the target zone', () => {
      expect(formatInZone('2026-04-23T15:00:00.000Z', 'America/Los_Angeles', 'h:mm a')).toBe('8:00 AM')
      expect(formatInZone('2026-04-23T15:00:00.000Z', 'America/New_York', 'h:mm a')).toBe('11:00 AM')
    })
  })

  describe('userTimeZone', () => {
    it('returns a valid IANA zone string', () => {
      const zone = userTimeZone()
      // IANA zones are either "Region/City" (e.g. "America/Los_Angeles") or a
      // bare identifier like "UTC" (common in CI / node runtimes without Intl data).
      expect(zone).toMatch(/^(UTC|[A-Za-z_]+\/[A-Za-z_]+)/)
    })
  })
})
