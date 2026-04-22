// src/server/trpc/routers/calendars.ts
import { z } from 'zod'
import { router, protectedProcedure } from '../index'
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

const MappingInput = z.object({
  calendarId: z.string().min(1),
  accountId: z.string().min(1),
  calendarName: z.string(),
  profileId: z.string().nullable(),
})

export const calendarsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    const mappings = await listCalendarMappings(ctx.uid)
    const mappingMap = new Map<string, string | null>(
      mappings.map(m => [m.calendarId, m.profileId]),
    )

    const perAccount = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
          if (!rt) throw new Error('Refresh token missing')
          const { accessToken } = await refreshAccessToken(rt)
          const res = await fetch(
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          const data = (await res.json()) as GoogleCalendarListResponse
          if (data.error) return []
          const items: GoogleCalendarListEntry[] = (data.items || []).filter(
            (c) => c.selected !== false && c.accessRole !== 'freeBusyReader',
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

    return { calendars: perAccount.flat() }
  }),

  updateMapping: protectedProcedure
    .input(MappingInput)
    .mutation(async ({ ctx, input }) => {
      await setCalendarMapping(ctx.uid, input)
      return { ok: true }
    }),
})
