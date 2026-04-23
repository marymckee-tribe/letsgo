"use client"

import { useEffect, useMemo } from 'react'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { Temporal } from 'temporal-polyfill'
import type { CalendarEvent } from '@/lib/store'
import { toScheduleXDateTime, userTimeZone } from '@/lib/datetime'

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
}

export function CalendarApp({ events, onEventClick }: CalendarAppProps) {
  const zone = userTimeZone()

  const sxEvents = useMemo<SxEvent[]>(() => {
    const out: SxEvent[] = []
    for (const e of events) {
      const start = toScheduleXDateTime(e.start, zone)
      if (!start) continue
      const end = toScheduleXDateTime(e.end ?? e.start, zone) ?? start
      out.push({
        id: e.id,
        title: e.title,
        start,
        end,
        calendarId: e.calendarId ?? 'default',
      })
    }
    return out
  }, [events, zone])

  const eventsService = useMemo(() => createEventsServicePlugin(), [])

  const calendarApp = useCalendarApp(
    {
      views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
      events: sxEvents as unknown as Parameters<typeof useCalendarApp>[0]['events'],
      defaultView: 'week',
      callbacks: onEventClick
        ? {
            onEventClick: (event: { id: string | number }) =>
              onEventClick(String(event.id)),
          }
        : undefined,
    },
    [eventsService],
  )

  useEffect(() => {
    eventsService.set(sxEvents as unknown as Parameters<typeof eventsService.set>[0])
  }, [sxEvents, eventsService])

  return <ScheduleXCalendar calendarApp={calendarApp} />
}
