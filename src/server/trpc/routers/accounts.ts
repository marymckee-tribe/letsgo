import { z } from 'zod'
import { router, protectedProcedure } from '../index'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    const sanitized = accounts.map(({ refreshToken: _refreshToken, ...rest }) => rest)
    return { accounts: sanitized }
  }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await deleteAccount(ctx.uid, input.id)
      return { ok: true }
    }),
})
