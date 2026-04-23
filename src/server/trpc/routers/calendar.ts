// src/server/trpc/routers/calendar.ts
import { z } from 'zod'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

const PrepNotesSchema = z.object({
  prepSuggestion: z.string().nullable(),
})

const InsightsSchema = z.object({
  insights: z.array(z.string()),
})

const EnrichmentInput = z
  .object({
    eventId: z.string().min(1).optional(),
    dayISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (v) => (v.eventId ? 1 : 0) + (v.dayISO ? 1 : 0) === 1,
    { message: 'Provide exactly one of { eventId, dayISO }' },
  )

export const calendarRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.uid
    const accounts = await listAccounts(uid)
    const mappings = await listCalendarMappings(uid)
    const mappingMap = new Map<string, string | null>(
      mappings.map(m => [m.calendarId, m.profileId]),
    )
    const hiddenCalendarIds = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const events = await fetchCalendarEvents(accessToken)
        return events.map(e => {
          const profileId = mappingMap.has(e.calendarId) ? (mappingMap.get(e.calendarId) ?? null) : null
          return { ...e, accountId: acc.id, profileId }
        })
      } catch (err: unknown) {
        const e = err as { message?: string }
        return { _error: { accountId: acc.id, message: e.message ?? 'Unknown error' } }
      }
    }))
    const allEvents = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => (!Array.isArray(r) && '_error' in r ? [r._error] : []))
    const seen = new Set<string>()
    const events = allEvents.filter(e => {
      if (hiddenCalendarIds.has(e.calendarId)) return false
      const dedupeKey = e.iCalUID || e.id
      if (!dedupeKey || seen.has(dedupeKey)) return false
      seen.add(dedupeKey)
      return true
    })
    return { events, errors }
  }),

  getEventEnrichment: protectedProcedure
    .input(EnrichmentInput)
    .query(async ({ ctx, input }) => {
      const accounts = await listAccounts(ctx.uid)
      const mappings = await listCalendarMappings(ctx.uid)
      const hiddenCalendarIds = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))

      const all = await Promise.all(accounts.map(async (acc) => {
        try {
          const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
          if (!rt) return []
          const { accessToken } = await refreshAccessToken(rt)
          const raw = await fetchCalendarEvents(accessToken)
          return raw.map(e => ({ ...e, accountId: acc.id, accountEmail: acc.email }))
        } catch {
          return []
        }
      }))
      const events = all.flat().filter(e => !hiddenCalendarIds.has(e.calendarId ?? ''))

      if (input.eventId) {
        const target = events.find(e => e.id === input.eventId)
        if (!target) {
          throw new TRPCError({ code: 'NOT_FOUND', message: `Event ${input.eventId} not found` })
        }
        const prompt = `You are a Chief of Staff AI helping Mary prepare for an upcoming calendar event.

TARGET EVENT:
Title: ${target.title}
Start: ${target.start}
End: ${target.end ?? 'unknown'}
Location: ${target.location ?? 'unknown'}
Description: ${'description' in target && typeof (target as { description?: unknown }).description === 'string' ? (target as { description?: string }).description : 'none'}

Produce one short string:
- prepSuggestion — one concrete action Mary should take before this event (documents to bring, pre-read, agenda item, who's attending, etc). Null if nothing meaningful beyond the title itself.

Be terse. No preamble. Mary reads this in a drawer; keep it to a single useful sentence.`

        const { object } = await generateObject({
          model: openai('gpt-4o-mini'),
          schema: PrepNotesSchema,
          prompt,
        })
        return { perEvent: object, dailyInsights: [] as string[] }
      }

      const dayISO = input.dayISO!
      const forDay = events
        .filter(e => e.start?.slice(0, 10) === dayISO)
        .map(e => ({ title: e.title, start: e.start, end: e.end, location: e.location }))

      if (forDay.length === 0) {
        return { perEvent: null, dailyInsights: [] as string[] }
      }

      const prompt = `You are Mary's Chief of Staff AI. Produce 1-4 bullet-point observations about her calendar events for ${dayISO}. Flag risks (back-to-back meetings with no buffer, long travel, conflicts, too many context switches). Be terse, signal-rich, no preamble.

EVENTS:
${JSON.stringify(forDay, null, 2)}`

      const { object } = await generateObject({
        model: openai('gpt-4o-mini'),
        schema: InsightsSchema,
        prompt,
      })
      return { perEvent: null, dailyInsights: object.insights }
    }),
})
