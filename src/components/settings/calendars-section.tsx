"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-provider"
import { useHub } from "@/lib/store"

type CalendarItem = {
  accountId: string
  accountEmail: string
  calendarId: string
  calendarName: string
  selected: boolean
  profileId: string | null
}

export function CalendarsSection() {
  const { getIdToken } = useAuth()
  const { profiles } = useHub()
  const [calendars, setCalendars] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = await getIdToken()
      if (cancelled) return
      if (!token) { setCalendars([]); setLoading(false); return }
      const res = await fetch('/api/calendars', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (cancelled) return
      setCalendars(data.calendars || [])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [getIdToken])

  const handleProfileChange = async (cal: CalendarItem, profileId: string | null) => {
    // Optimistic update
    setCalendars(prev =>
      prev.map(c => c.calendarId === cal.calendarId ? { ...c, profileId } : c),
    )
    const token = await getIdToken()
    if (!token) return
    await fetch('/api/calendars', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarId: cal.calendarId,
        accountId: cal.accountId,
        calendarName: cal.calendarName,
        profileId,
      }),
    })
  }

  // Group calendars by accountEmail
  const grouped = calendars.reduce<Record<string, CalendarItem[]>>((acc, cal) => {
    const key = cal.accountEmail
    if (!acc[key]) acc[key] = []
    acc[key].push(cal)
    return acc
  }, {})

  return (
    <section id="calendars" className="mb-12">
      <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-8 pb-2 border-b border-border">
        Calendar Assignments
      </h2>
      {loading ? (
        <p className="text-sm text-muted-foreground font-serif italic">Loading…</p>
      ) : calendars.length === 0 ? (
        <p className="text-sm text-muted-foreground font-serif italic mb-6">No calendars found. Link a Google account above.</p>
      ) : (
        Object.entries(grouped).map(([email, cals]) => (
          <div key={email} className="mb-6">
            <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-3">{email}</div>
            <ul className="flex flex-col gap-3">
              {cals.map(cal => (
                <li key={cal.calendarId} className="flex items-center justify-between border border-border px-4 py-3">
                  <div>
                    <div className="font-medium text-sm">{cal.calendarName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{cal.calendarId}</div>
                  </div>
                  <select
                    value={cal.profileId ?? ""}
                    onChange={e => handleProfileChange(cal, e.target.value || null)}
                    className="text-xs font-mono border border-border px-2 py-1 bg-background text-foreground focus:outline-none"
                  >
                    <option value="">Unassigned</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
