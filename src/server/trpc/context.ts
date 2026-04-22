import { getAdminAuth } from '@/lib/server/firebase-admin'

export interface TrpcContext {
  uid?: string
}

export async function createContext({ req }: { req: Request }): Promise<TrpcContext> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return {}
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid }
  } catch {
    return {}
  }
}
