// src/lib/server/calendar-fetcher.ts

interface CalendarEvent {
  id: string
  iCalUID?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  location?: string
}

interface CalendarListEntry {
  id: string
  summary?: string
  selected?: boolean
  primary?: boolean
  accessRole?: string
}

export async function fetchCalendarEvents(accessToken: string): Promise<Record<string, unknown>[]> {
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()

  const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const listData = await listRes.json()
  if (listData.error) throw new Error(listData.error.message || 'Calendar list failed')

  const calendars: CalendarListEntry[] = (listData.items || []).filter(
    (c: CalendarListEntry) => c.selected !== false && c.accessRole !== 'freeBusyReader',
  )

  const perCalendar = await Promise.all(calendars.map(async (cal) => {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      const data = await res.json()
      if (data.error) return []
      return (data.items || []).map((e: CalendarEvent) => ({
        id: e.id,
        iCalUID: e.iCalUID,
        title: e.summary,
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        location: e.location,
        calendarId: cal.id,
        calendarName: cal.summary,
      }))
    } catch {
      return []
    }
  }))

  return perCalendar.flat()
}
