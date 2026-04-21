# Inbox Redesign — Phase 3: Three-Pane UI Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current `/inbox` page with the three-pane triage surface defined in the design spec — Queue (320px) / Reader (flex) / Action deck (300px) — using the Phase 2 data model (`classification`, `senderIdentity`, `hubStatus`, `sourceQuote`, `confidence`, `EmailActionStatus`). Wire a `Clear` button through a new `inbox.markCleared` tRPC mutation stub (Firestore-cached `hubStatus: 'CLEARED'` — Gmail sync is Phase 4). Land editable action-card forms that display correctly but commit via no-op in Phase 3 (Phase 4 wires the real Google writes). Delete the Phase 2 `action-compat` shim.

**Architecture:** A new page at `src/app/inbox/page.tsx` (replacing the current file) composes three columns built from three new subcomponents — `QueueList`, `EmailReader`, `ActionDeck` — each a focused file. The page uses tRPC hooks directly (`trpc.inbox.digest.useQuery()` for the queue; `trpc.inbox.markCleared.useMutation()` for clearing) and React Aria Components for the three-column landmark / keyboard-nav skeleton. A Cmd+K quick-jump palette uses `cmdk`. Row treatment per classification is a pure mapping function (`rowTreatmentFor(classification)`) lifted out of the component tree so it is independently testable. The store exposes a `clearEmail(id)` optimistic mutation and a `restoreEmail(id)` counterpart, both backed by `inbox.markCleared` + `inbox.markUnread` mutations that update Firestore only — Gmail `gmail.modify` remains a Phase 4 task.

**Tech Stack:** Next.js 16 (App Router), React 19, tRPC v11, `@tanstack/react-query` v5 (optimistic updates), `react-aria-components`, `cmdk`, `date-fns` (`format` with `h:mm a`), Tailwind 4, `lucide-react`, `framer-motion` (already installed — only used for deck slide-in), `sonner` (toasts), Jest + React Testing Library + `jest-environment-jsdom`.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "User Interface" → "/inbox page — three-pane triage" and "Lifecycle & disappearance" sections.

**Base branch:** Branch `feature/inbox-phase-3-ui` off `main` after Phase 2 merges. This plan assumes Phase 1 (multi-account auth), Phase 2 (classification schema, `hubStatus`, action-compat shim), and the tRPC migration are all on `main`. Run `git log --oneline -5` before starting and confirm the top three commits reference Phase 2 (AI extraction) and the tRPC migration.

---

## Before You Start — Read These

Next.js 16 and React 19 both have breaking changes vs. training data. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — App Router conventions
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes
- `https://react-spectrum.adobe.com/react-aria/components.html` — React Aria Components API (use Context7 / WebFetch when starting Task 3)
- `https://cmdk.paco.me/` — `cmdk` API shape
- `https://tanstack.com/query/v5/docs/react/guides/optimistic-updates` — TanStack Query v5 optimistic-update pattern for our Clear / Restore flows
- `https://date-fns.org/v3.0.0/docs/format` — the `h:mm a` token string

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not assume patterns from memory.

If anything in this plan conflicts with what React Aria or `cmdk` docs actually require, follow the docs and update the plan.

---

## File Structure

### New files
- `src/app/inbox/page.tsx` — **full rewrite**, replaces the existing file. Three-pane layout orchestrating the subcomponents below.
- `src/components/inbox/queue-list.tsx` — left column, 320px. Renders queue rows + Recently cleared section.
- `src/components/inbox/queue-row.tsx` — one row in the queue (sender chip, subject, summary, action badges).
- `src/components/inbox/sender-identity-chip.tsx` — colored dot + `ORG · PERSON` label. Pure presentation; takes `senderIdentity` + fallback `sender`.
- `src/components/inbox/action-badge.tsx` — single pill badge (`CAL` / `TODO` / `REPLY` / `PDF`).
- `src/components/inbox/email-reader.tsx` — middle column. Header + AI summary + full-email expander + attachment stubs + Clear button.
- `src/components/inbox/action-deck.tsx` — right column. Maps `suggestedActions` → `ActionCard` instances.
- `src/components/inbox/action-card.tsx` — single editable action card (CALENDAR_EVENT / TODO / NEEDS_REPLY), low-confidence glyph, primary no-op button, Skip button.
- `src/components/inbox/recently-cleared.tsx` — collapsed accordion at bottom of queue, Restore per-row.
- `src/components/inbox/command-palette.tsx` — Cmd+K quick-jump, powered by `cmdk`.
- `src/components/inbox/row-treatment.ts` — pure function mapping `EmailClassification` → row style config.
- `src/components/inbox/format-time.ts` — pure function wrapping `date-fns` `format(date, 'h:mm a')` + `format(date, 'MMM d, h:mm a')` helpers.
- `src/server/trpc/routers/inbox.ts` — **modify**: add `markCleared` + `markUnread` mutations (stubs that only touch Firestore; Gmail is Phase 4).
- `src/lib/server/inbox-status.ts` — Firestore CRUD: `setHubStatus(uid, messageId, 'CLEARED' | 'UNREAD')` and `getHubStatusMap(uid)`.
- `tests/server/inbox-status.test.ts`
- `tests/server/trpc/routers/inbox-mutations.test.ts` — `markCleared` / `markUnread` procedure tests.
- `tests/components/inbox/queue-row.test.tsx`
- `tests/components/inbox/sender-identity-chip.test.tsx`
- `tests/components/inbox/action-badge.test.tsx`
- `tests/components/inbox/row-treatment.test.ts`
- `tests/components/inbox/format-time.test.ts`
- `tests/components/inbox/email-reader.test.tsx`
- `tests/components/inbox/action-card.test.tsx`
- `tests/components/inbox/action-deck.test.tsx`
- `tests/components/inbox/recently-cleared.test.tsx`
- `tests/components/inbox/command-palette.test.tsx`
- `tests/components/inbox/inbox-page.test.tsx` — integration: render the page with mocked tRPC hooks, assert three-pane semantics.
- `tests/lib/store-clear-email.test.tsx` — optimistic update + rollback for `clearEmail`.

### Modified files
- `src/lib/store.tsx` — add `clearEmail(id)` / `restoreEmail(id)` mutation wrappers using `trpc.inbox.markCleared` + `trpc.inbox.markUnread` with optimistic cache update + rollback. Remove `actOnEmailAction` and `dismissEmailAction` (superseded by the deck's own local state + Phase 4 mutations). Expose a `recentlyClearedLimit` derived value (default 10).
- `src/server/trpc/routers/inbox.ts` — add `markCleared` + `markUnread` procedures.
- `src/server/trpc/routers/inbox.ts` — modify `digest` query to merge in `hubStatus` from Firestore (so a cleared email stays cleared across refetches).
- `package.json` — add `cmdk`, `react-aria-components`, `date-fns`.
- `jest.config.mjs` — add `projects` config so component tests run under `jsdom` while server tests stay on `node`. (The current config is node-only; component tests need DOM.)
- `tests/setup.ts` — add `@testing-library/jest-dom` import so `toBeInTheDocument` etc. are available.

### Deleted files
- `src/lib/action-compat.ts` — the Phase 2 shim. Phase 3 UI consumes `EmailActionStatus` directly.
- `tests/lib/action-compat.test.ts` — superseded (the shim is gone).

### Explicitly NOT touched
- `src/app/page.tsx` — home widget redesign is Phase 7.
- `src/server/trpc/routers/inbox.ts` digest pipeline (prompt, classification merge) — owned by Phase 2.
- Gmail `gmail.modify` call — deferred to Phase 4 (see OUT OF SCOPE).
- Google Calendar / Tasks / Gmail send — deferred to Phase 4 / Phase 6.
- `src/components/inbox/learn-domain-banner.tsx` — Phase 2 artifact. Keep as-is; it continues to show inside the new reader pane.

---

## Prerequisites (one-time)

- [ ] **P1. Confirm the base.** Run `git log --oneline -5`. The top commits must include Phase 2's "chore: quiet tsc/eslint across Phase 2 surface" (or equivalent wrap-up commit) and the tRPC migration merge. If not, rebase.
- [ ] **P2. Confirm the suite is green.** Run `npx tsc --noEmit && npx jest && npm run lint`. All three must pass before starting.
- [ ] **P3. Create the working branch.** Run `git checkout -b feature/inbox-phase-3-ui`.

---

## Out of Scope (explicit)

The following are NOT part of Phase 3 — do not add tasks for them, and if tempted, stop and re-read this list:

- Real Google Calendar / Google Tasks commits (Phase 4). The action-card primary buttons render with the correct label but clicking them is a toast-only no-op in Phase 3.
- Marking emails as read in Gmail via `gmail.modify` on Clear (Phase 4). Phase 3's Clear only updates `hubStatus` in Firestore.
- Duplicate detection before calendar writes (Phase 4).
- PDF extraction, preview, Life Graph hits (Phase 5). Attachment cards in Phase 3 render only filename + type icon + download-disabled stub.
- Reply sending via `gmail.send` (Phase 6). The NEEDS_REPLY card renders an editable textarea but "Send reply" is a no-op toast in Phase 3.
- Home widget redesign (Phase 7). `src/app/page.tsx` is untouched.

---

## Tasks

### Task 0: Install deps + component-test harness

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `jest.config.mjs`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Install runtime deps**

Run:

```bash
npm install cmdk react-aria-components date-fns
```

Expected: `cmdk`, `react-aria-components`, and `date-fns` added to `dependencies` in `package.json`.

- [ ] **Step 2: Split Jest into node + jsdom projects**

Component tests need a DOM. Rewrite `jest.config.mjs` completely:

```javascript
// jest.config.mjs
/** @type {import('jest').Config} */
const config = {
  projects: [
    {
      displayName: 'node',
      preset: 'ts-jest',
      testEnvironment: 'node',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      setupFilesAfterEach: ['<rootDir>/tests/setup.ts'],
      testMatch: [
        '<rootDir>/tests/api/**/*.test.ts',
        '<rootDir>/tests/server/**/*.test.ts',
        '<rootDir>/tests/lib/**/*.test.ts',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
      },
    },
    {
      displayName: 'jsdom',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      setupFilesAfterEach: ['<rootDir>/tests/setup.ts'],
      testMatch: [
        '<rootDir>/tests/components/**/*.test.tsx',
        '<rootDir>/tests/lib/store-clear-email.test.tsx',
      ],
      transform: {
        '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
      },
    },
  ],
}
export default config
```

Note: the `setupFilesAfterEach` key is the property name already in use in this repo; keep the same spelling so existing node tests remain wired.

- [ ] **Step 3: Add jest-dom matchers to the setup file**

Rewrite `tests/setup.ts`:

```ts
// tests/setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Sanity check**

Run:

```bash
npx jest --listTests | head -5
npx jest
```

Expected: jest boots both projects and existing tests still pass (Phase 1 + Phase 2 suite).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json jest.config.mjs tests/setup.ts
git commit -m "chore(deps): add cmdk + react-aria-components + date-fns; split jest into node+jsdom projects"
```

---

### Task 1: `row-treatment.ts` pure helper + test

A pure mapping from `EmailClassification` → display config. Lifted out of the component tree so the spec's table is a one-screen unit test.

**Files:**
- Create: `src/components/inbox/row-treatment.ts`
- Create: `tests/components/inbox/row-treatment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/row-treatment.test.ts`:

```ts
import { rowTreatmentFor, shouldIncludeInUnreadCount } from '@/components/inbox/row-treatment'

describe('rowTreatmentFor', () => {
  it('CALENDAR_EVENT: normal row, no waiting badge, not dimmed', () => {
    expect(rowTreatmentFor('CALENDAR_EVENT')).toEqual({
      dimmed: false,
      showWaitingBadge: false,
    })
  })

  it('TODO: normal row', () => {
    expect(rowTreatmentFor('TODO')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('NEEDS_REPLY: normal row', () => {
    expect(rowTreatmentFor('NEEDS_REPLY')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('WAITING_ON: normal row with waiting badge', () => {
    expect(rowTreatmentFor('WAITING_ON')).toEqual({ dimmed: false, showWaitingBadge: true })
  })

  it('FYI: normal row, no badge', () => {
    expect(rowTreatmentFor('FYI')).toEqual({ dimmed: false, showWaitingBadge: false })
  })

  it('NEWSLETTER: dimmed row, no badge', () => {
    expect(rowTreatmentFor('NEWSLETTER')).toEqual({ dimmed: true, showWaitingBadge: false })
  })
})

describe('shouldIncludeInUnreadCount', () => {
  it('excludes NEWSLETTER', () => {
    expect(shouldIncludeInUnreadCount('NEWSLETTER')).toBe(false)
  })

  it('includes all other classifications', () => {
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI'] as const) {
      expect(shouldIncludeInUnreadCount(c)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/row-treatment.test.ts`
Expected: FAIL — `Cannot find module '@/components/inbox/row-treatment'`.

- [ ] **Step 3: Implement**

Create `src/components/inbox/row-treatment.ts`:

```ts
import type { EmailClassification } from '@/lib/store'

export interface RowTreatment {
  dimmed: boolean
  showWaitingBadge: boolean
}

export function rowTreatmentFor(c: EmailClassification): RowTreatment {
  switch (c) {
    case 'NEWSLETTER':
      return { dimmed: true, showWaitingBadge: false }
    case 'WAITING_ON':
      return { dimmed: false, showWaitingBadge: true }
    case 'CALENDAR_EVENT':
    case 'TODO':
    case 'NEEDS_REPLY':
    case 'FYI':
      return { dimmed: false, showWaitingBadge: false }
  }
}

export function shouldIncludeInUnreadCount(c: EmailClassification): boolean {
  return c !== 'NEWSLETTER'
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/row-treatment.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/row-treatment.ts tests/components/inbox/row-treatment.test.ts
git commit -m "feat(inbox): pure rowTreatmentFor mapping per classification"
```

---

### Task 2: `format-time.ts` 12-hour clock helper + test

Single source of truth for the spec's 12-hour clock requirement. Every UI time display goes through this helper — no `toLocaleString()` sprinkled in components.

**Files:**
- Create: `src/components/inbox/format-time.ts`
- Create: `tests/components/inbox/format-time.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/format-time.test.ts`:

```ts
import { formatClock, formatStamp } from '@/components/inbox/format-time'

describe('formatClock', () => {
  it('renders morning times as h:mm AM', () => {
    const d = new Date('2026-04-21T08:05:00')
    expect(formatClock(d)).toBe('8:05 AM')
  })

  it('renders afternoon times as h:mm PM', () => {
    const d = new Date('2026-04-21T15:00:00')
    expect(formatClock(d)).toBe('3:00 PM')
  })

  it('accepts epoch ms', () => {
    const d = new Date('2026-04-21T09:30:00')
    expect(formatClock(d.getTime())).toBe('9:30 AM')
  })

  it('renders midnight as 12:00 AM', () => {
    const d = new Date('2026-04-21T00:00:00')
    expect(formatClock(d)).toBe('12:00 AM')
  })

  it('renders noon as 12:00 PM', () => {
    const d = new Date('2026-04-21T12:00:00')
    expect(formatClock(d)).toBe('12:00 PM')
  })
})

describe('formatStamp', () => {
  it('renders Apr 21, 3:00 PM', () => {
    const d = new Date('2026-04-21T15:00:00')
    expect(formatStamp(d)).toBe('Apr 21, 3:00 PM')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/format-time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/format-time.ts`:

```ts
import { format } from 'date-fns'

export function formatClock(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return format(d, 'h:mm a')
}

export function formatStamp(input: Date | number): string {
  const d = typeof input === 'number' ? new Date(input) : input
  return format(d, 'MMM d, h:mm a')
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/format-time.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/format-time.ts tests/components/inbox/format-time.test.ts
git commit -m "feat(inbox): 12-hour clock formatters (h:mm a)"
```

---

### Task 3: `SenderIdentityChip` component + test

Colored dot + `ORG · PERSON` label. Takes `senderIdentity`, `sender`, and `profiles` (for name lookup). Falls back to the raw sender string when no identity is resolved.

**Files:**
- Create: `src/components/inbox/sender-identity-chip.tsx`
- Create: `tests/components/inbox/sender-identity-chip.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/sender-identity-chip.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { SenderIdentityChip } from '@/components/inbox/sender-identity-chip'
import type { EntityProfile, SenderIdentity } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

describe('SenderIdentityChip', () => {
  it('renders ORG · PERSON when both are present', () => {
    const si: SenderIdentity = { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' }
    render(<SenderIdentityChip senderIdentity={si} sender="office@blessedsacrament.org" profiles={profiles} />)
    expect(screen.getByText(/Blessed Sacrament/)).toBeInTheDocument()
    expect(screen.getByText(/Ellie/)).toBeInTheDocument()
  })

  it('renders just the person when there is no org', () => {
    const si: SenderIdentity = { personId: 'ellie', confidence: 'high' }
    render(<SenderIdentityChip senderIdentity={si} sender="ellie@school.com" profiles={profiles} />)
    expect(screen.getByText('Ellie')).toBeInTheDocument()
  })

  it('falls back to the raw sender when no identity is resolved', () => {
    render(<SenderIdentityChip senderIdentity={undefined} sender="random@example.com" profiles={profiles} />)
    expect(screen.getByText('random@example.com')).toBeInTheDocument()
  })

  it('renders a colored dot', () => {
    const si: SenderIdentity = { personId: 'ellie', confidence: 'high' }
    const { container } = render(<SenderIdentityChip senderIdentity={si} sender="x" profiles={profiles} />)
    expect(container.querySelector('[data-testid="sender-dot"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/sender-identity-chip.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/sender-identity-chip.tsx`:

```tsx
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/sender-identity-chip.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/sender-identity-chip.tsx tests/components/inbox/sender-identity-chip.test.tsx
git commit -m "feat(inbox): SenderIdentityChip (dot + ORG · PERSON)"
```

---

### Task 4: `ActionBadge` component + test

One pill: `CAL` / `TODO` / `REPLY` / `PDF`. Derived from an `EmailAction` type plus a boolean flag for `hasAttachments` (the PDF badge is attachment-driven, not action-driven).

**Files:**
- Create: `src/components/inbox/action-badge.tsx`
- Create: `tests/components/inbox/action-badge.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/action-badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { ActionBadge, actionBadgesFor } from '@/components/inbox/action-badge'
import type { Email } from '@/lib/store'

describe('ActionBadge', () => {
  it('renders CAL for CALENDAR_EVENT', () => {
    render(<ActionBadge kind="CAL" />)
    expect(screen.getByText('CAL')).toBeInTheDocument()
  })

  it('renders TODO', () => {
    render(<ActionBadge kind="TODO" />)
    expect(screen.getByText('TODO')).toBeInTheDocument()
  })

  it('renders REPLY', () => {
    render(<ActionBadge kind="REPLY" />)
    expect(screen.getByText('REPLY')).toBeInTheDocument()
  })

  it('renders PDF', () => {
    render(<ActionBadge kind="PDF" />)
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })
})

describe('actionBadgesFor', () => {
  const baseEmail: Email = {
    id: 'm1',
    subject: 'x',
    sender: 'x',
    snippet: 'x',
    fullBody: 'x',
    classification: 'CALENDAR_EVENT',
    attachments: [],
    suggestedActions: [
      { id: 'a1', type: 'CALENDAR_EVENT', title: 'x', sourceQuote: 'x', confidence: 'high', status: 'PROPOSED' },
    ],
    date: 0,
    hubStatus: 'UNREAD',
  }

  it('emits CAL for CALENDAR_EVENT action', () => {
    expect(actionBadgesFor(baseEmail)).toEqual(['CAL'])
  })

  it('emits TODO for TODO action', () => {
    const e = { ...baseEmail, suggestedActions: [{ ...baseEmail.suggestedActions[0], type: 'TODO' as const }] }
    expect(actionBadgesFor(e)).toEqual(['TODO'])
  })

  it('emits REPLY for NEEDS_REPLY action', () => {
    const e = { ...baseEmail, suggestedActions: [{ ...baseEmail.suggestedActions[0], type: 'NEEDS_REPLY' as const }] }
    expect(actionBadgesFor(e)).toEqual(['REPLY'])
  })

  it('emits PDF when any attachment is present, regardless of mime', () => {
    const e = { ...baseEmail, suggestedActions: [], attachments: [{ id: 'att1', filename: 'x.pdf', mimeType: 'application/pdf', size: 1 }] }
    expect(actionBadgesFor(e)).toEqual(['PDF'])
  })

  it('combines action + attachment badges in CAL/TODO/REPLY/PDF order', () => {
    const e = {
      ...baseEmail,
      attachments: [{ id: 'att1', filename: 'x.pdf', mimeType: 'application/pdf', size: 1 }],
      suggestedActions: [
        { id: 'a1', type: 'CALENDAR_EVENT' as const, title: 'x', sourceQuote: 'x', confidence: 'high' as const, status: 'PROPOSED' as const },
        { id: 'a2', type: 'TODO' as const, title: 'y', sourceQuote: 'y', confidence: 'high' as const, status: 'PROPOSED' as const },
      ],
    }
    expect(actionBadgesFor(e)).toEqual(['CAL', 'TODO', 'PDF'])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/action-badge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/action-badge.tsx`:

```tsx
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/action-badge.test.tsx`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/action-badge.tsx tests/components/inbox/action-badge.test.tsx
git commit -m "feat(inbox): ActionBadge + actionBadgesFor (CAL/TODO/REPLY/PDF)"
```

---

### Task 5: `QueueRow` component + test

One row. Composes `SenderIdentityChip` + subject + AI summary + `ActionBadge`s. Applies `rowTreatmentFor` output. Highlights when selected.

**Files:**
- Create: `src/components/inbox/queue-row.tsx`
- Create: `tests/components/inbox/queue-row.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/queue-row.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { QueueRow } from '@/components/inbox/queue-row'
import type { Email, EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

const baseEmail: Email = {
  id: 'm1',
  accountEmail: 'mary@tribe.ai',
  subject: 'Zoo Trip Thursday',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
  classification: 'CALENDAR_EVENT',
  snippet: 'Zoo trip Thursday 8am. Please send peanut-free lunches.',
  fullBody: '',
  attachments: [],
  suggestedActions: [
    { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo trip', sourceQuote: 'Zoo trip Thursday 8am.', confidence: 'high', status: 'PROPOSED' },
  ],
  date: Date.now(),
  hubStatus: 'UNREAD',
}

describe('QueueRow', () => {
  it('renders subject, summary, sender identity, and action badge', () => {
    render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(screen.getByText('Zoo Trip Thursday')).toBeInTheDocument()
    expect(screen.getByText(/Zoo trip Thursday 8am/)).toBeInTheDocument()
    expect(screen.getByText(/Blessed Sacrament/)).toBeInTheDocument()
    expect(screen.getByText('CAL')).toBeInTheDocument()
  })

  it('shows ⏳ waiting badge when classification is WAITING_ON', () => {
    const e = { ...baseEmail, classification: 'WAITING_ON' as const }
    render(<QueueRow email={e} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(screen.getByText(/Waiting on/)).toBeInTheDocument()
  })

  it('dims the row when classification is NEWSLETTER', () => {
    const e = { ...baseEmail, classification: 'NEWSLETTER' as const }
    const { container } = render(<QueueRow email={e} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(container.firstChild).toHaveClass('opacity-60')
  })

  it('applies selected styling when selected', () => {
    const { container } = render(<QueueRow email={baseEmail} profiles={profiles} selected={true} onSelect={() => {}} />)
    expect(container.firstChild).toHaveClass('bg-foreground')
  })

  it('fires onSelect when clicked', () => {
    const onSelect = jest.fn()
    render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith('m1')
  })

  it('uses text-muted-foreground for small labels, never text-foreground/40', () => {
    const { container } = render(<QueueRow email={baseEmail} profiles={profiles} selected={false} onSelect={() => {}} />)
    expect(container.innerHTML).not.toMatch(/text-foreground\/40/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/queue-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/queue-row.tsx`:

```tsx
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/queue-row.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/queue-row.tsx tests/components/inbox/queue-row.test.tsx
git commit -m "feat(inbox): QueueRow with classification-driven treatments"
```

---

### Task 6: Server — `inbox-status.ts` Firestore CRUD + test

The Clear / Restore mutations persist `hubStatus` outside the Gmail sync. Firestore-only in Phase 3; Phase 4 wires Gmail.

**Files:**
- Create: `src/lib/server/inbox-status.ts`
- Create: `tests/server/inbox-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/inbox-status.test.ts`:

```ts
import { setHubStatus, getHubStatusMap } from '@/lib/server/inbox-status'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

const makeFakeDb = () => {
  const docs = new Map<string, Record<string, unknown>>()
  const mkDoc = (id: string) => ({
    id,
    get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
    set: async (d: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(id, opts?.merge ? { ...(docs.get(id) ?? {}), ...d } : d)
    },
  })
  const col = {
    get: async () => ({ docs: Array.from(docs.entries()).map(([id, d]) => ({ id, data: () => d })) }),
    doc: (id: string) => mkDoc(id),
  }
  return {
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    docs,
  }
}

describe('inbox-status', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('setHubStatus writes CLEARED for a messageId', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    const map = await getHubStatusMap('uid-1')
    expect(map['m1']).toEqual(expect.objectContaining({ hubStatus: 'CLEARED' }))
  })

  it('setHubStatus overwrites to UNREAD', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    await setHubStatus('uid-1', 'm1', 'UNREAD')
    const map = await getHubStatusMap('uid-1')
    expect(map['m1']).toEqual(expect.objectContaining({ hubStatus: 'UNREAD' }))
  })

  it('getHubStatusMap returns an empty object when nothing stored', async () => {
    const map = await getHubStatusMap('uid-1')
    expect(map).toEqual({})
  })

  it('setHubStatus stamps a clearedAt timestamp when status is CLEARED', async () => {
    await setHubStatus('uid-1', 'm1', 'CLEARED')
    const map = await getHubStatusMap('uid-1')
    expect(typeof map['m1'].clearedAt).toBe('number')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/inbox-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/inbox-status.ts`:

```ts
import { getAdminDb } from '@/lib/server/firebase-admin'
import type { EmailHubStatus } from '@/lib/store'

export interface HubStatusEntry {
  hubStatus: EmailHubStatus
  clearedAt?: number
}

function collectionRef(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('emailStatus')
}

export async function setHubStatus(uid: string, messageId: string, status: EmailHubStatus): Promise<void> {
  const entry: HubStatusEntry = { hubStatus: status }
  if (status === 'CLEARED') entry.clearedAt = Date.now()
  await collectionRef(uid).doc(messageId).set(entry, { merge: true })
}

export async function getHubStatusMap(uid: string): Promise<Record<string, HubStatusEntry>> {
  const snap = await collectionRef(uid).get()
  const out: Record<string, HubStatusEntry> = {}
  for (const doc of snap.docs) {
    out[doc.id] = doc.data() as HubStatusEntry
  }
  return out
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/server/inbox-status.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/inbox-status.ts tests/server/inbox-status.test.ts
git commit -m "feat(inbox): inbox-status Firestore CRUD (setHubStatus + getHubStatusMap)"
```

---

### Task 7: tRPC `inbox.markCleared` + `inbox.markUnread` mutations + test

Extend the existing inbox router with two mutations. Phase 4 will layer Gmail's `gmail.modify` on top — Phase 3 only updates Firestore.

**Files:**
- Modify: `src/server/trpc/routers/inbox.ts`
- Create: `tests/server/trpc/routers/inbox-mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/trpc/routers/inbox-mutations.test.ts`:

```ts
import { inboxRouter } from '@/server/trpc/routers/inbox'
import { setHubStatus } from '@/lib/server/inbox-status'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/inbox-status')

describe('inbox mutations', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('markCleared writes CLEARED to Firestore', async () => {
    ;(setHubStatus as jest.Mock).mockResolvedValue(undefined)
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const res = await caller.markCleared({ id: 'm1' })
    expect(setHubStatus).toHaveBeenCalledWith('mary-uid', 'm1', 'CLEARED')
    expect(res).toEqual({ ok: true })
  })

  it('markCleared rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller({})
    await expect(caller.markCleared({ id: 'm1' })).rejects.toBeInstanceOf(TRPCError)
  })

  it('markCleared rejects blank id', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.markCleared({ id: '' })).rejects.toBeInstanceOf(TRPCError)
  })

  it('markUnread writes UNREAD to Firestore', async () => {
    ;(setHubStatus as jest.Mock).mockResolvedValue(undefined)
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await caller.markUnread({ id: 'm1' })
    expect(setHubStatus).toHaveBeenCalledWith('mary-uid', 'm1', 'UNREAD')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/inbox-mutations.test.ts`
Expected: FAIL — `caller.markCleared is not a function`.

- [ ] **Step 3: Extend the router**

Open `src/server/trpc/routers/inbox.ts` and add the two mutations. The exact placement: after the existing `digest` procedure, still inside the `router({ ... })` call. Add these imports at the top of the file:

```ts
import { setHubStatus, getHubStatusMap } from '@/lib/server/inbox-status'
```

Add these procedures inside `router({ ... })`:

```ts
  markCleared: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await setHubStatus(ctx.uid, input.id, 'CLEARED')
      return { ok: true }
    }),

  markUnread: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await setHubStatus(ctx.uid, input.id, 'UNREAD')
      return { ok: true }
    }),
```

Then, inside the existing `digest` procedure, after it computes the digested emails (where Phase 2 builds the final array with `hubStatus: 'UNREAD' as const`), merge the Firestore status map so cleared emails stay cleared across refetches. Find the block that stamps `hubStatus: 'UNREAD' as const` and replace it with:

```ts
  const statusMap = await getHubStatusMap(ctx.uid)
  // ...in the .map over digested emails:
  //   const override = statusMap[email.id]?.hubStatus
  //   hubStatus: override ?? 'UNREAD',
```

Adapt the exact merge site to the Phase 2 code; the invariant is: `hubStatus = statusMap[email.id]?.hubStatus ?? 'UNREAD'`. Do not drop cleared emails from the result — the client-side queue filter handles that (Task 12 composes the visible queue from `emails.filter(e => e.hubStatus !== 'CLEARED')`).

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/server/trpc/routers/inbox-mutations.test.ts`
Expected: PASS (4 tests).

Run: `npx jest tests/server/trpc/routers/inbox.test.ts` (the existing digest test) to confirm no regression.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/inbox.ts tests/server/trpc/routers/inbox-mutations.test.ts
git commit -m "feat(trpc): inbox.markCleared + inbox.markUnread (Firestore only — Gmail is Phase 4)"
```

---

### Task 8: Store — optimistic `clearEmail` / `restoreEmail` + test

Wrap the two new mutations in store helpers with TanStack Query's `onMutate` / `onError` pattern for optimistic updates with rollback.

**Files:**
- Modify: `src/lib/store.tsx`
- Create: `tests/lib/store-clear-email.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/store-clear-email.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc/client'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'

// We assert the optimistic-update behavior of useClearEmail against a fake fetch.
// This test does NOT exercise the server; it exercises that the query cache is
// updated synchronously on mutate and reverted on error.

describe('useClearEmail', () => {
  let queryClient: QueryClient
  let trpcClient: ReturnType<typeof trpc.createClient>

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    global.fetch = jest.fn().mockImplementation(async (url: string, init: RequestInit) => {
      // `inbox.digest` query → initial fetch
      if (url.includes('inbox.digest')) {
        return new Response(JSON.stringify([{ result: { data: { json: { emails: [{
          id: 'm1', subject: 's', sender: 'x', snippet: 's', fullBody: '', classification: 'CALENDAR_EVENT',
          attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD',
        }] } } } }]), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (url.includes('inbox.markCleared')) {
        // Simulate a server error to drive the rollback path.
        return new Response(JSON.stringify([{ error: { json: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } } }]), { status: 500, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response('{}', { status: 200 })
    }) as typeof fetch

    trpcClient = trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    })
  })

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    )
  }

  it('flips hubStatus to CLEARED optimistically and rolls back on error', async () => {
    // Import inside the test so the mocked fetch is in place.
    const { useClearEmail, useInboxEmails } = await import('@/lib/store')

    const { result: listResult } = renderHook(() => useInboxEmails(), { wrapper: Wrapper })
    await waitFor(() => expect(listResult.current.data?.emails.length).toBe(1))
    expect(listResult.current.data?.emails[0].hubStatus).toBe('UNREAD')

    const { result: mutResult } = renderHook(() => useClearEmail(), { wrapper: Wrapper })
    await act(async () => {
      mutResult.current.mutate({ id: 'm1' })
    })

    // Optimistic: should briefly be CLEARED.
    // Then: server errors, rollback → back to UNREAD.
    await waitFor(() => expect(listResult.current.data?.emails[0].hubStatus).toBe('UNREAD'))
    expect(mutResult.current.isError).toBe(true)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/lib/store-clear-email.test.tsx`
Expected: FAIL — `useClearEmail` / `useInboxEmails` are not exported yet.

- [ ] **Step 3: Implement the new store helpers**

Open `src/lib/store.tsx`. At the top, add:

```ts
import { trpc } from "@/lib/trpc/client"
```

Replace the existing `actOnEmailAction` / `dismissEmailAction` definitions (they are deleted in Phase 3 — the new action deck owns its own state) with new exported hooks. Add these at module scope below the existing `HubProvider` export:

```tsx
export function useInboxEmails() {
  return trpc.inbox.digest.useQuery(undefined, { staleTime: 60_000 })
}

export function useClearEmail() {
  const utils = trpc.useUtils()
  return trpc.inbox.markCleared.useMutation({
    async onMutate({ id }) {
      await utils.inbox.digest.cancel()
      const previous = utils.inbox.digest.getData()
      utils.inbox.digest.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          emails: old.emails.map((e) => (e.id === id ? { ...e, hubStatus: 'CLEARED' as const } : e)),
        }
      })
      return { previous }
    },
    onError(_err, _input, ctx) {
      if (ctx?.previous) utils.inbox.digest.setData(undefined, ctx.previous)
      toast('SYNC ERROR', { description: 'Could not clear email. Restored.' })
    },
    onSettled() {
      utils.inbox.digest.invalidate()
    },
  })
}

export function useRestoreEmail() {
  const utils = trpc.useUtils()
  return trpc.inbox.markUnread.useMutation({
    async onMutate({ id }) {
      await utils.inbox.digest.cancel()
      const previous = utils.inbox.digest.getData()
      utils.inbox.digest.setData(undefined, (old) => {
        if (!old) return old
        return {
          ...old,
          emails: old.emails.map((e) => (e.id === id ? { ...e, hubStatus: 'UNREAD' as const } : e)),
        }
      })
      return { previous }
    },
    onError(_err, _input, ctx) {
      if (ctx?.previous) utils.inbox.digest.setData(undefined, ctx.previous)
      toast('SYNC ERROR', { description: 'Could not restore email.' })
    },
    onSettled() {
      utils.inbox.digest.invalidate()
    },
  })
}
```

Also remove `actOnEmailAction` and `dismissEmailAction` from `HubState` and the `HubProvider` value object, and delete their function definitions. These are owned by the action deck's local state in Phase 3.

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/lib/store-clear-email.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: errors in any remaining consumers of `actOnEmailAction` / `dismissEmailAction` — those will be eliminated in Task 12 when the old `/inbox/page.tsx` is replaced. Record the list of remaining errors for reference.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx tests/lib/store-clear-email.test.tsx
git commit -m "feat(store): useClearEmail / useRestoreEmail with optimistic update + rollback"
```

---

### Task 9: `ActionCard` component + test

Single editable form card. Renders one of three field sets (CALENDAR_EVENT / TODO / NEEDS_REPLY). Shows `?` glyph + tooltip for low-confidence. Primary button label switches per type. Clicking primary is a no-op toast in Phase 3. Skip dismisses the card from local state.

**Files:**
- Create: `src/components/inbox/action-card.tsx`
- Create: `tests/components/inbox/action-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/action-card.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionCard } from '@/components/inbox/action-card'
import type { EmailAction } from '@/lib/store'

const calAction: EmailAction = {
  id: 'a1',
  type: 'CALENDAR_EVENT',
  title: 'Zoo trip',
  date: new Date('2026-04-23T08:00:00').getTime(),
  time: '8:00 AM',
  context: 'FAMILY',
  sourceQuote: 'Zoo trip Thursday 8am.',
  confidence: 'high',
  status: 'PROPOSED',
}

const todoAction: EmailAction = {
  id: 'a2',
  type: 'TODO',
  title: 'Send RSVP',
  sourceQuote: 'please RSVP by Friday.',
  confidence: 'high',
  status: 'PROPOSED',
}

const replyAction: EmailAction = {
  id: 'a3',
  type: 'NEEDS_REPLY',
  title: 'Re: Zoo trip',
  sourceQuote: 'Let us know if she can come.',
  confidence: 'high',
  status: 'PROPOSED',
}

describe('ActionCard', () => {
  it('CALENDAR_EVENT: renders title, date, time, location, context fields and "Add to Google Calendar" button', () => {
    render(<ActionCard action={calAction} onSkip={() => {}} />)
    expect(screen.getByLabelText(/title/i)).toHaveValue('Zoo trip')
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/time/i)).toHaveValue('8:00 AM')
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/context/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /skip/i })).toBeInTheDocument()
  })

  it('TODO: renders "Add to Google Tasks" button and due-date field', () => {
    render(<ActionCard action={todoAction} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /add to google tasks/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument()
  })

  it('NEEDS_REPLY: renders "Send reply" button and textarea', () => {
    render(<ActionCard action={replyAction} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /send reply/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('clicking the primary button is a no-op in Phase 3 (fires onNoop callback, not a commit)', () => {
    const onNoop = jest.fn()
    render(<ActionCard action={calAction} onSkip={() => {}} onNoop={onNoop} />)
    fireEvent.click(screen.getByRole('button', { name: /add to google calendar/i }))
    expect(onNoop).toHaveBeenCalled()
  })

  it('Skip fires onSkip with the action id', () => {
    const onSkip = jest.fn()
    render(<ActionCard action={calAction} onSkip={onSkip} />)
    fireEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(onSkip).toHaveBeenCalledWith('a1')
  })

  it('shows a ? glyph in the header when confidence is low', () => {
    const low = { ...calAction, confidence: 'low' as const }
    render(<ActionCard action={low} onSkip={() => {}} />)
    expect(screen.getByRole('button', { name: /low confidence/i })).toBeInTheDocument()
  })

  it('does not show the ? glyph for medium or high confidence', () => {
    render(<ActionCard action={calAction} onSkip={() => {}} />)
    expect(screen.queryByRole('button', { name: /low confidence/i })).toBeNull()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/action-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/action-card.tsx`:

```tsx
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

      <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
        Title
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm text-foreground"
        />
      </label>

      {action.type === "CALENDAR_EVENT" && (
        <>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Time
            <input
              type="text"
              placeholder="3:00 PM"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm font-mono"
            />
          </label>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Location
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Context
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
        </>
      )}

      {action.type === "TODO" && (
        <>
          <label className="mb-3 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Due date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Context
            <input
              type="text"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm"
            />
          </label>
        </>
      )}

      {action.type === "NEEDS_REPLY" && (
        <label className="mb-4 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Draft
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            className="mt-1 w-full border border-border bg-white px-2 py-1 text-sm font-serif italic leading-relaxed"
          />
        </label>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <button
          type="button"
          onClick={handlePrimary}
          className="w-full bg-foreground py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-background hover:bg-foreground/80"
        >
          {primaryLabel(action.type)}
        </button>
        <button
          type="button"
          onClick={() => onSkip(action.id)}
          className="w-full border border-border py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/action-card.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/action-card.tsx tests/components/inbox/action-card.test.tsx
git commit -m "feat(inbox): ActionCard (editable form per action type; primary no-op in Phase 3)"
```

---

### Task 10: `EmailReader` component + test

Middle pane. Header (sender identity, subject, name + address, 12-hour timestamp), **Clear** button top-right, boxed AI summary (2–4 sentences), "▸ Read full email" expander, attachment stubs.

**Files:**
- Create: `src/components/inbox/email-reader.tsx`
- Create: `tests/components/inbox/email-reader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/email-reader.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { EmailReader } from '@/components/inbox/email-reader'
import type { Email, EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

const email: Email = {
  id: 'm1',
  subject: 'Zoo Trip Thursday',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
  classification: 'CALENDAR_EVENT',
  snippet: 'Ms. Redd writes about the Thursday zoo trip. Peanut-free lunches requested. Permission slip due Monday.',
  fullBody: 'Full body of the email with more context that the reader toggle will expose.',
  attachments: [{ id: 'att1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 42_000 }],
  suggestedActions: [],
  date: new Date('2026-04-21T15:00:00').getTime(),
  hubStatus: 'UNREAD',
}

describe('EmailReader', () => {
  it('renders subject, sender name + address, 12-hour timestamp, and Clear button', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.getByText('Zoo Trip Thursday')).toBeInTheDocument()
    expect(screen.getByText(/Ms. Redd/)).toBeInTheDocument()
    expect(screen.getByText(/office@blessedsacrament\.org/)).toBeInTheDocument()
    expect(screen.getByText(/3:00 PM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('renders the AI summary inside a boxed block', () => {
    const { container } = render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    const summary = screen.getByText(/Ms\. Redd writes about the Thursday zoo trip/)
    expect(summary).toBeInTheDocument()
    expect(container.querySelector('[data-testid="summary-box"]')).toBeInTheDocument()
  })

  it('hides full email until "Read full email" is clicked', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.queryByText(/Full body of the email/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /read full email/i }))
    expect(screen.getByText(/Full body of the email/)).toBeInTheDocument()
  })

  it('fires onClear when Clear is clicked', () => {
    const onClear = jest.fn()
    render(<EmailReader email={email} profiles={profiles} onClear={onClear} />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    expect(onClear).toHaveBeenCalledWith('m1')
  })

  it('renders attachment stubs with filename', () => {
    render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(screen.getByText('permission.pdf')).toBeInTheDocument()
  })

  it('uses text-muted-foreground for metadata, not text-foreground/40', () => {
    const { container } = render(<EmailReader email={email} profiles={profiles} onClear={() => {}} />)
    expect(container.innerHTML).not.toMatch(/text-foreground\/40/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/email-reader.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/inbox/email-reader.tsx`:

```tsx
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
                <div
                  key={a.id}
                  className="flex items-center gap-3 border border-border bg-white px-4 py-3 text-xs font-medium"
                >
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `npx jest tests/components/inbox/email-reader.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/email-reader.tsx tests/components/inbox/email-reader.test.tsx
git commit -m "feat(inbox): EmailReader (boxed AI summary, full-email expander, Clear top-right, attachment stubs)"
```

---

### Task 11: `ActionDeck` + `RecentlyCleared` + `CommandPalette` components

Three smaller components grouped into one task to keep commit cadence reasonable.

**Files:**
- Create: `src/components/inbox/action-deck.tsx`
- Create: `src/components/inbox/recently-cleared.tsx`
- Create: `src/components/inbox/command-palette.tsx`
- Create: `tests/components/inbox/action-deck.test.tsx`
- Create: `tests/components/inbox/recently-cleared.test.tsx`
- Create: `tests/components/inbox/command-palette.test.tsx`

- [ ] **Step 1: ActionDeck test**

Create `tests/components/inbox/action-deck.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ActionDeck } from '@/components/inbox/action-deck'
import type { EmailAction } from '@/lib/store'

const actions: EmailAction[] = [
  { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo', sourceQuote: 'Zoo Thursday.', confidence: 'high', status: 'PROPOSED' },
  { id: 'a2', type: 'TODO', title: 'RSVP', sourceQuote: 'RSVP by Fri.', confidence: 'medium', status: 'PROPOSED' },
]

describe('ActionDeck', () => {
  it('renders one card per action with the right primary labels', () => {
    render(<ActionDeck actions={actions} />)
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add to google tasks/i })).toBeInTheDocument()
  })

  it('shows an empty state when there are no actions', () => {
    render(<ActionDeck actions={[]} />)
    expect(screen.getByText(/no suggested actions/i)).toBeInTheDocument()
  })

  it('dismisses a card from local state when Skip is clicked', () => {
    render(<ActionDeck actions={actions} />)
    expect(screen.getByRole('button', { name: /add to google calendar/i })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /skip/i })[0])
    expect(screen.queryByRole('button', { name: /add to google calendar/i })).toBeNull()
  })
})
```

- [ ] **Step 2: ActionDeck implementation**

Create `src/components/inbox/action-deck.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import type { EmailAction } from "@/lib/store"
import { ActionCard } from "./action-card"

interface Props {
  actions: EmailAction[]
}

export function ActionDeck({ actions }: Props) {
  // Local dismissal set, reset when the incoming action list identity changes.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const signature = actions.map((a) => a.id).join(",")
  useEffect(() => {
    setDismissed(new Set())
  }, [signature])

  const visible = actions.filter((a) => !dismissed.has(a.id))

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white p-6 lg:p-8">
      <h3 className="mb-6 border-b border-border pb-4 text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Suggested actions
      </h3>

      {visible.length === 0 ? (
        <p className="border border-border/60 py-12 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          No suggested actions
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {visible.map((a) => (
            <ActionCard key={a.id} action={a} onSkip={(id) => setDismissed((s) => new Set(s).add(id))} />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: RecentlyCleared test**

Create `tests/components/inbox/recently-cleared.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { RecentlyCleared } from '@/components/inbox/recently-cleared'
import type { Email } from '@/lib/store'

const cleared: Email[] = Array.from({ length: 3 }).map((_, i) => ({
  id: `m${i}`,
  subject: `Cleared ${i}`,
  sender: 'x',
  classification: 'FYI',
  snippet: 's',
  fullBody: '',
  attachments: [],
  suggestedActions: [],
  date: 0,
  hubStatus: 'CLEARED',
}))

describe('RecentlyCleared', () => {
  it('is collapsed by default and shows the count', () => {
    render(<RecentlyCleared emails={cleared} onRestore={() => {}} />)
    expect(screen.getByText(/Recently cleared \(3\)/)).toBeInTheDocument()
    expect(screen.queryByText('Cleared 0')).toBeNull()
  })

  it('expands on click and lists cleared emails', () => {
    render(<RecentlyCleared emails={cleared} onRestore={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    expect(screen.getByText('Cleared 0')).toBeInTheDocument()
    expect(screen.getByText('Cleared 1')).toBeInTheDocument()
    expect(screen.getByText('Cleared 2')).toBeInTheDocument()
  })

  it('fires onRestore with the id and auto-collapses after restore', () => {
    const onRestore = jest.fn()
    render(<RecentlyCleared emails={cleared} onRestore={onRestore} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /restore/i })[0])
    expect(onRestore).toHaveBeenCalledWith('m0')
    expect(screen.queryByText('Cleared 0')).toBeNull()
  })

  it('respects the limit prop (defaults to 10)', () => {
    const many = Array.from({ length: 15 }).map((_, i) => ({ ...cleared[0], id: `m${i}`, subject: `Cleared ${i}` }))
    render(<RecentlyCleared emails={many} onRestore={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /Recently cleared/ }))
    // Only 10 rendered
    expect(screen.queryByText('Cleared 10')).toBeNull()
    expect(screen.getByText('Cleared 9')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: RecentlyCleared implementation**

Create `src/components/inbox/recently-cleared.tsx`:

```tsx
"use client"

import { useState } from "react"
import { ChevronRight, RotateCcw } from "lucide-react"
import type { Email } from "@/lib/store"

interface Props {
  emails: Email[]
  onRestore: (id: string) => void
  limit?: number
}

export function RecentlyCleared({ emails, onRestore, limit = 10 }: Props) {
  const [open, setOpen] = useState(false)
  const visible = emails.slice(0, limit)

  const handleRestore = (id: string) => {
    onRestore(id)
    setOpen(false)
  }

  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((x) => !x)}
        className="flex w-full items-center gap-2 p-4 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:bg-muted"
        aria-expanded={open}
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
        Recently cleared ({emails.length})
      </button>
      {open && (
        <ul>
          {visible.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 border-b border-border/40 bg-white/70 p-3 opacity-70">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground/80">{e.subject}</p>
                <p className="truncate text-[10px] text-muted-foreground">{e.sender}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(e.id)}
                aria-label={`Restore ${e.subject}`}
                className="flex items-center gap-1 border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: CommandPalette test**

Create `tests/components/inbox/command-palette.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { CommandPalette } from '@/components/inbox/command-palette'
import type { Email } from '@/lib/store'

const emails: Email[] = [
  { id: 'm1', subject: 'Zoo Trip Thursday', sender: 'Ms. Redd', classification: 'CALENDAR_EVENT', snippet: 's', fullBody: '', attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD' },
  { id: 'm2', subject: 'Gymnastics reminder', sender: 'coach@gym.com', classification: 'FYI', snippet: 's', fullBody: '', attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD' },
]

describe('CommandPalette', () => {
  it('opens when Cmd+K is pressed', () => {
    render(<CommandPalette emails={emails} onSelect={() => {}} />)
    expect(screen.queryByPlaceholderText(/Jump to/)).toBeNull()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByPlaceholderText(/Jump to/)).toBeInTheDocument()
  })

  it('also opens on Ctrl+K', () => {
    render(<CommandPalette emails={emails} onSelect={() => {}} />)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByPlaceholderText(/Jump to/)).toBeInTheDocument()
  })

  it('filters by subject substring and fires onSelect with the id', () => {
    const onSelect = jest.fn()
    render(<CommandPalette emails={emails} onSelect={onSelect} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const input = screen.getByPlaceholderText(/Jump to/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Zoo' } })
    fireEvent.click(screen.getByText(/Zoo Trip Thursday/))
    expect(onSelect).toHaveBeenCalledWith('m1')
  })
})
```

- [ ] **Step 6: CommandPalette implementation**

Create `src/components/inbox/command-palette.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Command } from "cmdk"
import type { Email } from "@/lib/store"

interface Props {
  emails: Email[]
  onSelect: (id: string) => void
}

export function CommandPalette({ emails, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((x) => !x)
      }
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label="Quick jump"
      className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 pt-32"
      onClick={() => setOpen(false)}
    >
      <div onClick={(e) => e.stopPropagation()} className="w-[480px] border border-border bg-white shadow-[8px_8px_0_rgba(0,0,0,0.08)]">
        <Command label="Quick jump" shouldFilter={true}>
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="Jump to sender or subject…"
            className="w-full border-b border-border bg-white px-4 py-3 text-sm outline-none"
          />
          <Command.List className="max-h-72 overflow-y-auto">
            <Command.Empty className="px-4 py-6 text-center text-xs text-muted-foreground">
              No matches.
            </Command.Empty>
            {emails.map((e) => (
              <Command.Item
                key={e.id}
                value={`${e.subject} ${e.sender}`}
                onSelect={() => {
                  onSelect(e.id)
                  setOpen(false)
                }}
                className="flex cursor-pointer items-center gap-3 border-b border-border/40 px-4 py-2 text-sm hover:bg-muted data-[selected=true]:bg-muted"
              >
                <span className="flex-1 truncate">{e.subject}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{e.sender}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Run all three test files**

Run:

```bash
npx jest tests/components/inbox/action-deck.test.tsx tests/components/inbox/recently-cleared.test.tsx tests/components/inbox/command-palette.test.tsx
```

Expected: PASS (3 + 4 + 3 = 10 tests).

- [ ] **Step 8: Commit**

```bash
git add src/components/inbox/action-deck.tsx src/components/inbox/recently-cleared.tsx src/components/inbox/command-palette.tsx tests/components/inbox/action-deck.test.tsx tests/components/inbox/recently-cleared.test.tsx tests/components/inbox/command-palette.test.tsx
git commit -m "feat(inbox): ActionDeck + RecentlyCleared + CommandPalette (Cmd+K)"
```

---

### Task 12: `QueueList` component + new `/inbox/page.tsx` + integration test

Assemble the three panes. The page owns the `selectedId` state and composes everything. `react-aria-components` provides landmarks (`<main>`, `<aside>`, nav labels).

**Files:**
- Create: `src/components/inbox/queue-list.tsx`
- Modify: `src/app/inbox/page.tsx` (full replacement)
- Create: `tests/components/inbox/inbox-page.test.tsx`

- [ ] **Step 1: QueueList component**

Create `src/components/inbox/queue-list.tsx`:

```tsx
"use client"

import type { Email, EntityProfile } from "@/lib/store"
import { QueueRow } from "./queue-row"
import { RecentlyCleared } from "./recently-cleared"
import { shouldIncludeInUnreadCount } from "./row-treatment"

interface Props {
  emails: Email[]
  profiles: EntityProfile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRestore: (id: string) => void
}

export function QueueList({ emails, profiles, selectedId, onSelect, onRestore }: Props) {
  const active = emails.filter((e) => e.hubStatus !== "CLEARED")
  const cleared = emails
    .filter((e) => e.hubStatus === "CLEARED")
    .sort((a, b) => b.date - a.date)

  const unreadCount = active.filter((e) => shouldIncludeInUnreadCount(e.classification)).length

  return (
    <aside
      aria-label="Triage queue"
      className="flex w-[320px] shrink-0 flex-col border-r border-border bg-white"
    >
      <header className="shrink-0 border-b border-border p-6">
        <h1 className="mb-2 font-heading text-3xl tracking-tight">Triage</h1>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {unreadCount} unread · 3 accts
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {active.length === 0 ? (
          <p className="p-8 font-serif italic text-muted-foreground">Inbox Zero achieved.</p>
        ) : (
          active.map((e) => (
            <QueueRow
              key={e.id}
              email={e}
              profiles={profiles}
              selected={selectedId === e.id}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      <RecentlyCleared emails={cleared} onRestore={onRestore} />
    </aside>
  )
}
```

- [ ] **Step 2: Replace the inbox page**

Overwrite `src/app/inbox/page.tsx` with:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Inbox as InboxIcon } from "lucide-react"
import { useHub, useInboxEmails, useClearEmail, useRestoreEmail } from "@/lib/store"
import { QueueList } from "@/components/inbox/queue-list"
import { EmailReader } from "@/components/inbox/email-reader"
import { ActionDeck } from "@/components/inbox/action-deck"
import { CommandPalette } from "@/components/inbox/command-palette"

export default function InboxPage() {
  const { profiles } = useHub()
  const { data } = useInboxEmails()
  const clearMut = useClearEmail()
  const restoreMut = useRestoreEmail()
  const emails = data?.emails ?? []

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedId && emails.length > 0) {
      const firstActive = emails.find((e) => e.hubStatus !== "CLEARED")
      if (firstActive) setSelectedId(firstActive.id)
    }
  }, [emails, selectedId])

  const activeEmail = emails.find((e) => e.id === selectedId && e.hubStatus !== "CLEARED")

  return (
    <main
      aria-label="Inbox triage"
      className="flex h-[calc(100vh-6rem)] w-full flex-col bg-[#f8f8f8] p-8 lg:p-12"
    >
      <div className="mx-auto flex h-full w-full max-w-[1600px] overflow-hidden border border-border bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
        <QueueList
          emails={emails}
          profiles={profiles}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRestore={(id) => restoreMut.mutate({ id })}
        />

        <section aria-label="Email reader" className="flex-1 min-w-0">
          {activeEmail ? (
            <EmailReader
              email={activeEmail}
              profiles={profiles}
              onClear={(id) => {
                clearMut.mutate({ id })
                setSelectedId(null)
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-white/50 text-muted-foreground">
              <InboxIcon className="h-12 w-12" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Select a thread</span>
            </div>
          )}
        </section>

        <aside aria-label="Suggested actions" className="w-[300px] shrink-0 border-l border-border bg-white">
          <ActionDeck actions={activeEmail?.suggestedActions ?? []} />
        </aside>
      </div>

      <CommandPalette emails={emails.filter((e) => e.hubStatus !== "CLEARED")} onSelect={setSelectedId} />
    </main>
  )
}
```

- [ ] **Step 3: Write the page integration test**

Create `tests/components/inbox/inbox-page.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import InboxPage from '@/app/inbox/page'

jest.mock('@/lib/store', () => {
  const clearMutate = jest.fn()
  const restoreMutate = jest.fn()
  const emails = [
    {
      id: 'm1', subject: 'Zoo trip', sender: 'Ms. Redd <office@blessedsacrament.org>',
      senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
      classification: 'CALENDAR_EVENT', snippet: 'Zoo trip Thursday 8am. Peanut-free lunches.', fullBody: 'fb',
      attachments: [], suggestedActions: [
        { id: 'a1', type: 'CALENDAR_EVENT', title: 'Zoo trip', sourceQuote: 'Zoo Thursday.', confidence: 'high', status: 'PROPOSED' },
      ],
      date: new Date('2026-04-21T15:00:00').getTime(), hubStatus: 'UNREAD',
    },
    {
      id: 'm2', subject: 'Weekly digest', sender: 'news@substack.com',
      classification: 'NEWSLETTER', snippet: 'Weekly.', fullBody: 'fb',
      attachments: [], suggestedActions: [], date: 0, hubStatus: 'UNREAD',
    },
  ]
  return {
    useHub: () => ({ profiles: [{ id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' }] }),
    useInboxEmails: () => ({ data: { emails } }),
    useClearEmail: () => ({ mutate: clearMutate }),
    useRestoreEmail: () => ({ mutate: restoreMutate }),
    __clearMutate: clearMutate,
    __restoreMutate: restoreMutate,
  }
})

describe('InboxPage', () => {
  it('renders three landmarks (queue / reader / action deck)', () => {
    render(<InboxPage />)
    expect(screen.getByLabelText(/triage queue/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email reader/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/suggested actions/i)).toBeInTheDocument()
  })

  it('auto-selects the first active email and renders it', () => {
    render(<InboxPage />)
    expect(screen.getByRole('heading', { name: 'Zoo trip' })).toBeInTheDocument()
  })

  it('shows NEWSLETTER row dimmed and excluded from unread count (count = 1, not 2)', () => {
    render(<InboxPage />)
    expect(screen.getByText(/1 unread/)).toBeInTheDocument()
  })

  it('clicking Clear calls clearMutate with the email id', () => {
    render(<InboxPage />)
    fireEvent.click(screen.getByRole('button', { name: /clear/i }))
    const { __clearMutate } = jest.requireMock('@/lib/store') as { __clearMutate: jest.Mock }
    expect(__clearMutate).toHaveBeenCalledWith({ id: 'm1' })
  })
})
```

- [ ] **Step 4: Run**

Run: `npx jest tests/components/inbox/inbox-page.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Type-check the full project**

Run: `npx tsc --noEmit`
Expected: zero errors. (The old `/inbox/page.tsx` is now replaced; any consumer of `actOnEmailAction` / `dismissEmailAction` outside `/inbox` should surface here — if so, fix in-place by deleting those references. The home page widget should not have been using them; verify.)

- [ ] **Step 6: Commit**

```bash
git add src/components/inbox/queue-list.tsx src/app/inbox/page.tsx tests/components/inbox/inbox-page.test.tsx
git commit -m "feat(inbox): three-pane /inbox page composing QueueList + EmailReader + ActionDeck + Cmd+K"
```

---

### Task 13: Delete `action-compat` shim + its callers

Phase 2 installed the shim to keep the old UI alive. The new UI uses `EmailActionStatus` directly. Rip it out.

**Files:**
- Delete: `src/lib/action-compat.ts`
- Delete: `tests/lib/action-compat.test.ts`
- Audit/modify: any remaining callers

- [ ] **Step 1: Find all imports of action-compat**

Run: `grep -rn "action-compat" src tests`
Expected: only `src/lib/action-compat.ts`, `tests/lib/action-compat.test.ts`, and (if Phase 2 left it) possibly `src/components/inbox/learn-domain-banner.tsx` or similar. Record the list.

- [ ] **Step 2: Remove each import and replace with direct `EmailActionStatus` comparison**

For every file that still imports from `@/lib/action-compat`, replace uses of:

- `isActionable(status)` → `(status === 'PROPOSED' || status === 'EDITING')`
- `toLegacyStatus(status)` → just use the status directly (update any UI label mapping accordingly)
- `fromLegacyStatus(...)` → remove (no longer needed)

Then delete the import line.

- [ ] **Step 3: Delete the shim files**

```bash
git rm src/lib/action-compat.ts tests/lib/action-compat.test.ts
```

- [ ] **Step 4: Confirm the build is clean**

Run:

```bash
npx tsc --noEmit
npx jest
```

Expected: zero type errors, all tests still pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(inbox): delete action-compat shim; UI uses EmailActionStatus directly"
```

---

### Task 14: Contrast sweep — standardize on `text-muted-foreground`

The spec says: *"Adjust contrast on small labels (current `text-foreground/40` grays are too faint to read reliably). Standardize on `text-foreground/60` or `text-muted-foreground` for supporting metadata."*

**Files:**
- Audit/modify: every file under `src/` and `src/components/` that uses `text-foreground/40`

- [ ] **Step 1: Find every offender**

Run: `grep -rn "text-foreground/40" src`
Expected: a list of remaining occurrences outside the inbox (e.g., settings, home page components). The inbox files written in Tasks 1-12 already use `text-muted-foreground`.

- [ ] **Step 2: Replace each occurrence**

Replace every `text-foreground/40` with `text-muted-foreground`. Do not touch `text-foreground/60` or `text-foreground/80` — those contrast levels are acceptable.

- [ ] **Step 3: Confirm nothing visually regressed**

Run:

```bash
npx tsc --noEmit
npx jest
npm run dev
```

Open the app in the browser. Spot-check `/settings`, home page, and `/inbox`. Record any visual regressions (e.g., a label that disappears into the background) and fix them inline by promoting to `text-foreground/80` where needed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(ui): standardize small-label grays on text-muted-foreground (drop text-foreground/40)"
```

---

### Task 15: Framer Motion deck slide-in polish

Small moment-of-delight: when the selected email changes, the action deck cards slide in from the right. Non-blocking animation; respects `prefers-reduced-motion`.

**Files:**
- Modify: `src/components/inbox/action-deck.tsx`
- Modify: `tests/components/inbox/action-deck.test.tsx` (only to confirm the existing assertions still hold under the animated layout)

- [ ] **Step 1: Wrap each card in `motion.div`**

In `src/components/inbox/action-deck.tsx`, replace the inner render block:

```tsx
<div className="flex flex-col gap-6">
  {visible.map((a) => (
    <ActionCard key={a.id} action={a} onSkip={(id) => setDismissed((s) => new Set(s).add(id))} />
  ))}
</div>
```

with:

```tsx
<motion.div layout className="flex flex-col gap-6">
  {visible.map((a, i) => (
    <motion.div
      key={a.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18, delay: i * 0.04 }}
    >
      <ActionCard action={a} onSkip={(id) => setDismissed((s) => new Set(s).add(id))} />
    </motion.div>
  ))}
</motion.div>
```

Add the import at the top of the file:

```ts
import { motion } from "framer-motion"
```

- [ ] **Step 2: Re-run the deck test**

Run: `npx jest tests/components/inbox/action-deck.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/action-deck.tsx
git commit -m "polish(inbox): framer-motion slide-in for action deck cards"
```

---

### Task 16: End-to-end smoke checklist + merge prep

- [ ] **Step 1: Run the full verification stack**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: zero errors across all three.

- [ ] **Step 2: Manual smoke**

Run: `npm run dev` and log in. Confirm:

- [ ] `/inbox` loads with three panes: Queue left (320px), Reader middle (flex), Action deck right (300px).
- [ ] Sender-identity chips show colored dot + `ORG · PERSON` where resolved; fall back to raw sender otherwise.
- [ ] Action badges `CAL` / `TODO` / `REPLY` / `PDF` render in rows that have matching actions / attachments.
- [ ] A `WAITING_ON` row shows the `⏳ Waiting on <person> <ago>` badge.
- [ ] A `NEWSLETTER` row is visibly dimmed and is NOT counted in the "N unread" header.
- [ ] Reader header shows sender name, address, 12-hour timestamp (e.g. `3:00 PM`).
- [ ] Clicking `Read full email` expands inline; clicking it again collapses.
- [ ] Action cards show editable fields for the right action type. Clicking the primary button (e.g. `Add to Google Calendar`) shows a toast "Phase 3 stub — real Google writes land in Phase 4" and does not commit anywhere.
- [ ] Skip on an action card dismisses it from the deck (local state; does not persist).
- [ ] Clear button in the reader header marks the email CLEARED. The row disappears from the active queue; header unread count drops by one (unless it was a NEWSLETTER).
- [ ] `▸ Recently cleared (N)` expands on click, lists the cleared emails with Restore buttons. Restore flips the email back to UNREAD, returns it to the queue, and auto-collapses the section.
- [ ] Cmd+K opens the command palette; typing filters by subject/sender; clicking a result selects that email.
- [ ] No `text-foreground/40` occurrences remain (confirm with `grep -rn "text-foreground/40" src`).

Record each ✅/❌ in the final commit message.

- [ ] **Step 3: Update Phase 2 plan footer**

Find the "What's Next (Phase 3+)" section at the end of `docs/superpowers/plans/2026-04-21-inbox-phase-2-ai-extraction.md`. Replace the Phase 3 stub with:

```
- **Phase 3:** ✅ Shipped. Three-pane /inbox, classification-driven row treatments, editable action cards (stubbed commits), Clear + Recently cleared via inbox.markCleared/markUnread, Cmd+K, contrast sweep, action-compat shim deleted. Plan: `docs/superpowers/plans/2026-04-21-inbox-phase-3-ui-redesign.md`.
```

- [ ] **Step 4: Commit the verification note**

```bash
git add docs/superpowers/plans/2026-04-21-inbox-phase-2-ai-extraction.md
git commit --allow-empty -m "chore: Phase 3 UI redesign verified end-to-end

Suite: 0 tsc errors, jest green, 0 lint errors.
Manual smoke:
- Three-pane layout: ✅
- Sender chips + action badges: ✅
- Row treatments (WAITING_ON / NEWSLETTER): ✅
- 12-hour clock everywhere: ✅
- Clear + optimistic hubStatus update: ✅
- Recently cleared expand + Restore + auto-collapse: ✅
- Cmd+K quick-jump: ✅
- action-compat shim removed: ✅
- text-foreground/40 eliminated: ✅"
```

- [ ] **Step 5: Handoff**

Open a PR from `feature/inbox-phase-3-ui` into `main`. Title:

> Inbox Phase 3: three-pane UI redesign + Clear mutation stub

Body summary:
- Lists the new components (QueueList, EmailReader, ActionDeck, ActionCard, RecentlyCleared, CommandPalette).
- Notes that action-card primary buttons are stubs — Phase 4 wires Google Calendar / Tasks / Gmail writes.
- Notes that Clear does not yet mark Gmail as read — Phase 4 adds `gmail.modify`.
- Confirms the `action-compat` shim from Phase 2 is deleted.

---

## Post-Phase Verification

Before any Phase 4 work starts on top of this branch:

1. `npx tsc --noEmit` — clean.
2. `npx jest` — both node and jsdom projects green.
3. `npm run lint` — clean.
4. Manual smoke from Task 16 Step 2 — all ✅.
5. `grep -rn "text-foreground/40" src` returns zero results.
6. `grep -rn "action-compat" src tests` returns zero results.

## What's Next

- **Phase 4:** Real Google write flow — `actionsRouter.commitCalendar` / `commitTask` / `sendReply`; idempotency keys (`${emailId}:${actionId}`); 401 auto-refresh; duplicate detection for calendar events; Gmail `gmail.modify` on Clear.
- **Phase 5:** PDF extraction — `attachmentsRouter.extract` with lazy-on-open + Firestore cache + Life Graph hits.
- **Phase 6:** Reply capability end-to-end via `gmail.send`.
- **Phase 7:** Home widget redesign — compact mirror of the `/inbox` layout; deep-link via `?thread=<id>` back into `/inbox`.
