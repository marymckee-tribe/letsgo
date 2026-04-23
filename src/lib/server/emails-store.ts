import { getAdminDb } from './firebase-admin'

export type EmailHubStatus = 'UNREAD' | 'READ' | 'CLEARED'

export type StoredActionStatus =
  | 'PROPOSED'
  | 'EDITING'
  | 'WRITING'
  | 'COMMITTED'
  | 'DISMISSED'
  | 'FAILED'
  | 'DISMISSED_BY_CLEAR'

export interface StoredAction {
  id: string
  status: StoredActionStatus
  googleId?: string
  errorMessage?: string
  // remaining fields (title, date, time, etc.) mirror the Phase 2 EmailAction shape
  [key: string]: unknown
}

export interface StoredEmail {
  id: string
  hubStatus: EmailHubStatus
  suggestedActions: StoredAction[]
  [key: string]: unknown
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('emails')
}

export async function getEmailState(uid: string, emailId: string): Promise<StoredEmail | null> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) return null
  return snap.data() as StoredEmail
}

export async function upsertEmailState(uid: string, email: StoredEmail): Promise<void> {
  await col(uid).doc(email.id).set(email, { merge: true })
}

export async function updateEmailHubStatus(
  uid: string,
  emailId: string,
  hubStatus: EmailHubStatus,
): Promise<void> {
  await col(uid).doc(emailId).set({ hubStatus }, { merge: true })
}

export async function updateActionStatus(
  uid: string,
  emailId: string,
  actionId: string,
  patch: Partial<StoredAction>,
): Promise<void> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) {
    throw new Error(`Email ${emailId} not found in Firestore`)
  }
  const data = snap.data() as StoredEmail
  const next = (data.suggestedActions ?? []).map((a) =>
    a.id === actionId ? { ...a, ...patch } : a,
  )
  await col(uid).doc(emailId).set({ suggestedActions: next }, { merge: true })
}

export async function markOrphanActionsDismissedByClear(
  uid: string,
  emailId: string,
): Promise<void> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) return
  const data = snap.data() as StoredEmail
  const next = (data.suggestedActions ?? []).map((a) => {
    if (a.status === 'PROPOSED' || a.status === 'EDITING') {
      return { ...a, status: 'DISMISSED_BY_CLEAR' as const }
    }
    return a
  })
  await col(uid).doc(emailId).set({ suggestedActions: next }, { merge: true })
}
