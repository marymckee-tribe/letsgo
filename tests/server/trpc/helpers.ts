import { Writable } from 'stream'
import { createLogger, withRequestId } from '@/lib/server/logger'
import type { TrpcContext } from '@/server/trpc/context'

const silentSink = new Writable({ write(_chunk, _enc, cb) { cb() } })
const _log = createLogger(silentSink)

/** Build a minimal TrpcContext for router unit tests. */
export function mockCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  const reqId = overrides.reqId ?? 'test-req-id'
  return {
    reqId,
    logger: withRequestId(_log, reqId),
    ...overrides,
  }
}
