import { formatInTimeZone, toZonedTime } from 'date-fns-tz'

/**
 * Returns the browser's IANA time-zone string (falls back to UTC on the server).
 * Use this as the default zone for user-visible formatting.
 */
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Schedule-X v4 expects timed events as "YYYY-MM-DD HH:mm" **local** to the viewer.
 * All-day events are passed through unchanged ("YYYY-MM-DD").
 * See https://schedule-x.dev/docs/calendar/events
 */
export function toScheduleXDateTime(iso: string | undefined, zone: string): string {
  if (!iso) return ''
  if (!iso.includes('T')) return iso // date-only → all-day
  return formatInTimeZone(new Date(iso), zone, 'yyyy-MM-dd HH:mm')
}

/**
 * Format an ISO timestamp in the target zone using a date-fns format string.
 * Use 12-hour clock strings (e.g. "h:mm a") per the user's UI preferences.
 */
export function formatInZone(iso: string, zone: string, fmt: string): string {
  return formatInTimeZone(new Date(iso), zone, fmt)
}

/**
 * Convert an ISO timestamp into a Date representing the same wall-clock
 * time as viewed in `zone`. Useful for day-bucketing events by the viewer's calendar day.
 */
export function zonedDate(iso: string, zone: string): Date {
  return toZonedTime(new Date(iso), zone)
}
