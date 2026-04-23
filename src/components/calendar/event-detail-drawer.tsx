"use client"

import { trpc } from '@/lib/trpc/client'
import { useHub } from '@/lib/store'
import { formatInZone, userTimeZone } from '@/lib/datetime'

export interface EventDetailDrawerProps {
  eventId: string | null
  onClose: () => void
}

/** Strip HTML tags from Google Calendar descriptions (they sometimes ship as HTML). */
function plainText(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

export function EventDetailDrawer({ eventId, onClose }: EventDetailDrawerProps) {
  const { events } = useHub()
  const zone = userTimeZone()

  const event = eventId ? events.find((e) => e.id === eventId) ?? null : null

  const { data: enrichment, isLoading } = trpc.calendar.getEventEnrichment.useQuery(
    { eventId: eventId ?? '' },
    {
      enabled: !!eventId,
      staleTime: 10 * 60 * 1000,
    },
  )
  const prepSuggestion = enrichment?.perEvent?.prepSuggestion ?? null

  if (!event) return null

  const timeLabel = event.start
    ? formatInZone(event.start, zone, 'EEEE, MMM d · h:mm a')
    : event.time

  const description = event.description ? plainText(event.description) : ''

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

      {description && (
        <section className="mb-6">
          <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
            Description
          </h3>
          <p className="whitespace-pre-wrap text-sm font-serif leading-relaxed text-foreground/80">
            {description}
          </p>
        </section>
      )}

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          AI notes
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : prepSuggestion ? (
          <p className="text-sm font-serif leading-relaxed">{prepSuggestion}</p>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">Nothing to prep.</p>
        )}
      </section>
    </aside>
  )
}
