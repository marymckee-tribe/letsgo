// src/lib/server/calendar-fetcher.ts
export async function fetchCalendarEvents(accessToken: string): Promise<any[]> {
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Calendar fetch failed')
  return (data.items || []).map((e: any) => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location,
  }))
}
