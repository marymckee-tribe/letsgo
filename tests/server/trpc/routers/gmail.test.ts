import { gmailRouter } from '@/server/trpc/routers/gmail'
import { mockCtx } from '../helpers'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')

describe('gmail router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Hi', sender: 'a@b.c', snippet: 'hi', fullBody: 'hi', date: 1 },
    ])
  })

  it('list returns unread emails tagged with accountId', async () => {
    const caller = gmailRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.list()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = gmailRouter.createCaller(mockCtx())
    await expect(caller.list()).rejects.toThrow()
  })
})
