// tests/api/calendars.test.ts
import { GET, PUT } from '@/app/api/calendars/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-mappings')

const mockFetch = jest.fn()
global.fetch = mockFetch

describe('GET /api/calendars', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
  })

  it('returns merged calendar list with stored profileId mapping', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal1', accountId: 'a1', calendarName: 'Family', profileId: 'ellie', updatedAt: 1000 },
    ])
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        items: [
          { id: 'cal1', summary: 'Family', selected: true, accessRole: 'owner' },
          { id: 'cal2', summary: 'Work', selected: true, accessRole: 'owner' },
        ],
      }),
    })

    const req = new Request('http://x/api/calendars', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.calendars).toHaveLength(2)
    const cal1 = body.calendars.find((c: { calendarId: string }) => c.calendarId === 'cal1')
    const cal2 = body.calendars.find((c: { calendarId: string }) => c.calendarId === 'cal2')
    expect(cal1.profileId).toBe('ellie')
    expect(cal2.profileId).toBeNull()
    expect(cal1.accountId).toBe('a1')
    expect(cal1.accountEmail).toBe('mary@tribe.ai')
  })

  it('excludes freeBusyReader calendars', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        items: [
          { id: 'cal1', summary: 'Primary', selected: true, accessRole: 'owner' },
          { id: 'cal2', summary: 'Holidays', selected: true, accessRole: 'freeBusyReader' },
        ],
      }),
    })

    const req = new Request('http://x/api/calendars', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.calendars).toHaveLength(1)
    expect(body.calendars[0].calendarId).toBe('cal1')
  })

  it('swallows per-account errors and returns empty for that account', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(getDecryptedRefreshToken as jest.Mock).mockRejectedValue(new Error('Token missing'))

    const req = new Request('http://x/api/calendars', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()

    expect(body.calendars).toHaveLength(0)
    expect(res.status).toBe(200)
  })
})

describe('PUT /api/calendars', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(setCalendarMapping as jest.Mock).mockResolvedValue(undefined)
  })

  it('writes mapping and returns ok', async () => {
    const req = new Request('http://x/api/calendars', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarId: 'cal1',
        accountId: 'a1',
        calendarName: 'Family',
        profileId: 'ellie',
      }),
    })
    const res = await PUT(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Family',
      profileId: 'ellie',
    })
  })

  it('writes null profileId (unassign)', async () => {
    const req = new Request('http://x/api/calendars', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarId: 'cal1',
        accountId: 'a1',
        calendarName: 'Family',
        profileId: null,
      }),
    })
    const res = await PUT(req)
    const body = await res.json()

    expect(body.ok).toBe(true)
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Family',
      profileId: null,
    })
  })

  it('returns 400 for invalid body', async () => {
    const req = new Request('http://x/api/calendars', {
      method: 'PUT',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendarId: 'cal1' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })
})
