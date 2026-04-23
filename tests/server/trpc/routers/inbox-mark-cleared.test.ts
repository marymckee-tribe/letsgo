import { inboxRouter } from '@/server/trpc/routers/inbox'
import {
  getEmailState,
  updateEmailHubStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { markMessageRead, GmailWriteError } from '@/lib/server/gmail-writer'

jest.mock('@/lib/server/emails-store')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-writer')

describe('inbox.markCleared', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1', hubStatus: 'UNREAD',
      suggestedActions: [{ id: 'act1', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(markMessageRead as jest.Mock).mockResolvedValue(undefined)
    ;(updateEmailHubStatus as jest.Mock).mockResolvedValue(undefined)
    ;(markOrphanActionsDismissedByClear as jest.Mock).mockResolvedValue(undefined)
  })

  it('sets hubStatus=CLEARED, marks Gmail message read, flips orphan actions', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = inboxRouter.createCaller({ uid: 'u1' } as any)
    const result = await caller.markCleared({ emailId: 'e1' })

    expect(updateEmailHubStatus).toHaveBeenCalledWith('u1', 'e1', 'CLEARED')
    expect(markMessageRead).toHaveBeenCalledWith('at', 'e1')
    expect(markOrphanActionsDismissedByClear).toHaveBeenCalledWith('u1', 'e1')
    expect(result).toEqual({ ok: true, gmailMarkReadFailed: false })
  })

  it('still flips hubStatus + orphans even when Gmail mark-read fails (non-fatal)', async () => {
    ;(markMessageRead as jest.Mock).mockRejectedValue(new GmailWriteError('scope', 403))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = inboxRouter.createCaller({ uid: 'u1' } as any)
    const result = await caller.markCleared({ emailId: 'e1' })

    expect(updateEmailHubStatus).toHaveBeenCalledWith('u1', 'e1', 'CLEARED')
    expect(markOrphanActionsDismissedByClear).toHaveBeenCalledWith('u1', 'e1')
    expect(result.ok).toBe(true)
    expect(result.gmailMarkReadFailed).toBe(true)
  })

  it('throws NOT_FOUND when the email is not in Firestore', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue(null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = inboxRouter.createCaller({ uid: 'u1' } as any)
    await expect(caller.markCleared({ emailId: 'e1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const caller = inboxRouter.createCaller({} as any)
    await expect(caller.markCleared({ emailId: 'e1' })).rejects.toThrow()
  })
})
