// tests/api/calendar-list.test.ts
import { POST } from '@/app/api/calendar/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')

describe('POST /api/calendar/list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
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
})
