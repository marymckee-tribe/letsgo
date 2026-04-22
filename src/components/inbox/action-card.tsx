"use client"

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
    case "CALENDAR_EVENT": return "Add to calendar"
    case "TODO":           return "Create a todo"
    case "NEEDS_REPLY":    return "Write a reply"
  }
}

function formatDateMeta(epoch: number): string {
  return new Date(epoch).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

function metaLine(action: EmailAction): string | null {
  const parts: string[] = []
  if (action.type === "CALENDAR_EVENT") {
    if (action.date) parts.push(formatDateMeta(action.date))
    const t = action.time ?? (action.date ? formatClock(action.date) : undefined)
    if (t) parts.push(t)
    if (action.context) parts.push(action.context)
  } else if (action.type === "TODO") {
    if (action.date) parts.push(`Due ${formatDateMeta(action.date)}`)
    if (action.context) parts.push(action.context)
  }
  return parts.length ? parts.join(" · ") : null
}

export function ActionCard({ action, onSkip, onNoop }: Props) {
  const handlePrimary = () => {
    toast("Phase 3 stub", { description: "Real Google writes land in Phase 4." })
    onNoop?.()
  }

  const isLow = action.confidence === "low"
  const meta = metaLine(action)

  return (
    <div className="flex flex-col border border-foreground/20 bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.04)]">
      <div className="mb-3 flex items-center justify-between">
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

      <h4 className="mb-2 text-base font-medium leading-snug text-foreground">
        {action.title}
      </h4>

      {meta && (
        <p className="mb-4 text-xs text-muted-foreground">{meta}</p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
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
