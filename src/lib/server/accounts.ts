import { randomUUID } from 'crypto'
import { getAdminDb } from './firebase-admin'
import { encrypt, decrypt } from './crypto'

export interface Account {
  id: string
  email: string
  displayName?: string
  refreshToken: string     // encrypted on disk
  scopes: string[]
  addedAt: number
  lastSyncedAt?: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('accounts')
}

export async function createAccount(uid: string, input: {
  email: string
  displayName?: string
  refreshToken: string
  scopes: string[]
}): Promise<string> {
  const id = randomUUID()
  const record: Account = {
    id,
    email: input.email,
    displayName: input.displayName,
    refreshToken: encrypt(input.refreshToken),
    scopes: input.scopes,
    addedAt: Date.now(),
  }
  await col(uid).doc(id).set(record)
  return id
}

export async function listAccounts(uid: string): Promise<Account[]> {
  const snap = await col(uid).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Account, 'id'>) }))
}

export async function getAccount(uid: string, accountId: string): Promise<Account | null> {
  const d = await col(uid).doc(accountId).get()
  if (!d.exists) return null
  return { id: d.id, ...(d.data() as Omit<Account, 'id'>) }
}

export async function getDecryptedRefreshToken(uid: string, accountId: string): Promise<string | null> {
  const a = await getAccount(uid, accountId)
  return a ? decrypt(a.refreshToken) : null
}

export async function deleteAccount(uid: string, accountId: string): Promise<void> {
  await col(uid).doc(accountId).delete()
}

export async function touchLastSynced(uid: string, accountId: string): Promise<void> {
  await col(uid).doc(accountId).set({ lastSyncedAt: Date.now() }, { merge: true })
}
