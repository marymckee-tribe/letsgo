// tests/api/accounts.test.ts
import { GET, DELETE } from '@/app/api/accounts/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')

describe('/api/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
  })

  it('GET returns sanitized accounts (no refresh tokens in payload)', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai', refreshToken: 'enc-1', scopes: ['x'], addedAt: 1 },
      { id: 'a2', email: 'mary.w.mckee@gmail.com', refreshToken: 'enc-2', scopes: ['x'], addedAt: 2 },
    ])
    const req = new Request('http://x/api/accounts', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()
    expect(body.accounts).toHaveLength(2)
    expect(body.accounts[0].refreshToken).toBeUndefined()
    expect(body.accounts[0].email).toBe('mary@tribe.ai')
  })

  it('DELETE removes the account', async () => {
    const req = new Request('http://x/api/accounts?id=a1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await DELETE(req)
    expect(deleteAccount).toHaveBeenCalledWith('mary-uid', 'a1')
    expect(res.status).toBe(200)
  })

  it('DELETE 400s without id', async () => {
    const req = new Request('http://x/api/accounts', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
