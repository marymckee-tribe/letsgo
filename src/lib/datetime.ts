import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { Temporal } from 'temporal-polyfill'

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
 * Schedule-X v4.5+ requires event start/end to be `Temporal.ZonedDateTime` (timed)
 * or `Temporal.PlainDate` (all-day) instances — strings are rejected at runtime.
 * Returns null for empty/undefined input so callers can filter the event out.
 */
export function toScheduleXDateTime(
  iso: string | undefined,
  zone: string,
): Temporal.ZonedDateTime | Temporal.PlainDate | null {
  if (!iso) return null
  if (!iso.includes('T')) return Temporal.PlainDate.from(iso)
  const wallClock = formatInTimeZone(new Date(iso), zone, "yyyy-MM-dd'T'HH:mm:ss")
  return Temporal.ZonedDateTime.from(`${wallClock}[${zone}]`)
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
