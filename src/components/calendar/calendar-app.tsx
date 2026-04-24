"use client"

// Schedule-X's bundle uses `Temporal` as a bare global reference (no import).
// Install the polyfill on globalThis before any Schedule-X module runs, so
// `instanceof Temporal.ZonedDateTime` checks inside the library succeed.
import 'temporal-polyfill/global'

import { useEffect, useMemo } from 'react'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { Temporal } from 'temporal-polyfill'
import type { CalendarEvent } from '@/lib/store'
import { toScheduleXDateTime, userTimeZone } from '@/lib/datetime'
import { getCalendarColor, DEFAULT_CALENDAR_COLOR_ID } from '@/lib/calendar-colors'

// Schedule-X v4.5 requires start/end as Temporal.ZonedDateTime (timed)
// or Temporal.PlainDate (all-day) — strings are rejected at runtime.
interface SxEvent {
  id: string | number
  title: string
  start: Temporal.ZonedDateTime | Temporal.PlainDate
  end: Temporal.ZonedDateTime | Temporal.PlainDate
  calendarId: string
}

export interface CalendarAppProps {
  events: CalendarEvent[]
  onEventClick?: (eventId: string) => void
  /** Maps raw calendarId → palette id (or null). Used to tint events per-calendar. */
  calendarColors?: Map<string, string | null>
}

// Schedule-X v4 validates event ids against /^[a-zA-Z0-9_-]*$/ (see validateEvents
// in @schedule-x/calendar core.js) — Google event ids often contain characters
// outside that set, so sanitize here.
function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_')
}

export function CalendarApp({ events, onEventClick, calendarColors }: CalendarAppProps) {
  const zone = userTimeZone()

  // Map sanitized Schedule-X ids back to the original CalendarEvent.id so
  // onEventClick can hand the real id to the drawer.
  const idToOriginal = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of events) m.set(sanitizeId(e.id), e.id)
    return m
  }, [events])

  const sxEvents = useMemo<SxEvent[]>(() => {
    const out: SxEvent[] = []
    for (const e of events) {
      const start = toScheduleXDateTime(e.start, zone)
      if (!start) continue
      const end = toScheduleXDateTime(e.end ?? e.start, zone) ?? start
      out.push({
        id: sanitizeId(e.id),
        title: e.title,
        start,
        end,
        calendarId: e.calendarId ? sanitizeId(e.calendarId) : 'default',
      })
    }
    return out
  }, [events, zone])

  // Build the Schedule-X `calendars` config from the unique calendarIds in sxEvents.
  // Keys must use the sanitized id (Schedule-X rejects '@' etc in calendarId keys).
  const calendarsConfig = useMemo(() => {
    const record: Record<string, { colorName: string; lightColors: { main: string; container: string; onContainer: string } }> = {}
    for (const sxEvent of sxEvents) {
      const sanitized = sxEvent.calendarId // already sanitized in sxEvents construction
      if (sanitized in record) continue
      // Reverse-lookup the raw id to find the user's chosen palette id.
      // sxEvents stores the sanitized calendarId; we need the raw one to look up in calendarColors.
      // We walk the original events to find the matching raw calendarId.
      const rawCalendarId = events.find(
        (e) => e.calendarId && sanitizeId(e.calendarId) === sanitized,
      )?.calendarId ?? sanitized
      const paletteId = calendarColors?.get(rawCalendarId) ?? DEFAULT_CALENDAR_COLOR_ID
      const { main, container, onContainer } = getCalendarColor(paletteId)
      record[sanitized] = {
        colorName: sanitized,
        lightColors: { main, container, onContainer },
      }
    }
    return record
  }, [sxEvents, events, calendarColors])

  const eventsService = useMemo(() => createEventsServicePlugin(), [])

  const calendarApp = useCalendarApp(
    {
      views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
      events: sxEvents as unknown as Parameters<typeof useCalendarApp>[0]['events'],
      calendars: calendarsConfig,
      defaultView: 'week',
      // Hide the 12am–6am dead zone. Events before 6am or after midnight
      // are clipped by Schedule-X — adjust if users need those hours.
      dayBoundaries: { start: '06:00', end: '24:00' },
      weekOptions: {
        gridHeight: 720,
        nDays: 7,
        eventWidth: 95,
        timeAxisFormatOptions: { hour: 'numeric' },
        eventOverlap: true,
        gridStep: 60,
      },
      callbacks: onEventClick
        ? {
            onEventClick: (event: { id: string | number }) => {
              const raw = String(event.id)
              onEventClick(idToOriginal.get(raw) ?? raw)
            },
          }
        : undefined,
    },
    [eventsService],
  )

  useEffect(() => {
    eventsService.set(sxEvents as unknown as Parameters<typeof eventsService.set>[0])
  }, [sxEvents, eventsService])

  return (
    <div className="relative h-full">
      <ScheduleXCalendar calendarApp={calendarApp} />
      {sxEvents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="pointer-events-auto rounded-md bg-white/85 px-4 py-2 text-sm text-neutral-500 shadow-sm backdrop-blur">
            No events to show.
          </p>
        </div>
      )}
    </div>
  )
}
