// tests/api/auth-google-callback.test.ts
import { GET } from '@/app/api/auth/google/callback/route'
import { exchangeCode, SCOPES } from '@/lib/server/google-oauth'
import { createAccount } from '@/lib/server/accounts'

jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/accounts')

describe('GET /api/auth/google/callback', () => {
  beforeEach(() => jest.clearAllMocks())

  it('exchanges code, creates account, redirects to /settings#accounts', async () => {
    ;(exchangeCode as jest.Mock).mockResolvedValue({
      refreshToken: 'rt',
      accessToken: 'at',
      expiresAt: 9999,
      email: 'mary.w.mckee@gmail.com',
    })
    ;(createAccount as jest.Mock).mockResolvedValue('new-account-id')

    const req = new Request('http://x/api/auth/google/callback?code=abc&state=mary-uid')
    const res = await GET(req)

    expect(exchangeCode).toHaveBeenCalledWith('abc')
    expect(createAccount).toHaveBeenCalledWith('mary-uid', expect.objectContaining({
      email: 'mary.w.mckee@gmail.com',
      refreshToken: 'rt',
      scopes: SCOPES,
    }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/settings#accounts')
  })

  it('redirects to /settings?error=... on exchange failure', async () => {
    ;(exchangeCode as jest.Mock).mockRejectedValue(new Error('bad code'))
    const req = new Request('http://x/api/auth/google/callback?code=abc&state=mary-uid')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/settings\?error=/)
  })

  it('400s on missing code or state', async () => {
    const req = new Request('http://x/api/auth/google/callback?code=abc')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
