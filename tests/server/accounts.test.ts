import { createAccount, listAccounts, deleteAccount, type Account } from '@/lib/server/accounts'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('accounts CRUD', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
  })

  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDelete = jest.fn()
  const mockDoc: jest.Mock = jest.fn(() => ({ set: mockSet, get: mockGet, delete: mockDelete, collection: mockCollection }))
  const mockCollection: jest.Mock = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({ collection: mockCollection, settings: jest.fn() })
  })

  it('creates an account with encrypted refresh token', async () => {
    mockSet.mockResolvedValue(undefined)
    const id = await createAccount('mary-uid', {
      email: 'mary.w.mckee@gmail.com',
      refreshToken: 'raw-rt',
      scopes: ['gmail.readonly'],
    })
    expect(id).toMatch(/.+/)
    expect(mockSet).toHaveBeenCalledTimes(1)
    const payload = mockSet.mock.calls[0][0] as Account
    expect(payload.email).toBe('mary.w.mckee@gmail.com')
    expect(payload.refreshToken).not.toBe('raw-rt') // encrypted
    expect(payload.scopes).toEqual(['gmail.readonly'])
    expect(payload.addedAt).toBeGreaterThan(0)
  })

  it('lists accounts by uid', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'a1', data: () => ({ email: 'mary@tribe.ai', refreshToken: 'enc1', scopes: [], addedAt: 1 }) },
        { id: 'a2', data: () => ({ email: 'mary.w.mckee@gmail.com', refreshToken: 'enc2', scopes: [], addedAt: 2 }) },
      ],
    })
    const out = await listAccounts('mary-uid')
    expect(out.map(a => a.email)).toEqual(['mary@tribe.ai', 'mary.w.mckee@gmail.com'])
  })

  it('deletes an account', async () => {
    mockDelete.mockResolvedValue(undefined)
    await deleteAccount('mary-uid', 'a1')
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })
})
