import { tasksRouter } from '@/server/trpc/routers/tasks'
import { mockCtx } from '../helpers'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/tasks-fetcher')

describe('tasks router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchTasks as jest.Mock).mockResolvedValue([{ id: 't1', title: 'Do', completed: false }])
  })

  it('list returns Google Tasks entries tagged with accountId', async () => {
    const caller = tasksRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const { tasks } = await caller.list()
    expect(tasks).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((tasks[0] as any).title).toBe('Do')
    expect(tasks[0].accountId).toBe('a1')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = tasksRouter.createCaller(mockCtx())
    await expect(caller.list()).rejects.toThrow()
  })
})
