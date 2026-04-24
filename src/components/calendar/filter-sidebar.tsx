"use client"

import { useHub } from '@/lib/store'

export interface FilterSidebarProps {
  activeProfiles: Set<string>              // empty set = show all
  onToggleProfile: (profileId: string) => void
}

export function FilterSidebar({ activeProfiles, onToggleProfile }: FilterSidebarProps) {
  const { profiles } = useHub()

  return (
    <aside className="w-60 shrink-0 border-r border-border pr-6 flex flex-col gap-8">
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          People
        </h3>
        <ul className="flex flex-col gap-2">
          {profiles.map((p) => {
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

      <p className="text-[10px] leading-relaxed text-foreground/40">
        Calendar visibility and colors live in{' '}
        <a href="/settings" className="underline decoration-foreground/30 hover:text-foreground">
          Settings → Calendars
        </a>
        .
      </p>
    </aside>
  )
}
