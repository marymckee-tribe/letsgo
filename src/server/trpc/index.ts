import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import * as Sentry from '@sentry/nextjs'
import type { TrpcContext } from './context'

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    // Capture unhandled server errors to Sentry.
    // INTERNAL_SERVER_ERROR = unhandled exception (not a client mistake).
    // Sentry.init has enabled: false in test env so this is a no-op in jest.
    if (!error.code || error.code === 'INTERNAL_SERVER_ERROR') {
      Sentry.captureException(error, {
        user: ctx?.uid ? { id: ctx.uid } : undefined,
      })
    }
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
