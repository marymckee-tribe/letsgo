// tests/server/session.test.ts
import { getUidFromRequest } from '@/lib/server/session'
import { getAdminAuth } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('getUidFromRequest', () => {
  const mockVerifyIdToken = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminAuth as jest.Mock).mockReturnValue({ verifyIdToken: mockVerifyIdToken })
  })

  it('returns uid when Authorization header holds valid Firebase ID token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'mary-uid' })
    const req = new Request('http://x', { headers: { Authorization: 'Bearer valid-token' } })
    expect(await getUidFromRequest(req)).toBe('mary-uid')
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
  })

  it('throws 401 when no Authorization header', async () => {
    const req = new Request('http://x')
    await expect(getUidFromRequest(req)).rejects.toThrow(/401/)
  })

  it('throws 401 when token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const req = new Request('http://x', { headers: { Authorization: 'Bearer bad' } })
    await expect(getUidFromRequest(req)).rejects.toThrow(/401/)
  })
})
