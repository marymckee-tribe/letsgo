import { formatInTimeZone } from 'date-fns-tz'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface TimedSlot {
  dateTime: string // RFC3339 with offset
  timeZone: string
}

export interface AllDaySlot {
  date: string // YYYY-MM-DD
}

export function buildCalendarDateTime(input: {
  dateEpochMs: number
  time: string
  timeZone: string
}): TimedSlot {
  if (!HHMM.test(input.time)) {
    throw new Error(`Invalid time format (expected HH:mm): ${input.time}`)
  }
  // The dateEpochMs is midnight UTC for a reference date.
  // Extract the date portion (YYYY-MM-DD) from that UTC midnight.
  const utcDate = new Date(input.dateEpochMs)
  const ymd = utcDate.toISOString().split('T')[0] // e.g., "2026-05-15"

  // Construct the ISO datetime at the specified time in the user's timezone.
  const isoAtTime = `${ymd}T${input.time}:00`
  // Now determine the offset that applies to this datetime in the user's timezone.
  const tempDate = new Date(isoAtTime)
  const offset = formatInTimeZone(tempDate, input.timeZone, 'xxx')

  return {
    dateTime: `${isoAtTime}${offset}`,
    timeZone: input.timeZone,
  }
}

export function buildCalendarAllDay(input: {
  dateEpochMs: number
  timeZone: string
}): AllDaySlot {
  return {
    date: formatInTimeZone(new Date(input.dateEpochMs), input.timeZone, 'yyyy-MM-dd'),
  }
}
