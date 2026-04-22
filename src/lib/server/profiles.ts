import { getAdminDb } from './firebase-admin'
import type { EntityProfile } from '@/lib/store'

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('profiles')
}

export async function listProfiles(uid: string): Promise<EntityProfile[]> {
  const snap = await col(uid).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EntityProfile, 'id'>) }))
}

export async function getProfile(uid: string, profileId: string): Promise<EntityProfile | null> {
  const d = await col(uid).doc(profileId).get()
  if (!d.exists) return null
  return { id: d.id, ...(d.data() as Omit<EntityProfile, 'id'>) }
}

export async function upsertProfile(uid: string, profile: EntityProfile): Promise<void> {
  const { id, ...rest } = profile
  await col(uid).doc(id).set(rest, { merge: true })
}

export async function appendKnownDomain(uid: string, profileId: string, domain: string): Promise<void> {
  const existing = await getProfile(uid, profileId)
  if (!existing) return
  const known = new Set(existing.knownDomains ?? [])
  known.add(domain.toLowerCase())
  await upsertProfile(uid, { ...existing, knownDomains: Array.from(known) })
}

export async function appendKnownSender(uid: string, profileId: string, sender: string): Promise<void> {
  const existing = await getProfile(uid, profileId)
  if (!existing) return
  const known = new Set(existing.knownSenders ?? [])
  known.add(sender)
  await upsertProfile(uid, { ...existing, knownSenders: Array.from(known) })
}

export const DEFAULT_SEED_PROFILES: EntityProfile[] = [
  { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'doug', name: 'Doug', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'annie', name: 'Annie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'ness', name: 'Ness', type: 'Pet', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

export async function seedProfilesIfEmpty(uid: string): Promise<EntityProfile[]> {
  const existing = await listProfiles(uid)
  if (existing.length > 0) return existing
  for (const p of DEFAULT_SEED_PROFILES) {
    await upsertProfile(uid, p)
  }
  return DEFAULT_SEED_PROFILES
}

function dismissedCol(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('dismissedLearnPrompts')
}

export async function listDismissedDomains(uid: string): Promise<string[]> {
  const snap = await dismissedCol(uid).get()
  return snap.docs.map(d => d.id)
}

export async function dismissDomain(uid: string, domain: string): Promise<void> {
  const key = domain.toLowerCase()
  await dismissedCol(uid).doc(key).set({ dismissedAt: Date.now() }, { merge: true })
}
