import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { TrpcContext } from './context'

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape
  },
})

export { t }
export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.uid) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing or invalid Firebase ID token' })
  }
  return next({ ctx: { ...ctx, uid: ctx.uid } })
})
