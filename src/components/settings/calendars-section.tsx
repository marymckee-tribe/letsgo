"use client"

import { useHub } from "@/lib/store"
import { trpc } from "@/lib/trpc/client"
import { toast } from "sonner"
import { CALENDAR_PALETTE } from "@/lib/calendar-colors"

export function CalendarsSection() {
  const utils = trpc.useUtils()
  const { profiles } = useHub()

  const { data, isLoading } = trpc.calendars.list.useQuery()
  const calendars = data?.calendars ?? []

  const setVisibility = trpc.calendars.setVisibility.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.calendars.list.invalidate(),
        utils.calendar.list.invalidate(),
      ])
    },
  })

  const setColor = trpc.calendars.setColor.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.calendars.list.invalidate(),
        utils.calendar.list.invalidate(),
      ])
    },
  })

  const updateMappingMutation = trpc.calendars.updateMapping.useMutation({
    onMutate: async (input) => {
      await utils.calendars.list.cancel()
      const previous = utils.calendars.list.getData()
      utils.calendars.list.setData(undefined, (old) => {
        if (!old) return old
        return {
          calendars: old.calendars.map((c) =>
            c.calendarId === input.calendarId && c.accountId === input.accountId
              ? { ...c, profileId: input.profileId }
              : c
          ),
        }
      })
      return { previous }
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        utils.calendars.list.setData(undefined, context.previous)
      }
      toast("SYNC ERROR", { description: "Couldn't save calendar mapping — reverting." })
    },
    onSettled: () => {
      utils.calendars.list.invalidate()
    },
  })

  const handleProfileChange = (
    cal: { calendarId: string; accountId: string; calendarName: string },
    profileId: string | null,
  ) => {
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
      <h2 className="text-xs uppercase tracking-widest font-semibold text-muted-foreground mb-8 pb-2 border-b border-border">
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
                <li key={cal.calendarId} className="border border-border px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{cal.calendarName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{cal.calendarId}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cal.visible}
                          disabled={setVisibility.isPending}
                          onChange={(e) => setVisibility.mutate({ calendarId: cal.calendarId, visible: e.target.checked })}
                          className="accent-foreground w-3.5 h-3.5 disabled:opacity-40"
                        />
                        <span className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Visible</span>
                      </label>
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
                    </div>
                  </div>
                  {/* Color picker — inline swatch row */}
                  <div className="flex items-center gap-1 mt-2">
                    {CALENDAR_PALETTE.map((p) => {
                      const selected = (cal.color ?? null) === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-label={`${p.label} color`}
                          title={p.label}
                          disabled={setColor.isPending}
                          onClick={() => setColor.mutate({ calendarId: cal.calendarId, colorId: p.id })}
                          className={`h-4 w-4 rounded-full border transition-all ${
                            selected
                              ? 'ring-2 ring-offset-1 ring-foreground/80 border-transparent'
                              : 'border-black/10 hover:scale-110'
                          }`}
                          style={{ backgroundColor: p.main }}
                        />
                      )
                    })}
                    {(cal.color ?? null) !== null && (
                      <button
                        type="button"
                        aria-label="Reset color"
                        title="Reset"
                        disabled={setColor.isPending}
                        onClick={() => setColor.mutate({ calendarId: cal.calendarId, colorId: null })}
                        className="text-xs text-muted-foreground hover:text-foreground ml-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
