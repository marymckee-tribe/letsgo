/**
 * Tests that the tRPC errorFormatter in src/server/trpc/index.ts
 * calls Sentry.captureException for INTERNAL_SERVER_ERROR (and unknown errors
 * that tRPC wraps as such), but NOT for any 4xx client-error codes.
 *
 * NOTE: createCaller() bypasses the errorFormatter — it re-throws directly.
 * The formatter only runs on the HTTP adapter path, so we use fetchRequestHandler.
 */
jest.mock('@sentry/nextjs', () => ({ captureException: jest.fn() }))

import { TRPCError } from '@trpc/server'
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import * as Sentry from '@sentry/nextjs'
import { t } from '@/server/trpc'
import { mockCtx } from './helpers'

// ---------------------------------------------------------------------------
// Minimal test router — one procedure per error variant
// ---------------------------------------------------------------------------
const testRouter = t.router({
  throwBadRequest: t.procedure.query(() => {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'bad input' })
  }),
  throwUnauthorized: t.procedure.query(() => {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'not allowed' })
  }),
  throwTooMany: t.procedure.query(() => {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'slow down' })
  }),
  throwInternal: t.procedure.query(() => {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'kaboom' })
  }),
  throwUnknown: t.procedure.query(() => {
    throw new Error('totally unhandled')
  }),
})

// ---------------------------------------------------------------------------
// Helper: call a procedure through the HTTP adapter and return the response.
// The adapter invokes the errorFormatter, which is what we're pinning.
// ---------------------------------------------------------------------------
async function callViaHttp(procedureName: string): Promise<Response> {
  const req = new Request(`http://localhost/test/${procedureName}`, {
    method: 'GET',
  })
  return fetchRequestHandler({
    endpoint: '/test',
    req,
    router: testRouter,
    createContext: () => mockCtx({}),
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('tRPC errorFormatter – Sentry capture behaviour', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does NOT call Sentry.captureException for BAD_REQUEST (4xx)', async () => {
    await callViaHttp('throwBadRequest')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('does NOT call Sentry.captureException for UNAUTHORIZED (4xx)', async () => {
    await callViaHttp('throwUnauthorized')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('does NOT call Sentry.captureException for TOO_MANY_REQUESTS (4xx)', async () => {
    await callViaHttp('throwTooMany')
    expect(Sentry.captureException).not.toHaveBeenCalled()
  })

  it('DOES call Sentry.captureException exactly once for INTERNAL_SERVER_ERROR (5xx)', async () => {
    await callViaHttp('throwInternal')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })

  it('DOES call Sentry.captureException exactly once for an unhandled Error (tRPC wraps as 5xx)', async () => {
    await callViaHttp('throwUnknown')
    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
  })
})
