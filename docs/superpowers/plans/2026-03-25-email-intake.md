# Email Intake Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Bouncer accordion widget on the home page with a card list + Sheet panel email triage experience, with PDF extraction, directive cherry-picking, and attachment kid-assignment.

**Architecture:** Upgrade `bouncer.tsx` to a card list; add `email-sheet.tsx` as a Sheet side panel (same pattern as existing Events/Tasks sheets); add `TerminalContext` to wire "Send to Terminal" across sibling components; extend the digest API route with PDF extraction via `pdf-parse`. Remove the now-redundant `/inbox` page.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, shadcn/ui Sheet, AI SDK (`generateObject`), Gmail API, `pdf-parse`

---

> **Note on testing:** This project has no test framework configured. Verification steps use the dev server and browser. Do not add Jest or any test infrastructure as part of this plan.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/lib/store.tsx` | Add `status`, `attachmentAssignments` to `Email` type; add 4 new store actions |
| Create | `src/lib/terminal-context.tsx` | `TerminalContext` — exposes `seedTerminal(content)` to sibling components |
| Modify | `src/app/layout.tsx` | Wrap app in `TerminalProvider` |
| Modify | `src/components/widgets/brain-dump.tsx` | Consume `useTerminal` to receive and apply seeded content |
| Modify | `src/app/api/inbox/digest/route.ts` | Add `GROCERY_ITEM` to schema; add PDF extraction via `pdf-parse` |
| Replace | `src/components/widgets/bouncer.tsx` | Card list with pills, duplicate detection, Approve All / Dismiss / Send to Terminal |
| Create | `src/components/widgets/email-sheet.tsx` | Sheet panel: AI summary, full body, directive cherry-pick, attachment assignment |
| Modify | `src/components/nav.tsx` | Remove Inbox nav link |
| Delete | `src/app/inbox/page.tsx` | No longer needed |

---

## Task 1: Install pdf-parse

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install the package**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude"
npm install pdf-parse
npm install --save-dev @types/pdf-parse
```

Expected: both packages appear in `package.json` dependencies.

- [ ] **Step 2: Verify import works**

In the terminal, confirm no type errors by checking the types are present:

```bash
ls node_modules/@types/pdf-parse
```

Expected: directory exists with `index.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add pdf-parse for attachment text extraction"
```

---

## Task 2: Update Email type and store actions

**Files:**
- Modify: `src/lib/store.tsx`

This task updates the data model before any UI is built. Everything else depends on it.

- [ ] **Step 1: Add `status` and `attachmentAssignments` to the `Email` type**

In `src/lib/store.tsx`, update the `Email` type (currently around line 50):

```ts
export type Email = {
  id: string
  subject: string
  sender: string
  snippet: string
  fullBody: string
  attachments: { filename: string, mimeType: string, size?: number }[]
  suggestedActions: EmailAction[]
  date: number
  status: "PENDING" | "PROCESSED"
  attachmentAssignments: Record<string, "none" | "ellie" | "annie" | "both">
}
```

- [ ] **Step 2: Add new store actions to the `HubState` interface**

Find the `interface HubState` block and add:

```ts
acceptAllEmailActions: (emailId: string) => void
dismissEmail: (emailId: string) => void
clearEmail: (emailId: string) => void
setAttachmentAssignment: (emailId: string, filename: string, assignment: "none" | "ellie" | "annie" | "both") => void
```

- [ ] **Step 3: Update mock emails to include new fields**

Find `mockEmails` and add the new fields:

```ts
const mockEmails: Email[] = [
  {
    id: "1", subject: "School Permission Slip", sender: "School Admin",
    snippet: "The school requires a signed waiver for the upcoming zoo field trip...",
    fullBody: "Hello parents, don't forget the waiver for the zoo outing next week.",
    attachments: [{ filename: "waiver.pdf", mimeType: "application/pdf", size: 84000 }],
    suggestedActions: [{ id: "A1", type: "TODO_ITEM", title: "Sign Waiver", context: "FAMILY", status: "PENDING" }],
    date: Date.now() - 600000,
    status: "PENDING",
    attachmentAssignments: {}
  }
]
```

- [ ] **Step 4: Implement the 4 new store actions inside `HubProvider`**

Add these after the existing `dismissEmailAction` implementation:

```ts
const acceptAllEmailActions = (emailId: string) => {
  setEmails(prev => prev.map(e => {
    if (e.id !== emailId) return e
    e.suggestedActions.forEach(a => {
      if (a.status !== "PENDING") return
      if (a.type === "CALENDAR_INVITE") addEvent({ id: Math.random().toString(), title: a.title, time: a.time || "12:00", date: a.date || 1 })
      else if (a.type === "TODO_ITEM") addTask({ id: Math.random().toString(), title: a.title, context: a.context || "PERSONAL", completed: false })
      else if (a.type === "GROCERY_ITEM") addGrocery({ id: Math.random().toString(), name: a.title })
    })
    return { ...e, status: "PROCESSED", suggestedActions: e.suggestedActions.map(a => a.status === "PENDING" ? { ...a, status: "APPROVED" } : a) }
  }))
  toast("ACTION CONFIRMED", { description: "All directives approved." })
}

const dismissEmail = (emailId: string) => {
  setEmails(prev => prev.map(e => e.id === emailId ? { ...e, status: "PROCESSED" } : e))
  toast("SYSTEM", { description: "Email dismissed." })
}

const clearEmail = (emailId: string) => {
  setEmails(prev => prev.filter(e => e.id !== emailId))
}

const setAttachmentAssignment = (emailId: string, filename: string, assignment: "none" | "ellie" | "annie" | "both") => {
  setEmails(prev => prev.map(e => e.id !== emailId ? e : {
    ...e,
    attachmentAssignments: { ...e.attachmentAssignments, [filename]: assignment }
  }))
}
```

- [ ] **Step 5: Add new actions to the `HubContext.Provider` value**

Update the `value` prop on the Provider to include the 4 new actions:

```ts
<HubContext.Provider value={{
  events, scheduleInsights, tasks, groceries, emails, profiles,
  addEvent, addTask, addGrocery, toggleTask,
  actOnEmailAction, dismissEmailAction,
  acceptAllEmailActions, dismissEmail, clearEmail, setAttachmentAssignment
}}>
```

- [ ] **Step 6: Ensure emails initialise with new fields during hydration**

In `hydrateEmails`, after `setEmails(data.emails)`, the API response won't include `status` or `attachmentAssignments`. Update the mapping in the digest route response (done in Task 3). For now, update the store hydration to defensively default them:

```ts
setEmails(data.emails.map((e: any) => ({
  ...e,
  status: e.status ?? "PENDING",
  attachmentAssignments: e.attachmentAssignments ?? {}
})))
```

- [ ] **Step 7: Verify no TypeScript errors**

```bash
cd "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude"
npx tsc --noEmit
```

Expected: no errors related to the Email type or store.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat: add Email status, attachmentAssignments, and 4 new store actions"
```

---

## Task 3: Update the digest API route (GROCERY_ITEM + PDF extraction)

**Files:**
- Modify: `src/app/api/inbox/digest/route.ts`

- [ ] **Step 1: Add `GROCERY_ITEM` to the action schema and update the prompt**

At the top of the file, update `EmailSchema`:

```ts
type: z.enum(["CALENDAR_INVITE", "TODO_ITEM", "GROCERY_ITEM"]),
```

Update the AI prompt string to include grocery extraction:

```ts
const prompt = `You are a Chief of Staff AI. Extract and clean the following emails into high-signal summaries. Strip all noise. Identify embedded instructions requiring physical execution and structure them into the suggestedActions array. This includes calendar events (CALENDAR_INVITE), tasks and to-dos (TODO_ITEM), and grocery or shopping items (GROCERY_ITEM).\n\nEmails:\n${JSON.stringify(rawEmails, null, 2)}`
```

- [ ] **Step 2: Add PDF extraction helper function**

Add this function before the `POST` handler. It detects deferral language and, if found, fetches and parses the PDF:

```ts
import pdfParse from 'pdf-parse'

const DEFERRAL_PATTERNS = [
  /see attached/i, /see the attached/i, /refer to the attached/i,
  /details in the pdf/i, /details in the attachment/i,
  /enclosed pdf/i, /enclosed document/i,
  /attached form/i, /attached schedule/i, /attached document/i,
]

function hasDeferralLanguage(text: string): boolean {
  return DEFERRAL_PATTERNS.some(p => p.test(text))
}

async function extractPdfText(attachmentId: string, messageId: string, accessToken: string): Promise<string> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const data = await res.json()
    const buffer = Buffer.from(data.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    const parsed = await pdfParse(buffer)
    return parsed.text.trim()
  } catch {
    return '[text extraction failed — likely a scanned document]'
  }
}
```

- [ ] **Step 3: Wire PDF extraction into the email fetch loop**

Inside the `Promise.all` that builds `rawEmails`, after extracting `body` and `attachments`, add:

```ts
// PDF extraction for emails that defer to attachments
let enrichedBody = body.substring(0, 4000)
if (hasDeferralLanguage(enrichedBody)) {
  const pdfAttachments = msgData.payload?.parts?.filter((p: any) =>
    p.mimeType === 'application/pdf' && p.body?.attachmentId
  ) || []
  for (const pdf of pdfAttachments) {
    const pdfText = await extractPdfText(pdf.body.attachmentId, msg.id, accessToken)
    enrichedBody += `\n\n[ATTACHED PDF: ${pdf.filename || 'document.pdf'}]\n${pdfText.substring(0, 2000)}`
  }
}

return {
  id: msgData.id,
  subject: getHeader("subject"),
  sender: getHeader("from").split('<')[0].trim(),
  content: enrichedBody,   // was: body.substring(0, 4000)
  attachments: attachments,
  date: parseInt(msgData.internalDate || Date.now().toString(), 10)
}
```

- [ ] **Step 4: Add attachment size to the extracted data**

In `extractAttachments`, include the size from the Gmail payload:

```ts
const extractAttachments = (payload: any): any[] => {
  if (!payload) return []
  let atts: any[] = []
  if (payload.filename && payload.filename.length > 0) {
    atts.push({
      filename: payload.filename,
      mimeType: payload.mimeType,
      size: payload.body?.size ?? 0
    })
  }
  if (payload.parts) {
    payload.parts.forEach((p: any) => { atts.push(...extractAttachments(p)) })
  }
  return atts
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/inbox/digest/route.ts
git commit -m "feat: add GROCERY_ITEM extraction and PDF text parsing to inbox digest"
```

---

## Task 4: Create TerminalContext

**Files:**
- Create: `src/lib/terminal-context.tsx`

- [ ] **Step 1: Create the context file**

```ts
"use client"

import React, { createContext, useContext, useRef, useCallback } from "react"

type TerminalContextType = {
  seedTerminal: (content: string) => void
  registerSeed: (fn: (content: string) => void) => void
}

const TerminalContext = createContext<TerminalContextType | undefined>(undefined)

export function TerminalProvider({ children }: { children: React.ReactNode }) {
  const seedFnRef = useRef<((content: string) => void) | null>(null)

  const registerSeed = useCallback((fn: (content: string) => void) => {
    seedFnRef.current = fn
  }, [])

  const seedTerminal = useCallback((content: string) => {
    seedFnRef.current?.(content)
  }, [])

  return (
    <TerminalContext.Provider value={{ seedTerminal, registerSeed }}>
      {children}
    </TerminalContext.Provider>
  )
}

export function useTerminal() {
  const ctx = useContext(TerminalContext)
  if (!ctx) throw new Error("useTerminal must be used within TerminalProvider")
  return ctx
}
```

- [ ] **Step 2: Wrap the app with TerminalProvider in layout.tsx**

Open `src/app/layout.tsx`. Import `TerminalProvider` and wrap the children (inside the existing `HubProvider`):

```tsx
import { TerminalProvider } from "@/lib/terminal-context"

// Inside the JSX, wrap children:
<HubProvider>
  <TerminalProvider>
    {children}
  </TerminalProvider>
</HubProvider>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/terminal-context.tsx src/app/layout.tsx
git commit -m "feat: add TerminalContext for cross-component terminal seeding"
```

---

## Task 5: Wire BrainDump to TerminalContext

**Files:**
- Modify: `src/components/widgets/brain-dump.tsx`

- [ ] **Step 1: Import and consume `useTerminal`**

At the top of `brain-dump.tsx`, add:

```ts
import { useTerminal } from "@/lib/terminal-context"
```

Inside the `BrainDump` component, add:

```ts
const { registerSeed } = useTerminal()
```

- [ ] **Step 2: Register the seed function**

After the `localInput` state declaration, add a `useEffect` that registers the setter:

```ts
useEffect(() => {
  registerSeed((content: string) => {
    setLocalInput(content)
    setIsExpanded(true)
    // Scroll Terminal into view
    const el = document.getElementById("terminal-section")
    el?.scrollIntoView({ behavior: "smooth" })
  })
}, [registerSeed])
```

- [ ] **Step 3: Add an id to the Terminal container for scroll targeting**

In the `BrainDump` return, add `id="terminal-section"` to the outermost `<div>`:

```tsx
<div id="terminal-section" className={`flex flex-col gap-4 ...`}>
```

- [ ] **Step 4: Verify the app runs without errors**

```bash
npm run dev
```

Open `http://localhost:3000`. Confirm home page loads without console errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/brain-dump.tsx
git commit -m "feat: wire BrainDump to TerminalContext for pre-seeded input"
```

---

## Task 6: Build EmailSheet component

**Files:**
- Create: `src/components/widgets/email-sheet.tsx`

This is the Sheet panel that opens when a card is tapped. It uses the same `Sheet` component already used in `dashboard-cards.tsx`.

- [ ] **Step 1: Create the file**

```tsx
"use client"

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useHub } from "@/lib/store"
import type { Email } from "@/lib/store"

type Props = {
  email: Email | null
  open: boolean
  onClose: () => void
}

const TYPE_LABELS: Record<string, string> = {
  CALENDAR_INVITE: "EVENT",
  TODO_ITEM: "DIRECTIVE",
  GROCERY_ITEM: "PROVISION",
}

export function EmailSheet({ email, open, onClose }: Props) {
  const { actOnEmailAction, dismissEmailAction, setAttachmentAssignment } = useHub()

  if (!email) return null

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent side="right" className="w-[500px] sm:w-[600px] border-l border-black bg-white p-0 shadow-none sm:max-w-none text-black flex flex-col overflow-hidden">

        {/* Header */}
        <SheetHeader className="px-12 pt-10 pb-6 border-b border-black/10 shrink-0">
          <SheetTitle className="font-heading text-2xl font-light tracking-tighter text-black leading-tight">
            {email.subject}
          </SheetTitle>
          <p className="text-[10px] font-mono text-black/40 mt-2">
            {email.sender} · {new Date(email.date).toLocaleString()}
          </p>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* AI Summary */}
          <div className="mx-12 mt-8 mb-0 bg-[#e8f0fe] border-l-[3px] border-[#4285f4] px-5 py-4">
            <p className="text-xs text-[#1a56db] italic leading-relaxed">{email.snippet}</p>
          </div>

          {/* Full body */}
          <div className="px-12 py-6 text-sm font-serif italic text-black/60 leading-[1.8] whitespace-pre-wrap border-b border-black/10">
            {email.fullBody || email.snippet}
          </div>

          {/* Extracted Directives */}
          {email.suggestedActions.length > 0 && (
            <div className="px-12 py-6 border-b border-black/10">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40 mb-4">
                Extracted Directives
              </h3>
              <div className="flex flex-col gap-2">
                {email.suggestedActions.map(action => (
                  <div
                    key={action.id}
                    className={`flex items-center gap-4 px-4 py-3 border transition-opacity
                      ${action.status !== "PENDING" ? "border-transparent bg-black/[0.02] opacity-40" : "border-black/10"}`}
                  >
                    <span className="text-[9px] font-bold tracking-widest text-black/30 uppercase w-16 shrink-0">
                      {TYPE_LABELS[action.type] ?? action.type}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-black truncate">{action.title}</p>
                      {(action.date || action.time) && (
                        <p className="text-[10px] font-mono text-black/40 mt-0.5">
                          {action.time}{action.time && action.date ? " · " : ""}
                          {action.date ? `Day ${action.date}` : ""}
                        </p>
                      )}
                    </div>
                    {action.status === "PENDING" ? (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => actOnEmailAction(email.id, action.id)}
                          className="bg-black text-white px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest hover:bg-black/80 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => dismissEmailAction(email.id, action.id)}
                          className="border border-black/15 text-black/40 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest hover:bg-black/5 transition-colors"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-widest text-black/25 shrink-0">
                        {action.status}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="px-12 py-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-black/40 mb-4">
                Attachments
              </h3>
              <div className="flex flex-col gap-3">
                {email.attachments.map((att) => {
                  const assignment = email.attachmentAssignments[att.filename] ?? "none"
                  const sizeLabel = att.size && att.size > 0
                    ? `${att.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"} · ${Math.round(att.size / 1024)} KB`
                    : att.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"
                  return (
                    <div key={att.filename} className="flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-black truncate">{att.filename}</p>
                        <p className="text-[10px] text-black/40">{sizeLabel}</p>
                      </div>
                      <div className="flex gap-px shrink-0">
                        {(["none", "ellie", "annie", "both"] as const).map(opt => (
                          <button
                            key={opt}
                            onClick={() => setAttachmentAssignment(email.id, att.filename, opt)}
                            className={`px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider border transition-colors
                              ${assignment === opt
                                ? "bg-black text-white border-black"
                                : "bg-white text-black/40 border-black/15 hover:border-black/40"}`}
                          >
                            {opt === "none" ? "None" : opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </button>
                        ))}
                      </div>
                      {assignment !== "none" && (
                        <span className="text-[10px] text-[#4285f4] font-bold shrink-0">
                          → {assignment.charAt(0).toUpperCase() + assignment.slice(1)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/widgets/email-sheet.tsx
git commit -m "feat: add EmailSheet component with directives and attachment assignment"
```

---

## Task 7: Replace Bouncer widget

**Files:**
- Replace: `src/components/widgets/bouncer.tsx`

This is the largest UI task. Completely replace the accordion with the card list.

- [ ] **Step 1: Replace the entire file content**

```tsx
"use client"

import { useState } from "react"
import { useHub } from "@/lib/store"
import { useTerminal } from "@/lib/terminal-context"
import { EmailSheet } from "@/components/widgets/email-sheet"
import type { Email } from "@/lib/store"

function DuplicateWarning({ email }: { email: Email }) {
  const { events } = useHub()
  const hasDuplicate = email.suggestedActions.some(action => {
    if (action.type !== "CALENDAR_INVITE") return false
    return events.some(e =>
      e.title.toLowerCase() === action.title.toLowerCase() &&
      e.date === action.date
    )
  })
  if (!hasDuplicate) return null
  return (
    <span className="text-[8px] font-bold uppercase tracking-[0.06em] px-2 py-1 bg-[#fff8e1] text-[#b45309] border border-[#fcd34d]">
      ⚠ Duplicate Detected
    </span>
  )
}

function EmailCard({ email, onOpen }: { email: Email; onOpen: () => void }) {
  const { acceptAllEmailActions, dismissEmail, clearEmail } = useHub()
  const { seedTerminal } = useTerminal()

  const calCount = email.suggestedActions.filter(a => a.type === "CALENDAR_INVITE").length
  const directiveCount = email.suggestedActions.filter(a => a.type === "TODO_ITEM" || a.type === "GROCERY_ITEM").length
  const hasDirectives = calCount > 0 || directiveCount > 0
  const isProcessed = email.status === "PROCESSED"

  const handleSendToTerminal = () => {
    seedTerminal(`Re: "${email.subject}" — ${email.snippet} `)
    // Note: do NOT auto-dismiss here — user dismisses manually after acting
  }

  return (
    <div
      className={`border px-5 py-4 transition-all ${
        isProcessed
          ? "border-transparent opacity-35 cursor-default"
          : "border-black/8 bg-white hover:border-black/20 cursor-pointer shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
      }`}
      onClick={isProcessed ? undefined : onOpen}
    >
      <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-black/40 mb-1">
        {email.sender}
      </div>
      <div className="text-sm font-semibold tracking-tight text-black truncate mb-2">
        {email.subject}
      </div>

      {!isProcessed && (
        <>
          <p className="text-[11px] text-black/50 italic leading-relaxed mb-3 line-clamp-2">
            {email.snippet}
          </p>

          {/* Pills */}
          {(calCount > 0 || directiveCount > 0 || email.attachments.length > 0) && (
            <div className="flex gap-1.5 flex-wrap mb-3" onClick={e => e.stopPropagation()}>
              {calCount > 0 && (
                <span className="text-[8px] font-bold uppercase tracking-[0.06em] px-2 py-1 bg-black text-white">
                  {calCount} {calCount === 1 ? "Event" : "Events"}
                </span>
              )}
              {directiveCount > 0 && (
                <span className="text-[8px] font-bold uppercase tracking-[0.06em] px-2 py-1 bg-black text-white">
                  {directiveCount} {directiveCount === 1 ? "Directive" : "Directives"}
                </span>
              )}
              {email.attachments.length > 0 && (
                <span className="text-[8px] font-bold uppercase tracking-[0.06em] px-2 py-1 bg-black/8 text-black/60">
                  📎 {email.attachments.length}
                </span>
              )}
              <DuplicateWarning email={email} />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
            {hasDirectives ? (
              <>
                <button
                  onClick={() => acceptAllEmailActions(email.id)}
                  className="flex-1 bg-black text-white py-2 text-[9px] font-bold uppercase tracking-[0.1em] hover:bg-black/80 transition-colors"
                >
                  Approve All
                </button>
                <button
                  onClick={() => dismissEmail(email.id)}
                  className="border border-black/15 text-black/50 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.1em] hover:bg-black/5 transition-colors"
                >
                  Dismiss
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSendToTerminal}
                  className="flex-1 border border-black text-black py-2 text-[9px] font-bold uppercase tracking-[0.08em] hover:bg-black/5 transition-colors"
                >
                  Send to Terminal →
                </button>
                <button
                  onClick={() => dismissEmail(email.id)}
                  className="border border-black/15 text-black/50 px-4 py-2 text-[9px] font-bold uppercase tracking-[0.1em] hover:bg-black/5 transition-colors"
                >
                  Dismiss
                </button>
              </>
            )}
          </div>
        </>
      )}

      {/* Processed state */}
      {isProcessed && (
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-black/8">
          <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-black/25">
            ✓ Processed
          </span>
          <button
            onClick={e => { e.stopPropagation(); clearEmail(email.id) }}
            className="text-[8px] font-bold uppercase tracking-[0.1em] text-black/25 underline hover:text-black/50 transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}

export function Bouncer({ className }: { className?: string }) {
  const { emails } = useHub()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Note: loading/error state is added in Task 9 — do not add it here

  const selectedEmail = emails.find(e => e.id === selectedId) ?? null
  const pending = emails.filter(e => e.status === "PENDING")
  const processed = emails.filter(e => e.status === "PROCESSED")

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-end justify-between mb-8">
        <h2 className="font-heading text-4xl font-light tracking-tighter text-black">Inbox</h2>
        <span className="text-black/40 text-[10px] uppercase tracking-widest pb-1">
          {pending.length > 0 ? `${pending.length} Pending` : "Inbox Zero Achieved"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
        {emails.length === 0 && (
          <p className="text-black/40 text-sm italic font-serif">Inbox zero achieved.</p>
        )}
        {pending.map(email => (
          <EmailCard key={email.id} email={email} onOpen={() => setSelectedId(email.id)} />
        ))}
        {processed.map(email => (
          <EmailCard key={email.id} email={email} onOpen={() => {}} />
        ))}
      </div>

      <EmailSheet
        email={selectedEmail}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Fix the typo in the card (CALENDAR_INVOKE → CALENDAR_INVITE)**

The `eventCount` line in `EmailCard` has a typo (`CALENDAR_INVOKE`). Remove that unused line — only `calCount` and `directiveCount` are used.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Start dev server and verify on home page**

```bash
npm run dev
```

Open `http://localhost:3000`. Log in with a real or mock token. Verify:
- Email cards appear in the Inbox column
- Pills show correctly (events, directives, attachments)
- "Approve All" fires toast and marks email Processed
- "Dismiss" marks email Processed
- "Clear" removes the card
- Clicking a card opens the Sheet from the right
- Sheet shows AI summary in blue, full body, directives with Approve/Dismiss, attachment assignment
- "Send to Terminal →" seeds the Terminal input and scrolls to it

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/bouncer.tsx
git commit -m "feat: replace Bouncer accordion with card list and EmailSheet"
```

---

## Task 8: Remove the /inbox page and nav link

**Files:**
- Modify: `src/components/nav.tsx`
- Delete: `src/app/inbox/page.tsx`

- [ ] **Step 1: Remove Inbox from the nav links array**

In `src/components/nav.tsx`, remove this entry from the `links` array:

```ts
{ href: "/inbox", label: "Inbox" },
```

- [ ] **Step 2: Delete the inbox page**

```bash
rm "/Users/marymckee/Desktop/Antigrav Projects/the-hub-claude/src/app/inbox/page.tsx"
```

- [ ] **Step 3: Verify dev server still runs**

```bash
npm run dev
```

Navigate to `http://localhost:3000`. Confirm:
- No Inbox link in the nav
- Home page loads correctly
- Navigating to `/inbox` returns a 404 (expected)

- [ ] **Step 4: Commit**

```bash
git add src/components/nav.tsx
git rm src/app/inbox/page.tsx
git commit -m "chore: remove /inbox page and nav link — triage now lives on Hub home"
```

---

## Task 9: Loading and error states in Bouncer

**Files:**
- Modify: `src/lib/store.tsx`
- Modify: `src/components/widgets/bouncer.tsx`

The digest fetch currently has no loading/error feedback in the widget itself.

- [ ] **Step 1: Add `emailsLoading` and `emailsError` to the store**

In `store.tsx`, add to `HubState` interface:

```ts
emailsLoading: boolean
emailsError: string | null
retryEmails: () => void
```

Add state in `HubProvider`:

```ts
const [emailsLoading, setEmailsLoading] = useState(false)
const [emailsError, setEmailsError] = useState<string | null>(null)
```

Update `hydrateEmails` to set these states:

```ts
const hydrateEmails = async () => {
  setEmailsLoading(true)
  setEmailsError(null)
  try {
    const res = await fetch(`/api/inbox/digest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const data = await res.json()
    if (data.error) {
      const msg = data.error.message || "Access denied"
      setEmailsError(msg)
      toast("SYNC ERROR", { description: "Gmail API: " + msg })
    } else if (data.emails) {
      setEmails(data.emails.map((e: any) => ({
        ...e,
        status: e.status ?? "PENDING",
        attachmentAssignments: e.attachmentAssignments ?? {}
      })))
    }
  } catch {
    setEmailsError("Failed to pull live Inbox data.")
    toast("SYNC ERROR", { description: "Failed to pull live Inbox data." })
  } finally {
    setEmailsLoading(false)
  }
}
```

Expose `retryEmails: hydrateEmails` in the Provider value, and add `emailsLoading`, `emailsError` too.

- [ ] **Step 2: Consume loading and error states in Bouncer**

At the top of the `Bouncer` component, update the destructure (replacing the previous `emails`-only destructure):

```ts
const { emails, emailsLoading, emailsError, retryEmails } = useHub()
```

Replace the empty state block with:

```tsx
{emailsLoading && (
  <div className="flex flex-col gap-2">
    {[1,2,3].map(i => (
      <div key={i} className="border border-black/5 px-5 py-4 animate-pulse">
        <div className="h-2 bg-black/8 rounded w-1/3 mb-3" />
        <div className="h-3 bg-black/8 rounded w-2/3 mb-2" />
        <div className="h-2 bg-black/5 rounded w-full" />
      </div>
    ))}
  </div>
)}

{emailsError && !emailsLoading && (
  <div className="border border-black/10 px-5 py-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-black/40 mb-3">
      SYNC ERROR — Gmail API
    </p>
    <p className="text-xs text-black/60 font-serif italic mb-4">{emailsError}</p>
    <button
      onClick={retryEmails}
      className="text-[9px] font-bold uppercase tracking-widest border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
    >
      Retry
    </button>
  </div>
)}

{!emailsLoading && !emailsError && emails.length === 0 && (
  <p className="text-black/40 text-sm italic font-serif">Inbox zero achieved.</p>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Verify in dev server**

With mock token: loading state won't show (mock bypasses fetch). With live token: loading skeleton should appear briefly before cards load.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx src/components/widgets/bouncer.tsx
git commit -m "feat: add loading skeleton and inline error state to Bouncer"
```

---

## Known Limitations (document, don't fix)

These are acknowledged in the spec and should not be addressed in this implementation:

- Processed/dismissed email state resets on page refresh (local state only)
- Duplicate detection uses day-of-month only — false positives across months possible
- Scanned PDFs won't extract text — fallback message passed to AI
- Firebase persistence for attachment assignments is out of scope
