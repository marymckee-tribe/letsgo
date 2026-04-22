import { setHubStatus, getHubStatusMap } from '@/lib/server/inbox-status'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

const makeFakeDb = () => {
  const docs = new Map<string, Record<string, unknown>>()
  const mkDoc = (id: string) => ({
    id,
    get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
    set: async (d: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(id, opts?.merge ? { ...(docs.get(id) ?? {}), ...d } : d)
    },
  })
  const col = {
    get: async () => ({ docs: Array.from(docs.entries()).map(([id, d]) => ({ id, data: () => d })) }),
    doc: (id: string) => mkDoc(id),
  }
  return {
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    docs,
  }
}

describe('inbox-status', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('setHubStatus writes CLEARED for a messageId', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    const map = await getHubStatusMap('uid-1')
    expect(map['m1']).toEqual(expect.objectContaining({ hubStatus: 'CLEARED' }))
  })

  it('setHubStatus overwrites to UNREAD', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    await setHubStatus('uid-1', 'm1', 'UNREAD')
    const map = await getHubStatusMap('uid-1')
    expect(map['m1']).toEqual(expect.objectContaining({ hubStatus: 'UNREAD' }))
  })

  it('getHubStatusMap returns an empty object when nothing stored', async () => {
    const map = await getHubStatusMap('uid-1')
    expect(map).toEqual({})
  })

  it('setHubStatus stamps a clearedAt timestamp when status is CLEARED', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    const map = await getHubStatusMap('uid-1')
    expect(typeof map['m1'].clearedAt).toBe('number')
  })
})
