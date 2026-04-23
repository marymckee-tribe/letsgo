import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'

describe('createCalendarEvent', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('POSTs to /calendars/primary/events and returns the created event id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'evt-xyz', htmlLink: 'https://calendar.google.com/x' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createCalendarEvent('token123', {
      summary: 'Ellie zoo trip',
      description: 'Permission slip due',
      start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      location: 'SF Zoo',
    })

    expect(result).toEqual({ id: 'evt-xyz', htmlLink: 'https://calendar.google.com/x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      Authorization: 'Bearer token123',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body)
    expect(body.summary).toBe('Ellie zoo trip')
    expect(body.start.timeZone).toBe('America/Los_Angeles')
  })

  it('throws CalendarWriteError with statusCode on 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Calendar access forbidden' } }),
    }) as unknown as typeof fetch

    await expect(
      createCalendarEvent('token123', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      }),
    ).rejects.toMatchObject({
      name: 'CalendarWriteError',
      statusCode: 403,
      message: expect.stringContaining('Calendar access forbidden'),
    })
  })

  it('throws CalendarWriteError with statusCode on 5xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Service unavailable' } }),
    }) as unknown as typeof fetch

    await expect(
      createCalendarEvent('t', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      }),
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it('passes CalendarWriteError instanceof Error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as unknown as typeof fetch
    try {
      await createCalendarEvent('t', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      })
      fail('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CalendarWriteError)
    }
  })
})
