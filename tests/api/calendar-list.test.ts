// tests/api/calendar-list.test.ts
import { POST } from '@/app/api/calendar/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')

describe('POST /api/calendar/list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
  })

  it('returns merged events tagged with accountId', async () => {
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([{ id: 'e1', title: 'Gymnastics' }])
    const req = new Request('http://x/api/calendar/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0].accountId).toBe('a1')
  })

  it('tags events with profileId from mapping when present', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal-family', accountId: 'a1', calendarName: 'Family', profileId: 'ellie', updatedAt: 1000 },
    ])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Gymnastics', calendarId: 'cal-family' },
      { id: 'e2', title: 'Work Meeting', calendarId: 'cal-work' },
    ])
    const req = new Request('http://x/api/calendar/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.events).toHaveLength(2)
    const e1 = body.events.find((e: { id: string }) => e.id === 'e1')
    const e2 = body.events.find((e: { id: string }) => e.id === 'e2')
    expect(e1.profileId).toBe('ellie')
    expect(e2.profileId).toBeNull()
  })

  it('dedupes events by iCalUID when present', async () => {
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', iCalUID: 'uid-abc', title: 'Event A', calendarId: 'cal1' },
      { id: 'e2', iCalUID: 'uid-abc', title: 'Event A (copy)', calendarId: 'cal2' },
      { id: 'e3', title: 'Event B', calendarId: 'cal1' },
    ])
    const req = new Request('http://x/api/calendar/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.events).toHaveLength(2)
  })
})
