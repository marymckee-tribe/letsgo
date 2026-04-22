"use client"

import type { Email, EntityProfile } from "@/lib/store"
import { QueueRow } from "./queue-row"
import { RecentlyCleared } from "./recently-cleared"
import { shouldIncludeInUnreadCount } from "./row-treatment"

interface Props {
  emails: Email[]
  profiles: EntityProfile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRestore: (id: string) => void
}

export function QueueList({ emails, profiles, selectedId, onSelect, onRestore }: Props) {
  const active = emails.filter((e) => e.hubStatus !== "CLEARED")
  const cleared = emails
    .filter((e) => e.hubStatus === "CLEARED")
    .sort((a, b) => b.date - a.date)

  const unreadCount = active.filter((e) => shouldIncludeInUnreadCount(e.classification)).length

  return (
    <aside
      aria-label="Triage queue"
      className="flex w-[320px] shrink-0 flex-col border-r border-border bg-white"
    >
      <header className="shrink-0 border-b border-border p-6">
        <h1 className="mb-2 font-heading text-3xl tracking-tight">Triage</h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {unreadCount} unread · 3 accts
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {active.length === 0 ? (
          <p className="p-8 font-serif italic text-muted-foreground">Inbox Zero achieved.</p>
        ) : (
          active.map((e) => (
            <QueueRow
              key={e.id}
              email={e}
              profiles={profiles}
              selected={selectedId === e.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <RecentlyCleared emails={cleared} onRestore={onRestore} />
    </aside>
  )
}
