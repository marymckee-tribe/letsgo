// tests/server/trpc/routers/calendars.test.ts
import { calendarsRouter } from '@/server/trpc/routers/calendars'
import { mockCtx } from '../helpers'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-mappings')

describe('calendars router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(setCalendarMapping as jest.Mock).mockResolvedValue(undefined)
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }],
      }),
    }) as jest.Mock
  })

  it('list returns Google calendar metadata per account', async () => {
    const caller = calendarsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { calendars } = await caller.list()
    expect(calendars).toHaveLength(1)
    expect(calendars[0]).toMatchObject({
      accountId: 'a1',
      accountEmail: 'mary@tribe.ai',
      calendarId: 'cal1',
      calendarName: 'Mary',
      selected: true,
      profileId: null,
    })
  })

  it('updateMapping persists a calendar→profile mapping', async () => {
    const caller = calendarsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.updateMapping({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'ellie',
    })
    expect(result).toEqual({ ok: true })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'ellie',
    })
  })

  it('updateMapping accepts profileId: null to clear the mapping', async () => {
    const caller = calendarsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.updateMapping({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: null,
    })
    expect(result).toEqual({ ok: true })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: null,
    })
  })
})
