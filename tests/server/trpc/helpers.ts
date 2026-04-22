import { createLogger, withRequestId } from '@/lib/server/logger'
import type { TrpcContext } from '@/server/trpc/context'

const _log = createLogger()

/** Build a minimal TrpcContext for router unit tests. */
export function mockCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  const reqId = overrides.reqId ?? 'test-req-id'
  return {
    reqId,
    logger: withRequestId(_log, reqId),
    ...overrides,
  }
}
