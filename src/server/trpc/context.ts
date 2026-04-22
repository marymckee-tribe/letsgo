import { getAdminAuth } from '@/lib/server/firebase-admin'
import { logger, withRequestId } from '@/lib/server/logger'
import type { Logger } from 'pino'

export interface TrpcContext {
  uid?: string
  logger: Logger
  reqId: string
}

export async function createContext({ req }: { req: Request }): Promise<TrpcContext> {
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const log = withRequestId(logger, reqId)

  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return { logger: log, reqId }
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid, logger: log.child({ uid: decoded.uid }), reqId }
  } catch {
    return { logger: log, reqId }
  }
}
