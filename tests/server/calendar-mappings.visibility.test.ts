import { setCalendarMapping, listCalendarMappings, type CalendarMapping } from '@/lib/server/calendar-mappings'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('calendar-mappings visibility', () => {
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

  it('persists visible=true by default when omitted on set', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.visible).toBe(true)
  })

  it('persists visible=false when provided explicitly', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
      visible: false,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.visible).toBe(false)
  })

  it('returns visible=true for docs missing the field (back-compat)', async () => {
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
    expect(out[0].visible).toBe(true)
  })
})
