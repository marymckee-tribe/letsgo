"use client"

import { useState } from "react"
import { HelpCircle } from "lucide-react"
import { toast } from "sonner"
import type { EmailAction, EmailActionStatus } from "@/lib/store"
import { useCommitAction } from "@/hooks/use-commit-action"
import { DuplicateWarningDialog } from "./duplicate-warning-dialog"
import { formatClock } from "./format-time"

// ─── helpers ────────────────────────────────────────────────────────────────

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

function googleLinkFor(googleId: string): string {
  return `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(googleId)}`
}

/** Parse existingTitle from the CONFLICT error message (cause is not serialized over the wire). */
function parseConflictTitle(message: string): string | null {
  const m = message.match(/An event titled "(.+?)" already exists/)
  return m ? m[1] : null
}

// ─── ActionCardInner ─────────────────────────────────────────────────────────
// Accepts the commit shape explicitly so it can be unit-tested without a trpc
// provider. The outer ActionCard wires useCommitAction and passes it through.

export interface CommitShape {
  lastStatus: EmailActionStatus
  errorMessage: string | null
  isPending: boolean
  commitCalendar: (opts?: { force?: boolean }) => Promise<unknown>
  commitTask: () => Promise<unknown>
  dismiss: () => Promise<unknown>
  retry: () => Promise<unknown>
}

interface InnerProps {
  action: EmailAction
  commit: CommitShape
}

export function ActionCardInner({ action, commit }: InnerProps) {
  const [conflictTitle, setConflictTitle] = useState<string | null>(null)

  const effectiveStatus: EmailActionStatus =
    commit.lastStatus === "PROPOSED" ? action.status : commit.lastStatus

  const handlePrimary = async () => {
    if (action.type === "NEEDS_REPLY") {
      toast("Phase 4 stub", { description: "Reply drafting coming soon." })
      return
    }
    try {
      if (action.type === "CALENDAR_EVENT") {
        await commit.commitCalendar()
      } else {
        await commit.commitTask()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ""
      if (typeof msg === "string" && msg.includes("already exists")) {
        setConflictTitle(parseConflictTitle(msg) ?? action.title)
      }
    }
  }

  const handleAddAnyway = async () => {
    setConflictTitle(null)
    try {
      await commit.commitCalendar({ force: true })
    } catch {
      // error will be shown via errorMessage
    }
  }

  const isLow = action.confidence === "low"
  const meta = metaLine(action)

  // ── COMMITTED state ──────────────────────────────────────────────────────
  if (effectiveStatus === "COMMITTED") {
    return (
      <div
        className="flex flex-col border border-foreground/20 bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.04)]"
        data-status="committed"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {action.type.replace(/_/g, " ")}
          </span>
        </div>
        <h4 className="mb-2 text-base font-medium leading-snug text-foreground">
          {action.title}
        </h4>
        <p className="mb-4 text-xs text-green-600 font-medium" aria-live="polite">
          ✓ Done
        </p>
        {action.googleId && (
          <a
            href={googleLinkFor(action.googleId)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground underline"
          >
            View in Google Calendar
          </a>
        )}
      </div>
    )
  }

  // ── FAILED state ─────────────────────────────────────────────────────────
  if (effectiveStatus === "FAILED") {
    return (
      <div
        className="flex flex-col border border-foreground/20 bg-white p-5 shadow-[4px_4px_0_rgba(0,0,0,0.04)]"
        data-status="failed"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {action.type.replace(/_/g, " ")}
          </span>
        </div>
        <h4 className="mb-2 text-base font-medium leading-snug text-foreground">
          {action.title}
        </h4>
        {commit.errorMessage && (
          <p className="mb-3 text-xs text-red-600" role="alert">
            {commit.errorMessage}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => commit.retry()}
            disabled={commit.isPending}
            className="w-full bg-foreground py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-background hover:bg-foreground/80 disabled:opacity-50"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => commit.dismiss()}
            disabled={commit.isPending}
            className="w-full border border-border py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // ── PROPOSED / EDITING / WRITING state ───────────────────────────────────
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

      {conflictTitle && (
        <DuplicateWarningDialog
          existingTitle={conflictTitle}
          existingStart={action.date ? new Date(action.date).toISOString() : new Date().toISOString()}
          onCancel={() => setConflictTitle(null)}
          onConfirm={handleAddAnyway}
        />
      )}

      {commit.errorMessage && !conflictTitle && (
        <p className="mb-3 text-xs text-red-600" role="alert">
          {commit.errorMessage}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handlePrimary}
          disabled={commit.isPending}
          className="w-full bg-foreground py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-background hover:bg-foreground/80 disabled:opacity-50"
        >
          {commit.isPending ? "Working…" : primaryLabel(action.type)}
        </button>
        <button
          type="button"
          onClick={() => commit.dismiss()}
          disabled={commit.isPending}
          className="w-full border border-border py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

// ─── ActionCard ──────────────────────────────────────────────────────────────
// Public component. Wires useCommitAction and renders ActionCardInner.

interface Props {
  action: EmailAction
  emailId: string
  timeZone: string
}

export function ActionCard({ action, emailId, timeZone }: Props) {
  const commit = useCommitAction({ emailId, actionId: action.id, timeZone })
  return <ActionCardInner action={action} commit={commit} />
}
