import { toScheduleXDateTime, formatInZone, userTimeZone } from '@/lib/datetime'

describe('datetime', () => {
  describe('toScheduleXDateTime', () => {
    it('formats an ISO timestamp into Schedule-X v4 "YYYY-MM-DD HH:mm" in the target zone', () => {
      const iso = '2026-04-23T15:00:00.000Z' // 15:00 UTC
      expect(toScheduleXDateTime(iso, 'America/Los_Angeles')).toBe('2026-04-23 08:00')
      expect(toScheduleXDateTime(iso, 'America/New_York')).toBe('2026-04-23 11:00')
      expect(toScheduleXDateTime(iso, 'UTC')).toBe('2026-04-23 15:00')
    })

    it('returns a date-only string unchanged (all-day events)', () => {
      expect(toScheduleXDateTime('2026-04-23', 'America/Los_Angeles')).toBe('2026-04-23')
    })

    it('returns empty string for undefined/empty input', () => {
      expect(toScheduleXDateTime(undefined, 'UTC')).toBe('')
      expect(toScheduleXDateTime('', 'UTC')).toBe('')
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
      expect(zone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/)
    })
  })
})
