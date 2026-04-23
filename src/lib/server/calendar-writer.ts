export interface CalendarEventInput {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone: string } | { date: string }
  end: { dateTime: string; timeZone: string } | { date: string }
}

export interface CalendarEventResult {
  id: string
  htmlLink?: string
}

export class CalendarWriteError extends Error {
  readonly name = 'CalendarWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Calendar write failed (${res.status})`
    throw new CalendarWriteError(msg, res.status)
  }

  const data = (await res.json()) as { id: string; htmlLink?: string }
  return { id: data.id, htmlLink: data.htmlLink }
}
