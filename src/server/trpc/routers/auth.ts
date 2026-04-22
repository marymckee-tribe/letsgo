import { router, protectedProcedure } from '../index'
import { buildAuthUrl } from '@/lib/server/google-oauth'

export const authRouter = router({
  google: router({
    start: protectedProcedure.query(async ({ ctx }) => {
      const url = buildAuthUrl(ctx.uid)
      return { url }
    }),
  }),
})
