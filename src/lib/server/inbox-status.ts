import { getAdminDb } from '@/lib/server/firebase-admin'
import type { EmailHubStatus } from '@/lib/store'

export interface HubStatusEntry {
  hubStatus: EmailHubStatus
  clearedAt?: number
}

function collectionRef(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('emailStatus')
}

export async function setHubStatus(uid: string, messageId: string, status: EmailHubStatus): Promise<void> {
  const entry: HubStatusEntry = { hubStatus: status }
  if (status === 'CLEARED') entry.clearedAt = Date.now()
  await collectionRef(uid).doc(messageId).set(entry, { merge: true })
}

export async function getHubStatusMap(uid: string): Promise<Record<string, HubStatusEntry>> {
  const snap = await collectionRef(uid).get()
  const out: Record<string, HubStatusEntry> = {}
  for (const doc of snap.docs) {
    out[doc.id] = doc.data() as HubStatusEntry
  }
  return out
}
