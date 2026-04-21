// tests/api/tasks-list.test.ts
import { POST } from '@/app/api/tasks/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/tasks-fetcher')

describe('POST /api/tasks/list', () => {
  it('returns merged tasks tagged with accountId', async () => {
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchTasks as jest.Mock).mockResolvedValue([{ id: 't1', title: 'Review board deck', completed: false }])

    const req = new Request('http://x/api/tasks/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].accountId).toBe('a1')
  })
})
