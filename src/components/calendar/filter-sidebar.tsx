"use client"

import { trpc } from '@/lib/trpc/client'
import { useHub } from '@/lib/store'

export interface FilterSidebarProps {
  activeProfiles: Set<string>              // empty set = show all
  onToggleProfile: (profileId: string) => void
}

export function FilterSidebar({ activeProfiles, onToggleProfile }: FilterSidebarProps) {
  const { profiles } = useHub()
  const { data: calendarsData } = trpc.calendars.list.useQuery()
  const utils = trpc.useUtils()
  const setVisibility = trpc.calendars.setVisibility.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.calendars.list.invalidate(),
        utils.calendar.list.invalidate(),
      ])
    },
  })

  const calendars = calendarsData?.calendars ?? []

  return (
    <aside className="w-60 shrink-0 border-r border-border pr-6 flex flex-col gap-8">
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          People
        </h3>
        <ul className="flex flex-col gap-2">
          {profiles.map(p => {
            const active = activeProfiles.size === 0 || activeProfiles.has(p.id)
            return (
              <li key={p.id}>
                <button
                  onClick={() => onToggleProfile(p.id)}
                  className={`w-full text-left text-sm py-1 px-2 border-l-2 transition-colors ${
                    active ? 'border-foreground text-foreground' : 'border-transparent text-foreground/40'
                  }`}
                >
                  {p.name}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Calendars
        </h3>
        <ul className="flex flex-col gap-2">
          {calendars.map(c => (
            <li key={c.calendarId} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={c.visible}
                disabled={setVisibility.isPending}
                onChange={(e) => setVisibility.mutate({
                  calendarId: c.calendarId,
                  visible: e.target.checked,
                })}
                className="mt-1"
              />
              <div className="text-sm leading-tight">
                <div className={c.visible ? 'text-foreground' : 'text-foreground/40'}>
                  {c.calendarName}
                </div>
                <div className="text-[10px] font-mono text-foreground/30">{c.accountEmail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
