// src/app/api/calendars/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'

interface GoogleCalendarListEntry {
  id: string
  summary?: string
  selected?: boolean
  accessRole?: string
}

interface GoogleCalendarListResponse {
  error?: { message?: string }
  items?: GoogleCalendarListEntry[]
}

export interface CalendarListItem {
  accountId: string
  accountEmail: string
  calendarId: string
  calendarName: string
  selected: boolean
  profileId: string | null
}

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const mappings = await listCalendarMappings(uid)
    const mappingMap = new Map<string, string | null>(
      mappings.map(m => [m.calendarId, m.profileId]),
    )

    const perAccount = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const rt = await getDecryptedRefreshToken(uid, acc.id)
          if (!rt) throw new Error('Refresh token missing')
          const { accessToken } = await refreshAccessToken(rt)
          const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { Authorization: `Bearer ${accessToken}` },
          })
          const data = (await res.json()) as GoogleCalendarListResponse
          if (data.error) return []
          const items: GoogleCalendarListEntry[] = (data.items || []).filter(
            (c: GoogleCalendarListEntry) =>
              c.selected !== false && c.accessRole !== 'freeBusyReader',
          )
          return items.map((c): CalendarListItem => ({
            accountId: acc.id,
            accountEmail: acc.email,
            calendarId: c.id,
            calendarName: c.summary ?? c.id,
            selected: c.selected !== false,
            profileId: mappingMap.has(c.id) ? (mappingMap.get(c.id) ?? null) : null,
          }))
        } catch (err: unknown) {
          const e = err as { message?: string }
          console.warn(`[calendars] skipping account ${acc.id}: ${e.message ?? 'unknown error'}`)
          return []
        }
      }),
    )

    const calendars = perAccount.flat()
    return NextResponse.json({ calendars })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}

interface PutBody {
  calendarId: string
  accountId: string
  calendarName: string
  profileId: string | null
}

function isPutBody(v: unknown): v is PutBody {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.calendarId === 'string' &&
    typeof o.accountId === 'string' &&
    typeof o.calendarName === 'string' &&
    (typeof o.profileId === 'string' || o.profileId === null)
  )
}

export async function PUT(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const body: unknown = await req.json()
    if (!isPutBody(body)) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }
    await setCalendarMapping(uid, {
      calendarId: body.calendarId,
      accountId: body.accountId,
      calendarName: body.calendarName,
      profileId: body.profileId,
    })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
