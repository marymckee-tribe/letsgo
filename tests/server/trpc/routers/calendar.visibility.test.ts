import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')

describe('calendar.list — visibility filter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
  })

  it('drops events whose calendar has visible=false in the mapping', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal-hidden', accountId: 'a1', calendarName: 'Hidden', profileId: null, visible: false, updatedAt: 1 },
      { calendarId: 'cal-visible', accountId: 'a1', calendarName: 'Visible', profileId: null, visible: true, updatedAt: 1 },
    ])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Keep me', start: '2026-04-22T10:00:00Z', calendarId: 'cal-visible' },
      { id: 'e2', title: 'Drop me', start: '2026-04-22T11:00:00Z', calendarId: 'cal-hidden' },
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
    const { events } = await caller.list()
    expect(events.map(e => e.id)).toEqual(['e1'])
  })

  it('keeps all events when no mappings hide anything', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'A', start: '2026-04-22T10:00:00Z', calendarId: 'cal1' },
      { id: 'e2', title: 'B', start: '2026-04-22T11:00:00Z', calendarId: 'cal2' },
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' } as any)
    const { events } = await caller.list()
    expect(events.map(e => e.id).sort()).toEqual(['e1', 'e2'])
  })
})
