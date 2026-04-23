import { TRPCError } from '@trpc/server'
import { getEmailState, type StoredAction, type StoredEmail } from './emails-store'
import { listAccounts, getDecryptedRefreshToken, type Account } from './accounts'
import { refreshAccessToken } from './google-oauth'

export interface ActionContext {
  email: StoredEmail
  action: StoredAction
  account: Account
  accessToken: string
}

export async function resolveActionContext(input: {
  uid: string
  emailId: string
  actionId: string
}): Promise<ActionContext> {
  const email = await getEmailState(input.uid, input.emailId)
  if (!email) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Email ${input.emailId} not found` })
  }
  const action = email.suggestedActions.find((a) => a.id === input.actionId)
  if (!action) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Action ${input.actionId} not on email ${input.emailId}` })
  }

  const accounts = await listAccounts(input.uid)
  const accountId = (email.accountId as string | undefined) ?? accounts[0]?.id
  const account = accounts.find((a) => a.id === accountId)
  if (!account) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Account for this email is no longer linked. Please re-add the Google account.',
    })
  }

  const rt = await getDecryptedRefreshToken(input.uid, account.id)
  if (!rt) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing refresh token. Please re-add the Google account.',
    })
  }

  try {
    const { accessToken } = await refreshAccessToken(rt)
    return { email, action, account, accessToken }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'token refresh failed'
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: `Google token refresh failed (${message}). Please re-add the account.`,
    })
  }
}
