# Email Intake Redesign — Design Spec
**Date:** 2026-03-24
**Status:** Approved for implementation

---

## Overview

Upgrade the email intake experience in The Hub. The current `Bouncer` widget on the home page (an accordion) is replaced with a focused card list. Tapping a card opens a Sheet (side panel) for full detail, directive cherry-picking, and attachment assignment. The separate `/inbox` page is removed entirely — triage lives on the Hub home page.

---

## Goals

- Surface actionable email intelligence on the home page without navigating away
- Allow bulk approval or selective cherry-picking of extracted directives
- Support attachment assignment to family members (Ellie, Annie, Both, None)
- Read relevant PDFs when the email defers key details to an attachment
- Match the vocabulary, component patterns, and aesthetic of the existing app

---

## Architecture

### What Changes

| File | Change |
|------|--------|
| `src/lib/store.tsx` | Add fields to `Email` type; add 4 new store actions |
| `src/components/widgets/bouncer.tsx` | Full replacement — accordion → card list |
| `src/components/widgets/email-sheet.tsx` | New component — Sheet detail panel |
| `src/app/api/inbox/digest/route.ts` | Add `GROCERY_ITEM` type; add PDF extraction |
| `src/components/nav.tsx` | Remove `Inbox` nav link |
| `src/app/inbox/page.tsx` | Delete |

---

## Data Model

### `Email` type — additions to `store.tsx`

```ts
export type Email = {
  // existing fields unchanged...
  status: "PENDING" | "PROCESSED"           // new — whole-email triage state
  attachmentAssignments: Record<string,      // new — local only, keyed by filename
    "none" | "ellie" | "annie" | "both">
}
```

### `EmailAction` type — no changes needed

Existing `status: "PENDING" | "APPROVED" | "DISMISSED"` covers directive state.

### `EmailSchema` in digest route — additions

```ts
type: z.enum(["CALENDAR_INVITE", "TODO_ITEM", "GROCERY_ITEM"])  // add GROCERY_ITEM
```

### New store actions

```ts
acceptAllEmailActions(emailId: string)
// Marks all PENDING actions on the email as APPROVED
// Fires addEvent / addTask / addGrocery for each
// Sets email status to PROCESSED

dismissEmail(emailId: string)
// Sets email status to PROCESSED without approving any actions

clearEmail(emailId: string)
// Removes the email from the list entirely

setAttachmentAssignment(
  emailId: string,
  filename: string,
  assignment: "none" | "ellie" | "annie" | "both"
)
// Updates attachmentAssignments for one file — local state only
```

---

## Bouncer Widget (`bouncer.tsx`)

Replaces the accordion with a vertical card list. Shows all emails with `status === "PENDING"` at the top, `status === "PROCESSED"` dimmed at the bottom.

### Card anatomy

**Actionable emails** (have at least one PENDING directive):
- Sender (small caps, muted)
- Subject (truncated)
- AI summary (one-line italic)
- Pills (only shown when count > 0):
  - `N Events` — black pill, counts `CALENDAR_INVITE` actions
  - `N Directives` — black pill, counts `TODO_ITEM` + `GROCERY_ITEM` actions combined
  - `📎 N` — light pill for attachments
  - `⚠ Duplicate Detected` — amber pill, shown when any extracted event title + date matches an existing calendar event
- Actions: **Approve All** (primary, full-width) + **Dismiss** (secondary)

**Info-only emails** (no extracted directives):
- Sender, subject, summary — same as above
- No pills
- Actions: **Send to Terminal →** (outlined) + **Dismiss** (secondary)

**Processed emails:**
- Full card dimmed to 35% opacity
- No pills, no action buttons
- Shows `✓ Processed` label + `Clear` text button

### Duplicate detection

On render, compare each extracted directive of type `CALENDAR_INVITE` against `events` in the store. A duplicate is detected when both `title` (case-insensitive) and `date` (day-of-month) match an existing event.

**Known limitation:** Date comparison uses day-of-month only (1–31). Events on the same day number in different months will produce false positives. Acceptable for now.

### Loading state

While the inbox digest is fetching, show 3 skeleton cards (pulsing grey bars) in place of the card list.

### Error state

If the digest API returns an error, show an inline message inside the Bouncer column:

> `SYNC ERROR — Gmail API: [message]`
> with a **Retry** button that re-calls `hydrateEmails()`

Toast remains as secondary notification, but the widget must be self-describing on failure.

### Empty state

When all emails are cleared: existing copy — *"Inbox zero achieved."*

---

## Email Sheet (`email-sheet.tsx`)

Opens from the right when a card is tapped. Uses the existing `Sheet` component from shadcn/ui — same component already used for Events and Tasks in `DashboardCards`. Width: `w-[500px] sm:w-[600px]` (wider than event/task sheets to accommodate directive list and attachment assignment).

### Structure

**Header**
- Subject (large, light weight)
- Sender name · email address · timestamp (monospace, muted)
- `✕ Close` button (top right)

**AI Summary**
- Blue left-border callout (`bg-[#e8f0fe]`, `border-[#4285f4]`)
- One-paragraph summary generated by the digest
- Italic, muted blue text

**Full Email Body**
- Scrollable
- Rendered as plain text, preserving line breaks
- Italic, muted — same serif treatment as existing app

**Extracted Directives section** (omitted if no directives)
- Section label: `EXTRACTED DIRECTIVES`
- Each directive shown as a row:
  - Type label: `CALENDAR_INVITE` → `EVENT`, `TODO_ITEM` → `DIRECTIVE`, `GROCERY_ITEM` → `PROVISION`
  - Title + date/time if applicable
  - **Approve** (black) + **Dismiss** (outlined) buttons when `status === "PENDING"`
  - `APPROVED` or `DISMISSED` status badge (muted) when already actioned, row dimmed
- Approving a directive fires `actOnEmailAction` (existing store action)

**Attachments section** (omitted if no attachments)
- Section label: `ATTACHMENTS`
- Each attachment row:
  - Filename + MIME type + file size (read from `payload.body.size` in the Gmail message payload; omitted if zero or unavailable)
  - Assignment buttons: `None` `Ellie` `Annie` `Both` — active state is black filled
  - Assignment saves immediately on tap via `setAttachmentAssignment`
  - Confirmation label `→ Ellie` (blue) appears next to assigned button

**Footer**
- No action buttons — all approve/dismiss actions happen from the card or within the Sheet directive list per the reference pattern

---

## "Send to Terminal" Flow

When the user taps **Send to Terminal →** on an info-only email card:

1. A `TerminalContext` is added to the app (wrapping `BrainDump` and `Bouncer` at the layout level) that exposes a `seedTerminal(content: string)` function. A ref-based approach is not used — `BrainDump` and `Bouncer` are siblings, not parent/child, so context is the correct mechanism.
2. The function scrolls to the Terminal section and focuses the input
3. The input is pre-populated with:
   `Re: "[subject]" — [AI summary]. `
   (trailing space so the user can type immediately)
4. The email is **not** auto-dismissed — the user dismisses it manually after acting

---

## API Route — Digest (`inbox/digest/route.ts`)

### Add `GROCERY_ITEM` action type

```ts
type: z.enum(["CALENDAR_INVITE", "TODO_ITEM", "GROCERY_ITEM"])
```

Update AI prompt to instruct extraction of grocery/shopping items.

### PDF extraction

**When to extract:** After fetching email bodies, check each email's content for deferral language:
- "see attached", "see the attached", "refer to the attached"
- "details in the PDF", "details in the attachment"
- "enclosed PDF", "enclosed document"
- "attached form", "attached schedule", "attached document"

**How to extract:**
1. For emails where deferral language is detected AND PDF attachments exist, fetch attachment bytes via Gmail API:
   `GET /gmail/v1/users/me/messages/{id}/attachments/{attachmentId}`
2. Decode base64url content
3. Use `pdf-parse` to extract text layer
4. Append to email content before AI prompt:
   `\n\n[ATTACHED PDF: {filename}]\n{extracted text}`

**Failure handling:**
- If `pdf-parse` throws (scanned PDF, corrupt file, etc.), append a note instead:
   `\n\n[ATTACHED PDF: {filename} — text extraction failed, likely a scanned document]`
- Never block the digest on PDF failure — catch and continue

**Latency note:** PDF fetching adds one additional Gmail API round-trip per relevant attachment. Acceptable within the existing 60s `maxDuration`.

**Install required:** `npm install pdf-parse`
**Types required:** `npm install --save-dev @types/pdf-parse`

---

## Navigation

- Remove `{ href: "/inbox", label: "Inbox" }` from `nav.tsx`
- Delete `src/app/inbox/page.tsx`

---

## Known Limitations

| Limitation | Impact | Resolution |
|-----------|--------|------------|
| Processed/dismissed state is local only | Resets on page refresh | Acceptable for now; revisit with Firebase persistence later |
| Duplicate detection uses day-of-month only | False positives across months | Low impact; acceptable for now |
| Scanned PDFs won't extract | Key details missed for image-only PDFs | Graceful fallback message in AI context |
| Attachment file sizes not in Gmail API response | Size omitted from UI | Fetch `Content-Length` from attachment metadata if available, otherwise omit |

---

## Out of Scope

- Confidence scores on AI extraction
- Persisting attachment assignments to Firebase
- Multi-account inbox aggregation (3 accounts shown in header but only primary processed)
- Marking emails as read in Gmail after triage
