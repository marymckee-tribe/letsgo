// tests/api/inbox-digest.test.ts
import { POST } from '@/app/api/inbox/digest/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import * as aiModule from 'ai'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('ai', () => ({
  generateObject: jest.fn().mockResolvedValue({
    object: {
      emails: [
        { id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo trip Thursday', suggestedActions: [] },
      ],
    },
  }),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('POST /api/inbox/digest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Zoo', sender: 'School', fullBody: 'Zoo trip Thursday', date: 1 },
    ])
    // Re-apply generateObject default since clearAllMocks wiped it
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        emails: [
          { id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo trip Thursday', suggestedActions: [] },
        ],
      },
    })
  })

  it('returns AI-digested emails tagged with accountId', async () => {
    const req = new Request('http://x/api/inbox/digest', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails).toHaveLength(1)
    expect(body.emails[0].accountId).toBe('a1')
  })
})
