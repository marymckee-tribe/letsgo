# Inbox Redesign — Design

**Date:** 2026-04-17
**Status:** Draft for review
**Scope:** `/inbox` page, home page Bouncer widget, supporting API routes, data model, auth infrastructure.

## Context

The current email section (`/inbox` page + `Bouncer` widget) is hard to read, read-only, and only half-real. AI extraction identifies only two action types (`CALENDAR_INVITE`, `TODO_ITEM`), and clicking "Act" updates local React state without writing to Google Calendar or Google Tasks. Attachments are listed by filename only. There is no reply capability. OAuth tokens expire every hour with no refresh flow, forcing manual re-login. Only one of the user's three Gmail accounts is integrated.

This redesign replaces the inbox experience end-to-end: new UI, richer AI extraction, real Google writes with an edit-then-commit flow, PDF extraction with Life Graph cross-reference, reply capability, multi-account support, and a compact home widget mirroring the main design.

## Goals

1. **Legibility.** A scannable, visually calm triage surface.
2. **AI-first reading.** Summary is the default; the full email is one click away.
3. **Editable, committing actions.** Detected calendar events and to-dos are editable forms that write to Google Calendar / Google Tasks on confirm.
4. **Attachment intelligence.** PDFs are summarized, key dates/fields extracted, and matched against Life Graph profiles where relevant.
5. **Reply capability.** AI-drafted replies editable inline and sent via Gmail.
6. **Sender identity.** Every email tied to a Life Graph person or org where a match exists (Ellie, Annie, Doug, Ness, Blessed Sacrament, Audaucy, etc.).
7. **Multi-account.** All three Gmail accounts pulled and unified in one triage queue.
8. **Home widget.** A compact mirror of the new design on the home page.

## Non-Goals

- In-Hub PDF editing or auto-signing.
- `.docx` / `.xlsx` extraction.
- Bulk triage tools (select-many, mass archive).
- Unsubscribe management.
- Full Gmail replacement — we do not attempt to replace features like labels, filters, snooze, or search beyond a simple filter bar.

## User Interface

### `/inbox` page — three-pane triage

Layout preserves the current three-column shape. Column responsibilities are rebuilt:

**Left — Queue (320px, scrolling)**
- Header: title "Triage", count of unread items, account indicator ("3 accts"), search/filter input.
- Each item: sender identity chip (colored dot + `ORG · PERSON`), subject, one-line AI summary, action-type badges (`CAL`, `TODO`, `REPLY`, `PDF`), selection state.
- Sort order: chronological within a lightweight grouping (selected item at top when active).

**Middle — Reader (flex, scrolling)**
- Header: sender identity line, subject, sender name + address, timestamp (12-hour clock), **Clear** button in the top-right corner.
- AI summary block — shown by default, visually boxed, ~2–4 sentences.
- Full email body — behind a "▸ Read full email" toggle, expands inline.
- Attachment cards — see "PDF extraction" below.

**Right — Action deck (300px, scrolling)**
- Header: "Suggested actions".
- One card per detected action (see "Action types"). Each card is an editable form with inline inputs for title, date, time, location, due date, context tag, etc. — whatever fields the action type needs.
- Each card has a primary button ("Add to Google Calendar", "Add to Google Tasks", "Send reply") and a secondary "Skip".
- Low-confidence actions are marked with a `?` glyph in the header.

### Home page — Bouncer widget

Compact vertical list:
- Header: "Inbox", count, "3 accts" label.
- Top 3 items as cards: colored dot + sender identity + subject + action-type badges. Selected/featured item uses a dark left border; other items use a muted border.
- Footer: "4 more · Open Triage →" linking to `/inbox` with a query param to deep-link to the expanded item.

### Visual language

- 12-hour clock everywhere (`h:mm a` — e.g., `3:00 PM`). Apply to email timestamps, calendar events, to-do due times, schedule strip. This is a project-wide preference, not limited to the inbox.
- Preserve the existing brutalist type system: heavy tracking on uppercase labels, generous negative space, monospace for metadata.
- Adjust contrast on small labels (current `text-foreground/40` grays are too faint to read reliably). Standardize on `text-foreground/60` or `text-muted-foreground` for supporting metadata.

### Lifecycle & disappearance

- **Action cards (within an open email)**: after commit, collapse to a one-line stub (`✓ Added to Google Calendar · open in Google ↗`). Never deleted — kept as history inside the email record.
- **Emails in the triage queue**: never auto-clear. They leave the queue only when the user clicks the **Clear** button in the reader pane header. The button is available regardless of action state — read it, act on it (or not), then clear it when done.
- Any actions still `PROPOSED` at clear-time are marked `DISMISSED_BY_CLEAR` so the email's history shows "cleared without acting" vs. "explicitly skipped." Committed actions are unaffected.
- A **Recently cleared** section sits at the bottom of the left queue pane as a collapsed row (`▸ Recently cleared (N)`). Click to expand → the N most recently cleared emails render in a lighter-weight style (smaller row, dimmed). Each has a one-click **Restore** button that marks the email unread in Gmail and returns it to the top of the active queue. The section auto-collapses after a restore. `N` defaults to 10, configurable in Settings later.
- **Gmail sync**: when an email is cleared from the Hub's triage, it is marked as read in Gmail via `gmail.modify`. Gmail labels/archive state are otherwise untouched. Because subsequent syncs pull only `is:unread`, the email won't reappear on refresh.

## Data Model

### Classifications vs. actions

Separate two concepts that the old model conflated:

**Email-level classification** (always exactly one per email, drives row treatment):

| Classification | Row treatment |
| --- | --- |
| `CALENDAR_EVENT` | Normal, with action card in deck |
| `TODO` | Normal, with action card in deck |
| `NEEDS_REPLY` | Normal, with reply card in deck |
| `WAITING_ON` | Row-level badge: `⏳ Waiting on Doug since Tue`. No card in deck. |
| `FYI` | Normal row, no cards |
| `NEWSLETTER` | Row auto-dimmed, no cards, excluded from queue counts |

**Actions** (zero or more per email, commit-able):

| Action type | Fields | Commits to |
| --- | --- | --- |
| `CALENDAR_EVENT` | title, date, time (start/end, 12-hour), location, person, context | Google Calendar |
| `TODO` | title, due (date), person, context | Google Tasks |
| `NEEDS_REPLY` | suggestedDraft, person | Gmail (send) |

An email classified as `CALENDAR_EVENT` typically has one `CALENDAR_EVENT` action, but may also have a `TODO` action if the email implies prep (e.g., "book show Thursday — don't forget to RSVP"). `WAITING_ON`, `FYI`, and `NEWSLETTER` classifications never produce action cards.

Each action carries `id`, `status` (`PROPOSED` / `EDITING` / `WRITING` / `COMMITTED` / `DISMISSED` / `FAILED`), `sourceQuote` (the sentence in the email the action was extracted from), `confidence` (`low` | `medium` | `high`), and — when committed — a `googleId` pointing back to the created Google Calendar event, Google Tasks task, or sent Gmail message.

### Email record

```ts
type Email = {
  id: string            // Gmail messageId
  accountId: string     // which of the user's accounts
  subject: string
  sender: { name: string, email: string }
  senderIdentity?: {    // Life Graph match
    personId?: string   // e.g. "ellie"
    orgName?: string    // e.g. "Blessed Sacrament"
    confidence: "low" | "medium" | "high"
  }
  snippet: string       // AI summary (not raw Gmail snippet)
  fullBody: string
  attachments: Attachment[]
  suggestedActions: EmailAction[]
  date: number
  hubStatus: "UNREAD" | "READ" | "CLEARED"
  classification: "CALENDAR_EVENT" | "TODO" | "NEEDS_REPLY" | "WAITING_ON" | "FYI" | "NEWSLETTER"
}
```

`classification` drives row-level display only (badges, dimming, count inclusion). The commit-able set lives in `suggestedActions[]` and is restricted to `CALENDAR_EVENT`, `TODO`, `NEEDS_REPLY`.

### Attachment record

```ts
type Attachment = {
  id: string            // Gmail attachmentId
  filename: string
  mimeType: string
  size: number
  extracted?: {         // populated lazily on first open
    summary: string
    dates: { label: string, date: string }[]
    required_fields: string[]
    deadlines: string[]
    money: { label: string, amount: number, currency: string }[]
    persons_mentioned: string[]
    life_graph_hits: Record<string, string>  // field → Life Graph value
  }
}
```

### Account registry

New collection in Firestore, keyed under the user's uid:

```ts
type Account = {
  id: string            // stable internal id
  email: string         // the Gmail address
  displayName: string
  addedAt: number
  refreshToken: string  // encrypted at rest
  scopes: string[]
  lastSynced?: number
}
```

### Life Graph additions

Extend `EntityProfile` with two optional fields:

```ts
knownDomains?: string[]   // e.g. ["blessedsacrament.org"]
knownSenders?: string[]   // e.g. ["Ms. Redd <office@blessedsacrament.org>"]
```

These accumulate over time via explicit user confirmation on first match (see "Sender identity" below).

## Auth & Multi-Account

Move OAuth from client-side Firebase `signInWithPopup` to a server-side flow that stores refresh tokens per account.

### Flow

1. User clicks "Add account" in Settings → Accounts section.
2. App redirects to Google's OAuth consent page with offline access + the required scopes.
3. Google redirects to `/api/auth/google/callback` with an authorization code.
4. Server exchanges the code for an access token + refresh token.
5. Server fetches the authenticated email address, encrypts the refresh token, and writes a new `Account` record in Firestore.
6. User returns to the app with the new account listed in Settings → Accounts.

### Scopes

Current:
- `calendar.events`
- `tasks`
- `gmail.readonly`
- `drive.file`

Added:
- `gmail.send` — for reply capability.
- `gmail.modify` — for marking emails as read from the Hub.

The first sign-in after this change triggers a Google re-consent screen. If the user declines the new scopes, reply and "clear to Gmail" gracefully degrade (buttons disabled, explanation tooltip).

### Token handling

- Refresh tokens stored in Firestore, encrypted with a server-side key (Next.js env var; document rotation procedure).
- Access tokens minted on demand server-side using the refresh token. Never sent to the client.
- All Gmail / Calendar / Tasks API calls move to server routes — the client calls `/api/inbox`, `/api/calendar`, `/api/tasks` etc. with its Firebase session cookie; the server resolves the account and uses the right refresh token.
- Eliminates the current 1-hour expiration problem entirely.

### Per-account fetching

`/api/inbox/digest` iterates over the user's registered accounts, fetches unread messages from each in parallel, merges, and tags each email with its `accountId`. Queue sorting and grouping are account-agnostic; the UI does not segment by account, but each row carries an account indicator (small dot or initial) for the user's reference.

## AI Extraction Pipeline

### Email-level classification and action extraction

Single LLM call per batch of emails. Model: `gpt-4o-mini` (current choice; acceptable cost at the volumes we see). Structured output via `generateObject` with a Zod schema matching the data model above.

Prompt includes:
- The raw email body (truncated to 4000 chars as today).
- The user's Life Graph profiles and known domains as reference data.
- A classification instruction: pick one of the 6 types for the email, extract zero or more `suggestedActions`, and match the sender to a Life Graph person/org if possible.
- Constraints: quote the source sentence for every action; emit a confidence score; never invent dates.

### Sender identity matching

A two-step resolver running before the classification prompt:

1. **Direct match** — check sender domain and sender name against the user's `knownDomains` and `knownSenders` across all Life Graph profiles.
2. **Inferred match** — if no direct hit, the LLM is given the email content and asked to match against the Life Graph profiles. Example: "Annie's permission slip…" → Annie.

When an unknown domain produces an inferred match, the UI surfaces a small inline prompt on first display: *"This looks like it might be from Audaucy (Annie's school). Remember this for next time?"* Accepting appends the domain to Annie's `knownDomains`.

### Confidence display

- `high` / `medium` — rendered normally.
- `low` — action card shows a `?` glyph in its header and a tooltip explaining why (e.g., "Date is ambiguous — two possible interpretations").

## Google Write Flow

State machine for a single action: **PROPOSED → EDITING → WRITING → COMMITTED** (or `DISMISSED` / `FAILED`).

### Writing

- Calendar: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events` with start/end datetimes in the user's browser timezone.
- Tasks: `POST https://tasks.googleapis.com/tasks/v1/lists/{listId}/tasks`. Use the user's default task list (first list returned by `tasklists.list`).
- Reply: `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with an RFC 2822 message body. Include the original `threadId` so the reply threads correctly.

### Idempotency

Each commit carries a client-generated idempotency key: `${emailId}:${actionId}`. The server tracks committed keys in Firestore. A retry of the same key after success returns the existing `googleId` instead of creating a duplicate.

### Double-click protection

Action card buttons disable on click and remain disabled until the commit resolves (success or error). UI state reflects `WRITING` during the round-trip.

### Error handling

- Write fails (5xx, network) — action returns to `EDITING`, toast: "Couldn't add to Google Calendar. Try again?" with a one-click retry.
- Write fails (4xx other than 401) — action moves to `FAILED`, user sees the error message inline on the card with a "Dismiss" and a "Retry" option.
- 401 — token refresh automatically (server-side); if refresh also fails, prompt the user to re-add the account.

### Duplicate detection

Before writing a `CALENDAR_EVENT`, query Google Calendar for events in the proposed window. If an event with a highly-similar title exists, display a pre-commit warning: *"Looks like you already have 'Ellie zoo trip' on Thu 8am. Add anyway?"*.

## PDF Extraction

### When

Lazy. Extraction runs when an email is first opened and has a PDF attachment. Results cached in Firestore, keyed by `(messageId, attachmentId)`. The cache key is never invalidated because attachment content is immutable.

### Pipeline

1. Fetch attachment data from Gmail API: `GET users/messages/{messageId}/attachments/{attachmentId}`.
2. Decode base64.
3. Extract text with `pdf-parse` (Node library). Cap at first 5 pages for fast path.
4. If `pdf-parse` returns empty text (scanned PDF), fall back to GPT-4o vision OCR as a slower path — still cached once complete.
5. Call `gpt-4o-mini` with the extracted text and the Life Graph as reference, producing the structured `extracted` shape above.
6. Write extraction result to Firestore.

### UX

- Attachment card in the reader pane shows: filename, type icon, AI summary, key dates, required fields, `life_graph_hits` (with pre-fill prompts where applicable).
- "Preview" button opens an inline PDF.js viewer in a slide-over.
- "Download" triggers a direct download.
- "Save to Drive" (optional) uses the existing `drive.file` scope.
- Non-PDF attachments show filename and download only; no extraction.
- Password-protected PDFs show a lock icon; extraction is skipped.

### Pre-fill

When `life_graph_hits` contains matches (e.g., "Medical notes" → "peanut allergy"), the attachment card surfaces them as clickable chips. Clicking currently just copies the value to clipboard; auto-populating the PDF itself is out of scope for v1 (would require a PDF editor).

## Home Widget (Bouncer)

A compact mirror of the new `/inbox` design:

- Title "Inbox", count + accounts indicator.
- Top 3 rows (tuneable later): colored sender-identity dot, `ORG · PERSON`, subject, action-type badges.
- The active/featured row uses a dark left border; others use a muted border.
- Footer: "N more · Open Triage →", linking to `/inbox?thread={id}` to deep-link to a specific email.

Uses the same `Email` records from the shared store. No independent fetching or data model.

## Testing

- **Unit / component** — editable action card state transitions, sender identity resolver, 12-hour clock rendering.
- **Integration (mocked Google APIs)** — full commit flows for CALENDAR_EVENT, TODO, NEEDS_REPLY including idempotency and retry behavior; duplicate detection; gracious degradation when `gmail.send` is not granted.
- **Integration (real accounts, manual)** — one per commit type, plus multi-account fetch and merge, plus PDF extraction end-to-end on at least two real PDFs (a permission slip and a receipt).
- **Fixtures** — sample emails representing all 6 classifications, including edge cases (ambiguous dates, scanned PDFs, low-confidence actions, unknown-domain sender).

## Open Questions

None blocking implementation. Items below are worth revisiting during build:

- **Action deck density on narrow viewports** — 300px may feel cramped when multiple cards are expanded. Defer to implementation; fall back to stacked cards with collapse-on-scroll if needed.
- **Life Graph learning loop UX** — the one-time "remember this domain?" prompt needs a "don't ask again" escape hatch. Detail in implementation plan.
- **Timezone edge cases** — meeting invites that cross DST boundaries. Add tests; do not design around it upfront.

## Phasing Note for Implementation Planning

This spec is deliberately one coherent design, but it's large. The writing-plans phase should split implementation into ordered phases — server-side OAuth + multi-account plumbing first (it's a prerequisite for everything else and unblocks the 401 problem), then data model + extraction, then UI, then PDF extraction, then home widget. Each phase ships independently.
