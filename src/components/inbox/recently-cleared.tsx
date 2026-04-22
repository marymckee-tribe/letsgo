"use client"

import { useState } from "react"
import { ChevronRight, RotateCcw } from "lucide-react"
import type { Email } from "@/lib/store"

interface Props {
  emails: Email[]
  onRestore: (id: string) => void
  limit?: number
}

export function RecentlyCleared({ emails, onRestore, limit = 10 }: Props) {
  const [open, setOpen] = useState(false)
  const visible = emails.slice(0, limit)

  const handleRestore = (id: string) => {
    onRestore(id)
    setOpen(false)
  }

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center gap-2 p-4 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        Recently cleared ({emails.length})
      </button>
      {open && (
        <ul>
          {visible.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-border/40 bg-white/70 p-3 opacity-70">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground/80">{e.subject}</p>
                <p className="truncate text-[10px] text-muted-foreground">{e.sender}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(e.id)}
                aria-label={`Restore ${e.subject}`}
                className="flex items-center gap-1 border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
