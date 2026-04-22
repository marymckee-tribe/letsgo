"use client"

import { useHub } from "@/lib/store"
import { trpc } from "@/lib/trpc/client"

export function CalendarsSection() {
  const utils = trpc.useUtils()
  const { profiles } = useHub()

  const { data, isLoading } = trpc.calendars.list.useQuery()
  const calendars = data?.calendars ?? []

  const updateMappingMutation = trpc.calendars.updateMapping.useMutation({
    onSuccess: () => {
      utils.calendars.list.invalidate()
    },
  })

  const handleProfileChange = (
    cal: { calendarId: string; accountId: string; calendarName: string },
    profileId: string | null,
  ) => {
    // Optimistic update: immediately reflect the change in cached data
    utils.calendars.list.setData(undefined, (old) => {
      if (!old) return old
      return {
        calendars: old.calendars.map(c =>
          c.calendarId === cal.calendarId ? { ...c, profileId } : c,
        ),
      }
    })
    updateMappingMutation.mutate({
      calendarId: cal.calendarId,
      accountId: cal.accountId,
      calendarName: cal.calendarName,
      profileId,
    })
  }

  // Group calendars by accountEmail
  const grouped = calendars.reduce<Record<string, typeof calendars>>((acc, cal) => {
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
      {isLoading ? (
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
