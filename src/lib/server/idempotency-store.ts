import { getAdminDb } from './firebase-admin'

export type IdempotencyType = 'CALENDAR_EVENT' | 'TODO'

export interface IdempotencyRecord {
  googleId: string
  type: IdempotencyType
  committedAt: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('idempotencyKeys')
}

export function buildIdempotencyKey(emailId: string, actionId: string): string {
  return `${emailId}:${actionId}`
}

export async function getIdempotencyRecord(uid: string, key: string): Promise<IdempotencyRecord | null> {
  const snap = await col(uid).doc(key).get()
  if (!snap.exists) return null
  return snap.data() as IdempotencyRecord
}

export async function setIdempotencyRecord(
  uid: string,
  key: string,
  input: { googleId: string; type: IdempotencyType },
): Promise<void> {
  const record: IdempotencyRecord = {
    googleId: input.googleId,
    type: input.type,
    committedAt: Date.now(),
  }
  await col(uid).doc(key).set(record)
}
