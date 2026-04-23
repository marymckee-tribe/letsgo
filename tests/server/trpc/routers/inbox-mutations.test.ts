import { inboxRouter } from '@/server/trpc/routers/inbox'
import { setHubStatus } from '@/lib/server/inbox-status'
import { mockCtx } from '../helpers'

jest.mock('@/lib/server/inbox-status')

describe('inbox mutations', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('markUnread writes UNREAD to Firestore', async () => {
    ;(setHubStatus as jest.Mock).mockResolvedValue(undefined)
    const caller = inboxRouter.createCaller(mockCtx({ uid: 'mary-uid' }))
    await caller.markUnread({ id: 'm1' })
    expect(setHubStatus).toHaveBeenCalledWith('mary-uid', 'm1', 'UNREAD')
  })
})
