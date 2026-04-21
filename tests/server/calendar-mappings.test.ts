import {
  listCalendarMappings,
  getCalendarMapping,
  setCalendarMapping,
  deleteCalendarMapping,
  type CalendarMapping,
} from '@/lib/server/calendar-mappings'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('calendarMappings CRUD', () => {
  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDelete = jest.fn()
  const mockDoc: jest.Mock = jest.fn(() => ({ set: mockSet, get: mockGet, delete: mockDelete, collection: mockCollection }))
  const mockCollection: jest.Mock = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({ collection: mockCollection, settings: jest.fn() })
  })

  it('listCalendarMappings returns all docs from subcollection', async () => {
    const mapping1: CalendarMapping = {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Family',
      profileId: 'ellie',
      updatedAt: 1000,
    }
    const mapping2: CalendarMapping = {
      calendarId: 'cal2',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
      updatedAt: 2000,
    }
    mockGet.mockResolvedValue({
      docs: [
        { data: () => mapping1 },
        { data: () => mapping2 },
      ],
    })
    const result = await listCalendarMappings('mary-uid')
    expect(result).toHaveLength(2)
    expect(result[0].calendarId).toBe('cal1')
    expect(result[1].profileId).toBeNull()
  })

  it('getCalendarMapping returns null when doc does not exist', async () => {
    mockGet.mockResolvedValue({ exists: false })
    const result = await getCalendarMapping('mary-uid', 'nonexistent')
    expect(result).toBeNull()
  })

  it('getCalendarMapping returns mapping when doc exists', async () => {
    const mapping: CalendarMapping = {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Family',
      profileId: 'ellie',
      updatedAt: 1000,
    }
    mockGet.mockResolvedValue({ exists: true, data: () => mapping })
    const result = await getCalendarMapping('mary-uid', 'cal1')
    expect(result).toEqual(mapping)
  })

  it('setCalendarMapping upserts with updatedAt timestamp', async () => {
    mockSet.mockResolvedValue(undefined)
    const before = Date.now()
    await setCalendarMapping('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Family',
      profileId: 'ellie',
    })
    const after = Date.now()
    expect(mockSet).toHaveBeenCalledTimes(1)
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.calendarId).toBe('cal1')
    expect(payload.accountId).toBe('a1')
    expect(payload.calendarName).toBe('Family')
    expect(payload.profileId).toBe('ellie')
    expect(payload.updatedAt).toBeGreaterThanOrEqual(before)
    expect(payload.updatedAt).toBeLessThanOrEqual(after)
  })

  it('setCalendarMapping accepts null profileId', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('mary-uid', {
      calendarId: 'cal2',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.profileId).toBeNull()
  })

  it('deleteCalendarMapping deletes the doc', async () => {
    mockDelete.mockResolvedValue(undefined)
    await deleteCalendarMapping('mary-uid', 'cal1')
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })
})
