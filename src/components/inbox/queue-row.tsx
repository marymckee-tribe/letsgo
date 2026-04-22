"use client"

import type { Email, EntityProfile } from "@/lib/store"
import { SenderIdentityChip } from "./sender-identity-chip"
import { ActionBadge, actionBadgesFor } from "./action-badge"
import { rowTreatmentFor } from "./row-treatment"
import { formatDistanceToNow } from "date-fns"

interface Props {
  email: Email
  profiles: EntityProfile[]
  selected: boolean
  onSelect: (id: string) => void
}

function waitingBadgeText(email: Email): string {
  const ago = formatDistanceToNow(new Date(email.date), { addSuffix: false })
  const person =
    email.senderIdentity?.personId
      ? email.senderIdentity.personId.charAt(0).toUpperCase() + email.senderIdentity.personId.slice(1)
      : email.senderIdentity?.orgName ?? "someone"
  return `Waiting on ${person} · ${ago}`
}

export function QueueRow({ email, profiles, selected, onSelect }: Props) {
  const treatment = rowTreatmentFor(email.classification)
  const badges = actionBadgesFor(email)

  const classes = [
    "w-full text-left p-5 border-b border-border/50 transition-colors",
    selected ? "bg-foreground text-background" : "bg-white text-foreground hover:bg-muted",
    treatment.dimmed ? "opacity-60" : "",
  ].join(" ")

  return (
    <button type="button" onClick={() => onSelect(email.id)} className={classes}>
      {email.accountEmail && (
        <span className={`block mb-1 text-[9px] font-mono ${selected ? "text-background/60" : "text-muted-foreground"}`}>
          via {email.accountEmail}
        </span>
      )}
      <div className={`mb-2 ${selected ? "[&_*]:text-background" : ""}`}>
        <SenderIdentityChip senderIdentity={email.senderIdentity} sender={email.sender} profiles={profiles} />
      </div>
      <h3 className={`mb-2 truncate font-medium ${selected ? "text-background" : "text-foreground/90"}`}>
        {email.subject}
      </h3>
      <p className={`mb-3 line-clamp-2 text-xs font-serif italic leading-relaxed ${selected ? "text-background/70" : "text-muted-foreground"}`}>
        {email.snippet}
      </p>
      <div className="flex items-center gap-2">
        {badges.map((b) => (
          <ActionBadge key={b} kind={b} />
        ))}
        {treatment.showWaitingBadge && (
          <span className={`text-[10px] ${selected ? "text-background/80" : "text-muted-foreground"}`}>
            ⏳ {waitingBadgeText(email)}
          </span>
        )}
      </div>
    </button>
  )
}
