"use client"

import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useHub } from '@/lib/store'
import { trpc } from '@/lib/trpc/client'
import { FilterSidebar } from '@/components/calendar/filter-sidebar'
import { EventDetailDrawer } from '@/components/calendar/event-detail-drawer'

// Schedule-X (preact internals) touches the DOM at mount and doesn't SSR cleanly —
// defer to the client to avoid hydration mismatches and the `<script>` tag warning.
const CalendarApp = dynamic(
  () => import('@/components/calendar/calendar-app').then((m) => m.CalendarApp),
  {
    ssr: false,
    loading: () => <div className="flex-1 rounded-md bg-neutral-50" />,
  },
)

export default function CalendarPage() {
  const { events } = useHub()
  const { data: calendarsData } = trpc.calendars.list.useQuery()

  const [activeProfiles, setActiveProfiles] = useState<Set<string>>(new Set())
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const hiddenCalendarIds = useMemo(
    () => new Set(
      (calendarsData?.calendars ?? [])
        .filter(c => !c.visible)
        .map(c => c.calendarId),
    ),
    [calendarsData],
  )

  // Server already filters by visibility, but we re-filter client-side for zero-flicker
  // when the user toggles a calendar off (the mutation's invalidation has a round-trip).
  const visibleEvents = useMemo(() => events.filter(e => {
    if (e.calendarId && hiddenCalendarIds.has(e.calendarId)) return false
    if (activeProfiles.size > 0) {
      if (!e.profileId || !activeProfiles.has(e.profileId)) return false
    }
    return true
  }), [events, hiddenCalendarIds, activeProfiles])

  const toggleProfile = (id: string) => {
    setActiveProfiles(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <main className="flex-1 w-full bg-white text-foreground flex p-8 lg:p-12 h-[calc(100vh-6rem)]">
      <FilterSidebar
        activeProfiles={activeProfiles}
        onToggleProfile={toggleProfile}
      />
      <div className="flex-1 min-w-0 ml-8">
        <CalendarApp
          events={visibleEvents}
          onEventClick={setSelectedEventId}
        />
      </div>
      <EventDetailDrawer
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
      />
    </main>
  )
}
