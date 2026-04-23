import { setCalendarMapping, listCalendarMappings, type CalendarMapping } from '@/lib/server/calendar-mappings'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('calendar-mappings color', () => {
  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDoc: jest.Mock = jest.fn(() => ({ set: mockSet, get: mockGet }))
  const mockCollection: jest.Mock = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ collection: mockCollection }) }),
    })
  })

  it('persists color when provided on set', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
      color: 'teal',
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.color).toBe('teal')
  })

  it('persists color=null when not provided', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.color).toBeNull()
  })

  it('returns color=null for docs missing the field (back-compat)', async () => {
    mockGet.mockResolvedValue({
      docs: [
        {
          id: 'c1',
          data: () => ({
            calendarId: 'c1',
            accountId: 'a1',
            calendarName: 'Work',
            profileId: null,
            updatedAt: 1,
          }),
        },
      ],
    })
    const out = await listCalendarMappings('uid')
    expect(out[0].color).toBeNull()
  })
})
