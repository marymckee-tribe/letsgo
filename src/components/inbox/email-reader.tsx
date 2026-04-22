"use client"

import { useState } from "react"
import { ChevronRight, Paperclip, X } from "lucide-react"
import type { Email, EntityProfile } from "@/lib/store"
import { SenderIdentityChip } from "./sender-identity-chip"
import { formatStamp } from "./format-time"

interface Props {
  email: Email
  profiles: EntityProfile[]
  onClear: (id: string) => void
}

function parseSender(raw: string): { name: string; address: string } {
  const m = raw.match(/^"?([^"<]*?)"?\s*<([^>]+)>$/)
  if (m) return { name: m[1].trim(), address: m[2].trim() }
  return { name: "", address: raw.trim() }
}

export function EmailReader({ email, profiles, onClear }: Props) {
  const [expanded, setExpanded] = useState(false)
  const parsed = parseSender(email.sender)

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#fdfdfd]">
      <div className="flex items-start justify-between border-b border-border bg-white p-8 lg:p-12">
        <div className="min-w-0 flex-1 pr-6">
          <div className="mb-3">
            <SenderIdentityChip senderIdentity={email.senderIdentity} sender={email.sender} profiles={profiles} />
          </div>
          <h2 className="mb-4 font-heading text-3xl tracking-tight">{email.subject}</h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
            {parsed.name && <span className="text-foreground/80">{parsed.name}</span>}
            <span>{parsed.address}</span>
            <span>·</span>
            <span>{formatStamp(email.date)}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onClear(email.id)}
          className="flex shrink-0 items-center gap-2 border border-border bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:border-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
          Clear
        </button>
      </div>

      <div className="p-8 lg:p-12">
        <div
          data-testid="summary-box"
          className="border border-border bg-white p-6 font-serif text-sm italic leading-relaxed text-foreground/90"
        >
          {email.snippet}
        </div>

        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="mt-8 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          {expanded ? "Hide full email" : "Read full email"}
        </button>

        {expanded && (
          <div className="mt-6 whitespace-pre-wrap border-t border-border pt-6 font-serif text-sm leading-[1.8] text-foreground/80">
            {email.fullBody}
          </div>
        )}

        {email.attachments.length > 0 && (
          <div className="mt-8 border-t border-border pt-6">
            <h4 className="mb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Attachments
            </h4>
            <div className="flex flex-wrap gap-3">
              {email.attachments.map((a) => (
                <div key={a.id} className="flex items-center gap-3 border border-border bg-white px-4 py-3 text-xs font-medium">
                  <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="max-w-[220px] truncate">{a.filename}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
