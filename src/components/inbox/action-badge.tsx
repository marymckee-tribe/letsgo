"use client"

import type { Email } from "@/lib/store"

export type BadgeKind = "CAL" | "TODO" | "REPLY" | "PDF"

export function actionBadgesFor(email: Email): BadgeKind[] {
  const out: BadgeKind[] = []
  const seen = new Set<BadgeKind>()
  for (const a of email.suggestedActions) {
    let kind: BadgeKind | null = null
    if (a.type === "CALENDAR_EVENT") kind = "CAL"
    else if (a.type === "TODO") kind = "TODO"
    else if (a.type === "NEEDS_REPLY") kind = "REPLY"
    if (kind && !seen.has(kind)) {
      out.push(kind)
      seen.add(kind)
    }
  }
  if (email.attachments.length > 0 && !seen.has("PDF")) {
    out.push("PDF")
  }
  // Stable CAL/TODO/REPLY/PDF order
  const order: BadgeKind[] = ["CAL", "TODO", "REPLY", "PDF"]
  return out.sort((a, b) => order.indexOf(a) - order.indexOf(b))
}

interface BadgeProps {
  kind: BadgeKind
}

export function ActionBadge({ kind }: BadgeProps) {
  return (
    <span className="inline-flex items-center justify-center border border-foreground/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
      {kind}
    </span>
  )
}
