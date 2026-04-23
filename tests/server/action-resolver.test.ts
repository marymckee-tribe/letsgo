import { resolveActionContext } from '@/lib/server/action-resolver'
import { getEmailState } from '@/lib/server/emails-store'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/emails-store')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')

describe('resolveActionContext', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns { action, email, account, accessToken } on success', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1',
      accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })

    const result = await resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' })
    expect(result.action.id).toBe('act1')
    expect(result.accessToken).toBe('at')
    expect(result.account.email).toBe('mary@tribe.ai')
  })

  it('throws NOT_FOUND when the email is missing from Firestore', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue(null)
    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND when the action id is not on the email', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1', suggestedActions: [],
    })
    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws UNAUTHORIZED when refresh token is missing (account removed)', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue(null)

    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('throws UNAUTHORIZED when refreshAccessToken fails (re-link needed)', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockRejectedValue(new Error('invalid_grant'))

    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
