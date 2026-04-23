"use client"

import { trpc } from '@/lib/trpc/client'
import { useHub } from '@/lib/store'
import { formatInZone, userTimeZone } from '@/lib/datetime'

export interface EventDetailDrawerProps {
  eventId: string | null
  onClose: () => void
}

export function EventDetailDrawer({ eventId, onClose }: EventDetailDrawerProps) {
  const { events } = useHub()
  const zone = userTimeZone()

  const event = eventId ? events.find(e => e.id === eventId) ?? null : null

  const { data: enrichment, isLoading } = trpc.calendar.getEventEnrichment.useQuery(
    { eventId: eventId ?? '' },
    {
      enabled: !!eventId,
      staleTime: 10 * 60 * 1000,
    },
  )
  const prep = enrichment?.perEvent ?? null

  if (!event) return null

  const timeLabel = event.start
    ? formatInZone(event.start, zone, 'EEEE, MMM d · h:mm a')
    : event.time

  return (
    <aside className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border p-8 overflow-y-auto z-50">
      <button
        onClick={onClose}
        className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-foreground mb-6"
      >
        Close
      </button>

      <h2 className="font-heading text-3xl font-light tracking-tighter mb-2">{event.title}</h2>
      <div className="text-xs font-mono text-foreground/40 mb-6">
        {timeLabel}
        {event.location ? ` · ${event.location}` : ''}
      </div>

      <section className="mb-6">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Travel buffer
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : prep?.travelBuffer ? (
          <p className="text-sm font-serif leading-relaxed">{prep.travelBuffer}</p>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">No travel advice.</p>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Prep suggestion
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : prep?.prepSuggestion ? (
          <p className="text-sm font-serif leading-relaxed">{prep.prepSuggestion}</p>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">No prep needed.</p>
        )}
      </section>
    </aside>
  )
}
