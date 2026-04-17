// src/lib/server/session.ts
import { getAdminAuth } from './firebase-admin'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(`[${status}] ${message}`)
  }
}

export async function getUidFromRequest(req: Request): Promise<string> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token')
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return decoded.uid
  } catch (e: unknown) {
    const err = e as { message?: string }
    throw new HttpError(401, `Invalid token: ${err.message ?? 'unknown'}`)
  }
}
