"use client"

import type { EntityProfile, SenderIdentity } from "@/lib/store"

interface Props {
  senderIdentity?: SenderIdentity
  sender: string
  profiles: EntityProfile[]
}

// A stable deterministic color per personId/orgName. Uses tailwind-compatible named tones.
const DOT_PALETTE = [
  "bg-rose-400",   // coral-ish, matches the Sorbet palette
  "bg-amber-400",
  "bg-emerald-400",
  "bg-sky-400",
  "bg-violet-400",
]

function dotColor(key: string | undefined): string {
  if (!key) return "bg-muted-foreground"
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) & 0xffff
  return DOT_PALETTE[hash % DOT_PALETTE.length]
}

export function SenderIdentityChip({ senderIdentity, sender, profiles }: Props) {
  const personName =
    senderIdentity?.personId
      ? profiles.find((p) => p.id === senderIdentity.personId)?.name ?? null
      : null

  const org = senderIdentity?.orgName ?? null

  const parts: string[] = []
  if (org) parts.push(org)
  if (personName) parts.push(personName)
  const label = parts.length > 0 ? parts.join(" · ") : sender

  const key = senderIdentity?.personId ?? senderIdentity?.orgName ?? sender
  const dot = dotColor(key)

  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
      <span data-testid="sender-dot" className={`inline-block h-2 w-2 rounded-none ${dot}`} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </span>
  )
}
