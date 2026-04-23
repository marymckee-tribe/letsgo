import { getIdempotencyRecord, setIdempotencyRecord, buildIdempotencyKey } from '@/lib/server/idempotency-store'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('idempotency-store', () => {
  const docMock = { get: jest.fn(), set: jest.fn() }
  const colMock = { doc: jest.fn(() => docMock) }
  const adminDbMock = {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ collection: jest.fn(() => colMock) })) })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue(adminDbMock)
  })

  it('buildIdempotencyKey joins emailId and actionId with a colon', () => {
    expect(buildIdempotencyKey('e1', 'a1')).toBe('e1:a1')
  })

  it('getIdempotencyRecord returns null for a missing doc', async () => {
    docMock.get.mockResolvedValue({ exists: false })
    const result = await getIdempotencyRecord('uid1', 'e1:a1')
    expect(result).toBeNull()
  })

  it('getIdempotencyRecord returns the stored record when present', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({ googleId: 'gcal-event-123', type: 'CALENDAR_EVENT', committedAt: 1700000000000 }),
    })
    const result = await getIdempotencyRecord('uid1', 'e1:a1')
    expect(result).toEqual({ googleId: 'gcal-event-123', type: 'CALENDAR_EVENT', committedAt: 1700000000000 })
  })

  it('setIdempotencyRecord writes the googleId + type + timestamp', async () => {
    docMock.set.mockResolvedValue(undefined)
    await setIdempotencyRecord('uid1', 'e1:a1', { googleId: 'gcal-event-123', type: 'CALENDAR_EVENT' })
    expect(docMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        googleId: 'gcal-event-123',
        type: 'CALENDAR_EVENT',
        committedAt: expect.any(Number),
      }),
    )
  })
})
