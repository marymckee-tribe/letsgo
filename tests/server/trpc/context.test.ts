import { createContext } from '@/server/trpc/context'
import { getAdminAuth } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('createContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { uid: undefined } when no Authorization header', async () => {
    const req = new Request('http://x/api/trpc/accounts.list')
    const ctx = await createContext({ req })
    expect(ctx.uid).toBeUndefined()
  })

  it('returns { uid } when Firebase verifies the token', async () => {
    ;(getAdminAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'mary-uid' }),
    })
    const req = new Request('http://x/api/trpc/accounts.list', {
      headers: { Authorization: 'Bearer validtoken' },
    })
    const ctx = await createContext({ req })
    expect(ctx.uid).toBe('mary-uid')
  })

  it('returns { uid: undefined } when token verification fails', async () => {
    ;(getAdminAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('expired')),
    })
    const req = new Request('http://x/api/trpc/accounts.list', {
      headers: { Authorization: 'Bearer expired' },
    })
    const ctx = await createContext({ req })
    expect(ctx.uid).toBeUndefined()
  })
})
