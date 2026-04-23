import {
  getEmailState,
  updateEmailHubStatus,
  updateActionStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('emails-store', () => {
  const docMock = { get: jest.fn(), set: jest.fn(), update: jest.fn() }
  const colMock = { doc: jest.fn(() => docMock) }
  const adminDbMock = {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ collection: jest.fn(() => colMock) })) })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue(adminDbMock)
  })

  it('getEmailState returns null for a missing doc', async () => {
    docMock.get.mockResolvedValue({ exists: false })
    expect(await getEmailState('uid1', 'e1')).toBeNull()
  })

  it('updateEmailHubStatus merges hubStatus into the email doc', async () => {
    docMock.set.mockResolvedValue(undefined)
    await updateEmailHubStatus('uid1', 'e1', 'CLEARED')
    expect(docMock.set).toHaveBeenCalledWith({ hubStatus: 'CLEARED' }, { merge: true })
  })

  it('updateActionStatus merges the action state by actionId', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({
        hubStatus: 'UNREAD',
        suggestedActions: [
          { id: 'a1', status: 'PROPOSED' },
          { id: 'a2', status: 'PROPOSED' },
        ],
      }),
    })
    docMock.set.mockResolvedValue(undefined)
    await updateActionStatus('uid1', 'e1', 'a1', { status: 'COMMITTED', googleId: 'gcal-1' })
    const call = docMock.set.mock.calls[0][0]
    expect(call.suggestedActions).toEqual([
      { id: 'a1', status: 'COMMITTED', googleId: 'gcal-1' },
      { id: 'a2', status: 'PROPOSED' },
    ])
  })

  it('markOrphanActionsDismissedByClear flips only PROPOSED/EDITING actions', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({
        suggestedActions: [
          { id: 'a1', status: 'PROPOSED' },
          { id: 'a2', status: 'COMMITTED', googleId: 'gcal-1' },
          { id: 'a3', status: 'EDITING' },
          { id: 'a4', status: 'FAILED' },
        ],
      }),
    })
    docMock.set.mockResolvedValue(undefined)
    await markOrphanActionsDismissedByClear('uid1', 'e1')
    const call = docMock.set.mock.calls[0][0]
    expect(call.suggestedActions.map((a: { id: string; status: string }) => [a.id, a.status])).toEqual([
      ['a1', 'DISMISSED_BY_CLEAR'],
      ['a2', 'COMMITTED'],
      ['a3', 'DISMISSED_BY_CLEAR'],
      ['a4', 'FAILED'],
    ])
  })
})
