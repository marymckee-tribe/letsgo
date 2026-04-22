// src/server/trpc/routers/calendar.ts
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

export const calendarRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const uid = ctx.uid
    const accounts = await listAccounts(uid)
    const mappings = await listCalendarMappings(uid)
    const mappingMap = new Map<string, string | null>(
      mappings.map(m => [m.calendarId, m.profileId]),
    )
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
      const dedupeKey = e.iCalUID || e.id
      if (!dedupeKey || seen.has(dedupeKey)) return false
      seen.add(dedupeKey)
      return true
    })
    return { events, errors }
  }),
})
