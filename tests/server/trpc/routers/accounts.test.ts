import { accountsRouter } from '@/server/trpc/routers/accounts'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'
import { TRPCError } from '@trpc/server'
import { mockCtx } from '../helpers'

jest.mock('@/lib/server/accounts')

describe('accounts router', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('list returns sanitized accounts (no refreshToken)', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai', refreshToken: 'SECRET', scopes: [], addedAt: 1 },
    ])
    const caller = accountsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const result = await caller.list()
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).not.toHaveProperty('refreshToken')
    expect(result.accounts[0].email).toBe('mary@tribe.ai')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = accountsRouter.createCaller(mockCtx())
    await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
  })

  it('remove deletes the account', async () => {
    ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
    const caller = accountsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await caller.remove({ id: 'a1' })
    expect(deleteAccount).toHaveBeenCalledWith('mary-uid', 'a1')
  })

  it('remove rejects blank id', async () => {
    const caller = accountsRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(caller.remove({ id: '' })).rejects.toBeInstanceOf(TRPCError)
  })
})
