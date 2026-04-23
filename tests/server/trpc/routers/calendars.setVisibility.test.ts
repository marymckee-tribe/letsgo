import { calendarsRouter } from '@/server/trpc/routers/calendars'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-mappings')

describe('calendars router — visibility', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(setCalendarMapping as jest.Mock).mockResolvedValue(undefined)
  })

  it('list emits visible=true for calendars with no mapping', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }] }),
    }) as unknown as typeof fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' } as any)
    const { calendars } = await caller.list()
    expect(calendars[0].visible).toBe(true)
  })

  it('list emits visible=false when the mapping says so', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal1', accountId: 'a1', calendarName: 'Mary', profileId: null, visible: false, updatedAt: 1 },
    ])
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }] }),
    }) as unknown as typeof fetch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' } as any)
    const { calendars } = await caller.list()
    expect(calendars[0].visible).toBe(false)
  })

  it('setVisibility persists visible=false and preserves existing profileId', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal1', accountId: 'a1', calendarName: 'Mary', profileId: 'mary', visible: true, updatedAt: 1 },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' } as any)
    await caller.setVisibility({ calendarId: 'cal1', visible: false })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', expect.objectContaining({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'mary',
      visible: false,
    }))
  })

  it('setVisibility throws NOT_FOUND when the mapping does not exist', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' } as any)
    await expect(caller.setVisibility({ calendarId: 'does-not-exist', visible: false }))
      .rejects.toThrow(TRPCError)
  })

  it('setVisibility rejects unauthenticated callers', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarsRouter.createCaller({} as any)
    await expect(caller.setVisibility({ calendarId: 'cal1', visible: false }))
      .rejects.toThrow()
  })
})
