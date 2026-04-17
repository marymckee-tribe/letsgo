// src/app/api/calendar/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const events = await fetchCalendarEvents(accessToken)
        return events.map(e => ({ ...e, accountId: acc.id }))
      } catch (err: any) {
        return { _error: { accountId: acc.id, message: err.message } }
      }
    }))
    const events = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => (!Array.isArray(r) && '_error' in r ? [r._error] : []))
    return NextResponse.json({ events, errors })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : (e.status ?? 500)
    return NextResponse.json({ error: e.message }, { status })
  }
}
