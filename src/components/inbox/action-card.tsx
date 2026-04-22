"use client"

import { useState } from "react"
import { HelpCircle } from "lucide-react"
import { toast } from "sonner"
import type { EmailAction } from "@/lib/store"
import { formatClock } from "./format-time"

interface Props {
  action: EmailAction
  onSkip: (id: string) => void
  onNoop?: () => void
}

function primaryLabel(type: EmailAction["type"]): string {
  switch (type) {
    case "CALENDAR_EVENT": return "Add to Google Calendar"
    case "TODO":           return "Add to Google Tasks"
    case "NEEDS_REPLY":    return "Send reply"
  }
}

function dateInputValue(epoch?: number): string {
  if (!epoch) return ""
  const d = new Date(epoch)
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

export function ActionCard({ action, onSkip, onNoop }: Props) {
  const [title, setTitle] = useState(action.title)
  const [date, setDate] = useState(dateInputValue(action.date))
  const [time, setTime] = useState(action.time ?? (action.date ? formatClock(action.date) : ""))
  const [location, setLocation] = useState("")
  const [context, setContext] = useState(action.context ?? "PERSONAL")
  const [body, setBody] = useState("")

  const handlePrimary = () => {
    toast("Phase 3 stub", { description: "Real Google writes land in Phase 4." })
    onNoop?.()
  }

  const isLow = action.confidence === "low"

  return (
    <div className="flex flex-col border border-foreground/20 bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {action.type.replace(/_/g, " ")}
        </span>
        {isLow && (
          <button
            type="button"
            aria-label="Low confidence"
            title={`Low confidence — "${action.sourceQuote}"`}
            className="text-muted-foreground"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        )}
      </div>

      {action.type !== "NEEDS_REPLY" && (
        <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Title
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm text-foreground"
          />
        </label>
      )}

      {action.type === "CALENDAR_EVENT" && (
        <>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm" />
          </label>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Time
            <input type="text" placeholder="3:00 PM" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm font-mono" />
          </label>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Location
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm" />
          </label>
          <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Context
            <input type="text" value={context} onChange={(e) => setContext(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm" />
          </label>
        </>
      )}

      {action.type === "TODO" && (
        <>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Due date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm" />
          </label>
          <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Context
            <input type="text" value={context} onChange={(e) => setContext(e.target.value)} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm" />
          </label>
        </>
      )}

      {action.type === "NEEDS_REPLY" && (
        <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Draft
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm font-serif italic leading-relaxed" />
        </label>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <button type="button" onClick={handlePrimary} className="w-full bg-foreground py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-background hover:bg-foreground/80">
          {primaryLabel(action.type)}
        </button>
        <button type="button" onClick={() => onSkip(action.id)} className="w-full border border-border py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted">
          Skip
        </button>
      </div>
    </div>
  )
}
