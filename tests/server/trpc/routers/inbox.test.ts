import { inboxRouter } from '@/server/trpc/routers/inbox'
import { mockCtx } from '../helpers'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('ai', () => ({
  generateObject: jest.fn().mockResolvedValue({
    object: { emails: [{ id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo Thu', suggestedActions: [] }] },
  }),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('inbox router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Zoo', sender: 'School', fullBody: 'Zoo trip Thursday', date: 1 },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { emails: [{ id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo Thu', suggestedActions: [] }] },
    })
  })

  it('digest returns AI-digested emails tagged with accountId', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
  })

  it('digest short-circuits and returns empty array when no emails', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([])
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(0)
    expect(aiModule.generateObject).not.toHaveBeenCalled()
  })

  it('digest injects status=PENDING on suggestedActions', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        emails: [{
          id: 'm1',
          subject: 'Zoo',
          sender: 'School',
          snippet: 'Zoo Thu',
          suggestedActions: [{
            id: 'a1',
            type: 'TODO_ITEM',
            title: 'Pack snacks',
            date: null,
            time: null,
            context: 'FAMILY',
          }],
        }],
      },
    })
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails[0].suggestedActions[0].status).toBe('PENDING')
  })

  it('digest tags emails with accountEmail', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails[0].accountEmail).toBe('mary@tribe.ai')
  })

  it('digest rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller(mockCtx())
    await expect(caller.digest()).rejects.toThrow()
  })

  it('digest skips accounts with no refresh token and still returns results from other accounts', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai' },
      { id: 'a2', email: 'work@tribe.ai' },
    ])
    ;(getDecryptedRefreshToken as jest.Mock).mockImplementation((uid: string, accId: string) =>
      accId === 'a1' ? Promise.resolve('rt') : Promise.resolve(null)
    )
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
  })
})
