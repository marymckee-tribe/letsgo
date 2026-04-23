const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export interface DuplicateMatch {
  id: string
  title: string
  start: string
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isFuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  // Containment match — "Ellie zoo trip" vs "Ellie's zoo trip (class A)"
  if (na.length >= 4 && nb.includes(na)) return true
  if (nb.length >= 4 && na.includes(nb)) return true
  return false
}

export async function findDuplicateCalendarEvent(
  accessToken: string,
  input: { title: string; startDateTime: string },
): Promise<DuplicateMatch | null> {
  const startMs = new Date(input.startDateTime).getTime()
  const timeMin = new Date(startMs - TWO_HOURS_MS).toISOString()
  const timeMax = new Date(startMs + TWO_HOURS_MS).toISOString()

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=25`

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }>
    }
    const match = (data.items ?? []).find(
      (e) => e.summary && isFuzzyMatch(e.summary, input.title),
    )
    if (!match) return null
    return {
      id: match.id,
      title: match.summary!,
      start: match.start?.dateTime ?? match.start?.date ?? '',
    }
  } catch {
    return null
  }
}
