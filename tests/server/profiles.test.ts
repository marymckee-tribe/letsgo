import {
  listProfiles,
  upsertProfile,
  appendKnownDomain,
  listDismissedDomains,
  dismissDomain,
} from '@/lib/server/profiles'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

const makeFakeDb = () => {
  const stores: Record<string, Map<string, Record<string, unknown>>> = {
    profiles: new Map(),
    dismissedLearnPrompts: new Map(),
  }
  const mkCol = (name: string) => {
    const docs = stores[name]
    const mkDoc = (id: string) => ({
      id,
      get: async () => ({
        exists: docs.has(id),
        id,
        data: () => docs.get(id),
      }),
      set: async (d: Record<string, unknown>, opts?: { merge?: boolean }) => {
        docs.set(id, opts?.merge ? { ...(docs.get(id) ?? {}), ...d } : d)
      },
      delete: async () => { docs.delete(id) },
    })
    return {
      get: async () => ({ docs: Array.from(docs.entries()).map(([id, data]) => ({ id, data: () => data })) }),
      doc: (id: string) => mkDoc(id),
    }
  }
  return {
    db: {
      collection: () => ({
        doc: () => ({ collection: (name: string) => mkCol(name) }),
      }),
    },
    stores,
  }
}

describe('server/profiles', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('returns empty array when no profiles exist yet (caller seeds)', async () => {
    const profiles = await listProfiles('uid-1')
    expect(profiles).toEqual([])
  })

  it('upserts a new profile', async () => {
    await upsertProfile('uid-1', {
      id: 'ellie',
      name: 'Ellie',
      type: 'Child',
      currentContext: '',
      preferences: [],
      routines: [],
      sizes: {},
      medicalNotes: '',
      knownDomains: ['blessedsacrament.org'],
    })
    const profiles = await listProfiles('uid-1')
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Ellie')
    expect(profiles[0].knownDomains).toEqual(['blessedsacrament.org'])
  })

  it('appends a knownDomain without duplicating', async () => {
    await upsertProfile('uid-1', {
      id: 'annie',
      name: 'Annie',
      type: 'Child',
      currentContext: '',
      preferences: [],
      routines: [],
      sizes: {},
      medicalNotes: '',
      knownDomains: ['audaucy.org'],
    })
    await appendKnownDomain('uid-1', 'annie', 'audaucy.org')
    await appendKnownDomain('uid-1', 'annie', 'audaucy.org')
    await appendKnownDomain('uid-1', 'annie', 'art.audaucy.org')
    const profiles = await listProfiles('uid-1')
    expect(profiles[0].knownDomains).toEqual(['audaucy.org', 'art.audaucy.org'])
  })

  it('listDismissedDomains returns [] when nothing is dismissed', async () => {
    const domains = await listDismissedDomains('uid-1')
    expect(domains).toEqual([])
  })

  it('dismissDomain persists a lowercased domain with a dismissedAt timestamp', async () => {
    await dismissDomain('uid-1', 'Audaucy.ORG')
    const domains = await listDismissedDomains('uid-1')
    expect(domains).toEqual(['audaucy.org'])
  })

  it('dismissDomain is idempotent for the same domain (no duplicates)', async () => {
    await dismissDomain('uid-1', 'audaucy.org')
    await dismissDomain('uid-1', 'audaucy.org')
    await dismissDomain('uid-1', 'blessedsacrament.org')
    const domains = await listDismissedDomains('uid-1')
    expect(new Set(domains)).toEqual(new Set(['audaucy.org', 'blessedsacrament.org']))
  })
})
