import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'

describe('findDuplicateCalendarEvent', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('returns null when no events come back', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })

  it('returns the event when title matches case-insensitive in the window', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'evt-1',
            summary: 'ELLIE ZOO TRIP',
            start: { dateTime: '2026-05-15T10:00:00-07:00' },
          },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toEqual({
      id: 'evt-1',
      title: 'ELLIE ZOO TRIP',
      start: '2026-05-15T10:00:00-07:00',
    })
  })

  it('ignores events whose title is materially different', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'evt-1', summary: 'Dentist appointment', start: { dateTime: '2026-05-15T10:00:00-07:00' } },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })

  it('queries the ±2h window via timeMin/timeMax', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await findDuplicateCalendarEvent('token', {
      title: 'x',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    const timeMin = new Date(url.searchParams.get('timeMin')!).getTime()
    const timeMax = new Date(url.searchParams.get('timeMax')!).getTime()
    const start = new Date('2026-05-15T09:30:00-07:00').getTime()
    expect(start - timeMin).toBe(2 * 60 * 60 * 1000)
    expect(timeMax - start).toBe(2 * 60 * 60 * 1000)
  })

  it('returns null on API error instead of throwing (fail-open)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'oops' } }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'x',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })
})
