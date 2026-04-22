import { inboxRouter } from '@/server/trpc/routers/inbox'
import { setHubStatus } from '@/lib/server/inbox-status'
import { mockCtx } from '../helpers'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/inbox-status')

describe('inbox mutations', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('markCleared writes CLEARED to Firestore', async () => {
    ;(setHubStatus as jest.Mock).mockResolvedValue(undefined)
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    const res = await caller.markCleared({ id: 'm1' })
    expect(setHubStatus).toHaveBeenCalledWith('mary-uid', 'm1', 'CLEARED')
    expect(res).toEqual({ ok: true })
  })

  it('markCleared rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller(mockCtx())
    await expect(caller.markCleared({ id: 'm1' })).rejects.toBeInstanceOf(TRPCError)
  })

  it('markCleared rejects blank id', async () => {
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await expect(caller.markCleared({ id: '' })).rejects.toBeInstanceOf(TRPCError)
  })

  it('markUnread writes UNREAD to Firestore', async () => {
    ;(setHubStatus as jest.Mock).mockResolvedValue(undefined)
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await caller.markUnread({ id: 'm1' })
    expect(setHubStatus).toHaveBeenCalledWith('mary-uid', 'm1', 'UNREAD')
  })
})
