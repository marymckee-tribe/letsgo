// tests/api/gmail-list.test.ts
import { POST } from '@/app/api/gmail/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')

describe('POST /api/gmail/list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai' },
      { id: 'a2', email: 'mary.w.mckee@gmail.com' },
    ])
    ;(getDecryptedRefreshToken as jest.Mock).mockImplementation(async (_uid, accId) => `rt-${accId}`)
    ;(refreshAccessToken as jest.Mock).mockImplementation(async (rt) => ({ accessToken: `at-${rt}`, expiresAt: 0 }))
  })

  it('fetches from each account and tags emails with accountId', async () => {
    ;(fetchUnreadPrimary as jest.Mock)
      .mockResolvedValueOnce([{ id: 'm1', subject: 'Work thing' }])
      .mockResolvedValueOnce([{ id: 'm2', subject: 'Zoo trip' }])

    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(fetchUnreadPrimary).toHaveBeenCalledTimes(2)
    expect(body.emails).toHaveLength(2)
    const ids = body.emails.map((e: any) => e.accountId).sort()
    expect(ids).toEqual(['a1', 'a2'])
  })

  it('returns empty list if no accounts linked', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([])
    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    // Option A: consistent shape — always returns both emails and errors
    expect(await res.json()).toEqual({ emails: [], errors: [] })
  })

  it('skips accounts whose refresh fails, logs error, returns others', async () => {
    ;(refreshAccessToken as jest.Mock)
      .mockImplementationOnce(() => Promise.reject(new Error('rt revoked')))
      .mockImplementationOnce(async () => ({ accessToken: 'at-ok', expiresAt: 0 }))
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([{ id: 'm2', subject: 'Zoo' }])

    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails).toHaveLength(1)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0].accountId).toBe('a1')
  })
})
