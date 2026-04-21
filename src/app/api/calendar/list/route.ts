// src/app/api/calendar/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
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
          const ev = e as { calendarId?: string }
          const calId = ev.calendarId
          const profileId = calId !== undefined && mappingMap.has(calId) ? (mappingMap.get(calId) ?? null) : null
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
      const ev = e as { id?: string; iCalUID?: string }
      const dedupeKey = ev.iCalUID || ev.id
      if (!dedupeKey || seen.has(dedupeKey)) return false
      seen.add(dedupeKey)
      return true
    })
    console.log(`[calendar/list] uid=${uid} accounts=${accounts.length} events=${events.length} (${allEvents.length - events.length} dupes collapsed via iCalUID) errors=${errors.length}`, errors)
    return NextResponse.json({ events, errors })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
