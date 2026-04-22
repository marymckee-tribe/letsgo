import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

export const gmailRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const emails = await fetchUnreadPrimary(accessToken)
        return emails.map(e => ({ ...e, accountId: acc.id, accountEmail: acc.email }))
      } catch (err: unknown) {
        const e = err as { message?: string }
        return { _error: { accountId: acc.id, message: e.message ?? 'Unknown error' } }
      }
    }))
    const emails = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => (!Array.isArray(r) && '_error' in r ? [r._error] : []))
    return { emails, errors }
  }),
})
