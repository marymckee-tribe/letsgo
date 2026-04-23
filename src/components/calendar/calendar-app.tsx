"use client"

import { useEffect, useMemo } from 'react'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { CalendarEvent } from '@/lib/store'
import { toScheduleXDateTime, userTimeZone } from '@/lib/datetime'

// Schedule-X v4 CalendarEventExternal types `start`/`end` as Temporal objects,
// but the runtime also accepts the 'YYYY-MM-DD HH:mm' string format used by
// toScheduleXDateTime. We use a local interface to satisfy TypeScript while
// keeping the string-based datetime helpers.
interface SxEvent {
  id: string | number
  title: string
  start: string
  end: string
  calendarId: string
}

export interface CalendarAppProps {
  events: CalendarEvent[]
  onEventClick?: (eventId: string) => void
}

export function CalendarApp({ events, onEventClick }: CalendarAppProps) {
  const zone = userTimeZone()

  const sxEvents = useMemo((): SxEvent[] =>
    events
      .filter(e => e.start)
      .map(e => ({
        id: e.id,
        title: e.title,
        start: toScheduleXDateTime(e.start, zone),
        end: toScheduleXDateTime(e.end ?? e.start, zone),
        calendarId: e.calendarId ?? 'default',
      })),
  [events, zone])

  const eventsService = useMemo(() => createEventsServicePlugin(), [])

  // v4 API: useCalendarApp(config, plugins?) — plugins as second arg.
  // callbacks.onEventClick receives (event: CalendarEventExternal, e: UIEvent).
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
