// src/server/trpc/routers/calendars.ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
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
  visible: boolean
  color: string | null
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
    const mappingMap = new Map<string, { profileId: string | null; visible: boolean; color: string | null }>(
      mappings.map(m => [m.calendarId, { profileId: m.profileId, visible: m.visible ?? true, color: m.color ?? null }]),
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

          // Seed a mapping row for any calendar not yet tracked
          await Promise.all(
            items
              .filter(c => !mappingMap.has(c.id))
              .map(c =>
                setCalendarMapping(ctx.uid, {
                  calendarId: c.id,
                  accountId: acc.id,
                  calendarName: c.summary ?? c.id,
                  profileId: null,
                  visible: true,
                  // color intentionally omitted — let the UI offer the default
                }),
              ),
          )

          return items.map((c): CalendarListItem => {
            const mapping = mappingMap.get(c.id)
            return {
              accountId: acc.id,
              accountEmail: acc.email,
              calendarId: c.id,
              calendarName: c.summary ?? c.id,
              selected: c.selected !== false,
              profileId: mapping?.profileId ?? null,
              visible: mapping?.visible ?? true,
              color: mapping?.color ?? null,
            }
          })
        } catch (err: unknown) {
          const e = err as { message?: string }
          ctx.logger.warn({ accountId: acc.id, error: e.message ?? 'unknown error' }, 'calendars: skipping account')
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

  setVisibility: protectedProcedure
    .input(z.object({
      calendarId: z.string().min(1),
      visible: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const mappings = await listCalendarMappings(ctx.uid)
      const existing = mappings.find(m => m.calendarId === input.calendarId)
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No mapping found for calendar ${input.calendarId}. Call calendars.list first to seed a mapping row.`,
        })
      }
      await setCalendarMapping(ctx.uid, {
        calendarId: existing.calendarId,
        accountId: existing.accountId,
        calendarName: existing.calendarName,
        profileId: existing.profileId,
        visible: input.visible,
      })
      return { ok: true }
    }),

  setColor: protectedProcedure
    .input(z.object({
      calendarId: z.string().min(1),
      colorId: z.string().nullable(),  // null = reset to default
    }))
    .mutation(async ({ ctx, input }) => {
      const mappings = await listCalendarMappings(ctx.uid)
      const existing = mappings.find(m => m.calendarId === input.calendarId)
      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No mapping found for calendar ${input.calendarId}. Call calendars.list first to seed a mapping row.`,
        })
      }
      await setCalendarMapping(ctx.uid, {
        calendarId: existing.calendarId,
        accountId: existing.accountId,
        calendarName: existing.calendarName,
        profileId: existing.profileId,
        visible: existing.visible,
        color: input.colorId ?? undefined,
      })
      return { ok: true }
    }),
})
