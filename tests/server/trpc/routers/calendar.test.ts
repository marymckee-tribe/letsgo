// tests/server/trpc/routers/calendar.test.ts
import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')

describe('calendar router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Zoo', start: '2026-04-23T08:00:00', location: 'SF Zoo' },
    ])
  })

  it('list returns events tagged with profileId=null when no mapping exists', async () => {
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events).toHaveLength(1)
    expect(events[0].profileId).toBeNull()
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = calendarRouter.createCaller({})
    await expect(caller.list()).rejects.toThrow()
  })

  it('list tags events with accountId', async () => {
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events[0].accountId).toBe('a1')
  })

  it('list tags events with profileId from mapping when calendarId matches', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal-family', accountId: 'a1', calendarName: 'Family', profileId: 'ellie', updatedAt: 1000 },
    ])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Gymnastics', calendarId: 'cal-family' },
      { id: 'e2', title: 'Work Meeting', calendarId: 'cal-work' },
    ])
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events).toHaveLength(2)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e1 = events.find((e: any) => e.id === 'e1')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e2 = events.find((e: any) => e.id === 'e2')
    expect(e1!.profileId).toBe('ellie')
    expect(e2!.profileId).toBeNull()
  })

  it('list dedupes events by iCalUID across accounts', async () => {
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', iCalUID: 'uid-abc', title: 'Event A', calendarId: 'cal1' },
      { id: 'e2', iCalUID: 'uid-abc', title: 'Event A (copy)', calendarId: 'cal2' },
      { id: 'e3', title: 'Event B', calendarId: 'cal1' },
    ])
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events).toHaveLength(2)
  })

  it('list suppresses per-account errors and returns them in errors array', async () => {
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue(null)
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events, errors } = await caller.list()
    expect(events).toHaveLength(0)
    expect(errors).toHaveLength(1)
    expect(errors[0].accountId).toBe('a1')
  })
})
