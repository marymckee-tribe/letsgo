# Inbox Phase 7 — Home Widget (Bouncer) Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing accordion-heavy `Bouncer` widget on the home page with a compact vertical list that mirrors the Phase 3 `/inbox` Queue — colored sender-identity dots, `ORG · PERSON` labels, action-type badges (CAL, TODO, REPLY, PDF), a featured row with dark left border, and a footer that deep-links to `/inbox?thread={id}`. The widget shares the `trpc.inbox.digest.useQuery()` cache with `/inbox`, so clearing an email there auto-updates the home page.

**Architecture:** `Bouncer` becomes a pure presentational component fed by a single `trpc.inbox.digest.useQuery()` hook (identical args to `/inbox`, so the query key and cache entry are shared by react-query). Top 3 items (sorted chronologically, `NEWSLETTER` classification excluded) render as compact rows. The last-selected-in-`/inbox` email is marked "featured" via a tiny shared Zustand-style slice in the existing `store.tsx` (`lastSelectedEmailId`). Badges derive from `email.suggestedActions[].type` plus `email.attachments.length`. Footer link uses `/inbox?thread={featuredId}`, and `/inbox` reads the `?thread=` query param on mount to select that email. No new server routes, no data-model changes.

**Tech Stack:** Next.js 16 (App Router), React 19, tRPC v11 React bindings, TanStack Query v5, Tailwind v4, React Testing Library + Jest (jsdom env), `lucide-react` for iconography, `next/link` + `next/navigation` (`useSearchParams`) for deep-linking.

**Base branch:** Branch `inbox/phase-7-home-widget` off of the tip that has Phase 2 (`inboxRouter.digest` returning the new `Email` shape with `classification`, `senderIdentity`, `attachments`, enriched `suggestedActions`) and Phase 3 (`/inbox` Queue redesign, color-coded sender-identity dots) merged. If Phase 3 has not merged yet, rebase onto the Phase 2 tip and replicate the Phase 3 `senderIdentityColor` helper inline in this phase — see Task 2.

---

## Before You Start — Read These

The home page is a Next.js 16 App Router page that imports `Bouncer` from `src/components/widgets/bouncer.tsx`. This phase introduces jsdom-based component tests (the repo currently only has node-env tests), and deep-linking via `useSearchParams` in a client component. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — not directly used, but confirms there's no change to routing.
- `node_modules/next/dist/docs/01-app/02-api-reference/04-functions/use-search-params.md` — the App Router `useSearchParams` hook we'll use to read `?thread=` in `/inbox`.
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data.
- `https://tanstack.com/query/v5/docs/framework/react/guides/query-keys` — shared cache semantics. `trpc.inbox.digest.useQuery(undefined, opts)` with identical input always hits the same cache entry across components. We rely on this.
- `https://trpc.io/docs/client/react` — `trpc.*.useQuery()` + `useUtils().invalidate()` patterns.
- `AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that.

If any doc conflicts with this plan, follow the docs and update the plan.

---

## File Structure

### New files
- `src/components/widgets/bouncer-row.tsx` — single row sub-component (colored dot + `ORG · PERSON` label + subject + badges + border treatment)
- `src/components/widgets/bouncer-badges.tsx` — derives CAL / TODO / REPLY / PDF badges from an `Email` and renders them as a row of pills
- `src/lib/sender-identity-color.ts` — deterministic color mapping: `senderIdentity | undefined → hex`. Mirrors the Phase 3 Queue chip color scheme so the home widget and `/inbox` are visually consistent.
- `tests/components/widgets/bouncer.test.tsx` — component test: renders with 3 mock emails, shows correct unread count (excluding NEWSLETTER), featured row has dark left border, footer link has correct href format, "N more" is accurate.
- `tests/components/widgets/bouncer-row.test.tsx` — component test: renders dot / label / subject / badges in muted state by default, featured state adds dark border.
- `tests/components/widgets/bouncer-badges.test.tsx` — component test: CAL/TODO/REPLY emitted from actions, PDF emitted from attachments, NEWSLETTER emits none.
- `tests/lib/sender-identity-color.test.ts` — unit test: stable, deterministic color per personId/orgName; unknown identity gets the neutral color.

### Modified files
- `src/components/widgets/bouncer.tsx` — full rewrite. Replaces the existing accordion-based shell with the compact list.
- `src/app/inbox/page.tsx` — read `?thread=` on mount via `useSearchParams`; seed `selectedId` with it if present in `emails`. Persist last-selected id to `useHub().setLastSelectedEmailId(id)` so the widget can highlight the featured row.
- `src/lib/store.tsx` — add `lastSelectedEmailId: string | null` state + `setLastSelectedEmailId(id: string | null)` setter to the `HubContext` / `useHub()` shape. No server calls.
- `jest.config.mjs` — split test envs so component tests (`**/tests/components/**`) run in `jsdom` while existing server tests keep `node`. See Task 0.
- `package.json` — add `@testing-library/jest-dom` matchers to `setupFilesAfterEach` (already a devDep) and add `whatwg-fetch` shim if jsdom complains about `Request`. See Task 0.

### Explicitly NOT touched
- `src/server/trpc/routers/inbox.ts` — widget reuses `inbox.digest` as-is.
- `src/app/api/trpc/[trpc]/route.ts` — no server changes.
- Phase 3 Queue component — if Phase 3 already exports a `senderIdentityColor` helper under `src/lib/sender-identity-color.ts`, REUSE it instead of re-creating; see Task 2 Step 1.

---

## Prerequisites (one-time)

- [ ] **P1. Confirm the base.** Run `git log --oneline -5`. The tip should include the Phase 2 digest rewrite (`feat(inbox): rewrite digest route with 6 classifications + sender identity`) and ideally the Phase 3 UI work. If Phase 3 hasn't merged, note it — Task 2 handles the fallback.

- [ ] **P2. Confirm the suite is green.** Run `npx tsc --noEmit && npx jest`. Both must pass before starting.

- [ ] **P3. Create the working branch.** Run `git checkout -b inbox/phase-7-home-widget`.

- [ ] **P4. Sanity-check the existing widget shape.** Open `src/components/widgets/bouncer.tsx` and `src/app/page.tsx`. Confirm the current widget takes `className?: string` and is mounted inside `<div className="lg:col-span-4 flex flex-col h-full min-h-0">`. The rewrite must preserve that API (one `className` prop, fills height).

---

## Tasks

### Task 0: Jest environment split for component tests

The existing Jest config runs in `node`. React Testing Library needs `jsdom`. Rather than move everything, split by path: component tests use `jsdom`; server tests stay `node`.

**Files:**
- Modify: `jest.config.mjs`
- Modify: `tests/setup.ts`

- [ ] **Step 1: Update Jest config to use projects**

Replace the contents of `jest.config.mjs` with:

```js
// jest.config.mjs
/** @type {import('jest').Config} */
const common = {
  preset: 'ts-jest',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEach: ['<rootDir>/tests/setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
  },
}

const config = {
  projects: [
    {
      ...common,
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/tests/api/**/*.test.ts',
        '<rootDir>/tests/server/**/*.test.ts',
        '<rootDir>/tests/lib/**/*.test.ts',
        '<rootDir>/tests/fixtures/**/*.test.ts',
      ],
    },
    {
      ...common,
      displayName: 'components',
      testEnvironment: 'jsdom',
      testMatch: [
        '<rootDir>/tests/components/**/*.test.tsx',
        '<rootDir>/tests/lib/**/*.test.tsx',
      ],
      setupFilesAfterEach: ['<rootDir>/tests/setup.ts', '<rootDir>/tests/setup-dom.ts'],
    },
  ],
}

export default config
```

- [ ] **Step 2: Create the jsdom setup file**

Create `tests/setup-dom.ts`:

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Confirm the config is valid**

Run: `npx jest --listTests`
Expected: lists existing server tests (under `server`/`api`/`lib`/`fixtures` display names) and no component tests yet (none exist). Zero config errors.

- [ ] **Step 4: Run the full suite**

Run: `npx jest`
Expected: all pre-existing tests still pass. Nothing new yet.

- [ ] **Step 5: Commit**

```bash
git add jest.config.mjs tests/setup-dom.ts
git commit -m "chore(test): split jest into server (node) and components (jsdom) projects"
```

---

### Task 1: Add `lastSelectedEmailId` to the hub store

The home widget needs to know which email `/inbox` had selected last, so the featured row matches. This is a single primitive state field on the existing store context.

**Files:**
- Modify: `src/lib/store.tsx`
- Create: `tests/components/store/last-selected-email.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/store/last-selected-email.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react'
import { HubProvider, useHub } from '@/lib/store'

function Probe() {
  const { lastSelectedEmailId, setLastSelectedEmailId } = useHub()
  return (
    <div>
      <span data-testid="value">{lastSelectedEmailId ?? 'null'}</span>
      <button onClick={() => setLastSelectedEmailId('m1')}>set</button>
      <button onClick={() => setLastSelectedEmailId(null)}>clear</button>
    </div>
  )
}

describe('useHub lastSelectedEmailId', () => {
  it('defaults to null and updates on setLastSelectedEmailId', () => {
    render(<HubProvider><Probe /></HubProvider>)
    expect(screen.getByTestId('value')).toHaveTextContent('null')
    act(() => screen.getByText('set').click())
    expect(screen.getByTestId('value')).toHaveTextContent('m1')
    act(() => screen.getByText('clear').click())
    expect(screen.getByTestId('value')).toHaveTextContent('null')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/store/last-selected-email.test.tsx`
Expected: FAIL — either `setLastSelectedEmailId is not a function` or `lastSelectedEmailId is undefined`.

- [ ] **Step 3: Implement in the store**

Open `src/lib/store.tsx`. Locate the `HubContext`/`HubProvider` / exported types. Make three additions:

1. Extend the `HubContextValue` type with the two new members:

```ts
lastSelectedEmailId: string | null
setLastSelectedEmailId: (id: string | null) => void
```

2. Inside `HubProvider`, add the state hook next to the other `useState` calls:

```ts
const [lastSelectedEmailId, setLastSelectedEmailId] = useState<string | null>(null)
```

3. Include both values in the `value` object passed to `HubContext.Provider`.

If `HubProvider` is missing and the file exports a hook that directly uses module-level state, match the existing pattern (add the field to that module state; expose the setter). DO NOT refactor the store shape — only add.

- [ ] **Step 4: Confirm the test passes**

Run: `npx jest tests/components/store/last-selected-email.test.tsx`
Expected: PASS.

- [ ] **Step 5: Confirm type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.tsx tests/components/store/last-selected-email.test.tsx
git commit -m "feat(store): add lastSelectedEmailId state for widget/inbox sync"
```

---

### Task 2: `sender-identity-color.ts` helper

Deterministic color per identity so the widget and Phase 3 Queue use the same dot color. If Phase 3 already shipped this exact helper, REUSE and skip to Task 3 (this file will already exist).

**Files:**
- Create: `src/lib/sender-identity-color.ts`
- Create: `tests/lib/sender-identity-color.test.ts`

- [ ] **Step 1: Check for existing Phase 3 helper**

Run: `git ls-files src/lib/sender-identity-color.ts`

If the file exists: open it, read its signature. If it already exports `senderIdentityColor(identity: SenderIdentity | undefined): string`, REUSE it — skip Steps 2–5 and move on to Task 3. If it exists with a different signature, adapt the signature below to match (rename `senderIdentityColor` accordingly throughout this plan).

If the file does not exist: continue with Step 2.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/sender-identity-color.test.ts`:

```ts
import { senderIdentityColor } from '@/lib/sender-identity-color'

describe('senderIdentityColor', () => {
  it('returns the neutral color when identity is undefined', () => {
    expect(senderIdentityColor(undefined)).toBe('#A3A3A3')
  })

  it('returns the neutral color when identity has no personId or orgName', () => {
    expect(senderIdentityColor({ confidence: 'low' })).toBe('#A3A3A3')
  })

  it('is deterministic per personId', () => {
    const a = senderIdentityColor({ personId: 'ellie', confidence: 'high' })
    const b = senderIdentityColor({ personId: 'ellie', confidence: 'low' })
    expect(a).toBe(b)
  })

  it('is deterministic per orgName when personId is absent', () => {
    const a = senderIdentityColor({ orgName: 'Blessed Sacrament', confidence: 'high' })
    const b = senderIdentityColor({ orgName: 'Blessed Sacrament', confidence: 'medium' })
    expect(a).toBe(b)
  })

  it('gives different identities different colors (low collision)', () => {
    const c1 = senderIdentityColor({ personId: 'ellie', confidence: 'high' })
    const c2 = senderIdentityColor({ personId: 'annie', confidence: 'high' })
    const c3 = senderIdentityColor({ personId: 'doug', confidence: 'high' })
    expect(new Set([c1, c2, c3]).size).toBe(3)
  })

  it('returns a valid 7-char hex', () => {
    const c = senderIdentityColor({ personId: 'ellie', confidence: 'high' })
    expect(c).toMatch(/^#[0-9A-F]{6}$/)
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx jest tests/lib/sender-identity-color.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sender-identity-color'`.

- [ ] **Step 4: Implement**

Create `src/lib/sender-identity-color.ts`:

```ts
import type { SenderIdentity } from '@/lib/store'

const PALETTE = [
  '#D97706', // amber (Ellie)
  '#2563EB', // blue (Annie)
  '#7C3AED', // violet (Doug)
  '#059669', // emerald
  '#DB2777', // pink
  '#0891B2', // cyan
  '#65A30D', // lime
  '#C2410C', // orange-deep
  '#4F46E5', // indigo
  '#BE185D', // rose-deep
] as const

const NEUTRAL = '#A3A3A3'

function hash(input: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function senderIdentityColor(identity: SenderIdentity | undefined): string {
  if (!identity) return NEUTRAL
  const key = identity.personId ?? identity.orgName
  if (!key) return NEUTRAL
  const idx = hash(key) % PALETTE.length
  return PALETTE[idx]
}
```

- [ ] **Step 5: Confirm the test passes**

Run: `npx jest tests/lib/sender-identity-color.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/sender-identity-color.ts tests/lib/sender-identity-color.test.ts
git commit -m "feat(inbox): deterministic sender-identity color helper"
```

---

### Task 3: `BouncerBadges` component (CAL / TODO / REPLY / PDF)

A small presentational piece that takes an `Email` and emits the action-type badges. Isolating it keeps the main widget file focused on layout.

**Files:**
- Create: `src/components/widgets/bouncer-badges.tsx`
- Create: `tests/components/widgets/bouncer-badges.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/bouncer-badges.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { BouncerBadges } from '@/components/widgets/bouncer-badges'
import type { Email } from '@/lib/store'

function mkEmail(overrides: Partial<Email>): Email {
  return {
    id: 'm1',
    subject: 'Test',
    sender: 'a@b.c',
    classification: 'FYI',
    snippet: '...',
    fullBody: '...',
    attachments: [],
    suggestedActions: [],
    date: 0,
    hubStatus: 'UNREAD',
    ...overrides,
  } as Email
}

describe('BouncerBadges', () => {
  it('renders CAL when suggestedActions has a CALENDAR_EVENT', () => {
    const email = mkEmail({
      classification: 'CALENDAR_EVENT',
      suggestedActions: [{ id: 'a1', type: 'CALENDAR_EVENT', status: 'PROPOSED', title: 'Zoo', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number]],
    })
    render(<BouncerBadges email={email} />)
    expect(screen.getByText('CAL')).toBeInTheDocument()
  })

  it('renders TODO when suggestedActions has a TODO', () => {
    const email = mkEmail({
      classification: 'TODO',
      suggestedActions: [{ id: 'a1', type: 'TODO', status: 'PROPOSED', title: 'Pack', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number]],
    })
    render(<BouncerBadges email={email} />)
    expect(screen.getByText('TODO')).toBeInTheDocument()
  })

  it('renders REPLY when suggestedActions has a NEEDS_REPLY', () => {
    const email = mkEmail({
      classification: 'NEEDS_REPLY',
      suggestedActions: [{ id: 'a1', type: 'NEEDS_REPLY', status: 'PROPOSED', title: 'Reply', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number]],
    })
    render(<BouncerBadges email={email} />)
    expect(screen.getByText('REPLY')).toBeInTheDocument()
  })

  it('renders PDF when email has a pdf attachment', () => {
    const email = mkEmail({
      attachments: [{ id: 'att1', filename: 'slip.pdf', mimeType: 'application/pdf', size: 100 }],
    })
    render(<BouncerBadges email={email} />)
    expect(screen.getByText('PDF')).toBeInTheDocument()
  })

  it('renders multiple badges in order CAL, TODO, REPLY, PDF', () => {
    const email = mkEmail({
      classification: 'CALENDAR_EVENT',
      suggestedActions: [
        { id: 'a1', type: 'CALENDAR_EVENT', status: 'PROPOSED', title: 'Zoo', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number],
        { id: 'a2', type: 'TODO', status: 'PROPOSED', title: 'Pack', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number],
        { id: 'a3', type: 'NEEDS_REPLY', status: 'PROPOSED', title: 'Reply', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number],
      ],
      attachments: [{ id: 'att1', filename: 'slip.pdf', mimeType: 'application/pdf', size: 100 }],
    })
    const { container } = render(<BouncerBadges email={email} />)
    const badges = Array.from(container.querySelectorAll('[data-badge]')).map(el => el.getAttribute('data-badge'))
    expect(badges).toEqual(['CAL', 'TODO', 'REPLY', 'PDF'])
  })

  it('renders nothing for a NEWSLETTER with no attachments', () => {
    const email = mkEmail({ classification: 'NEWSLETTER' })
    const { container } = render(<BouncerBadges email={email} />)
    expect(container.querySelectorAll('[data-badge]')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/widgets/bouncer-badges.test.tsx`
Expected: FAIL — `Cannot find module '@/components/widgets/bouncer-badges'`.

- [ ] **Step 3: Implement**

Create `src/components/widgets/bouncer-badges.tsx`:

```tsx
"use client"

import type { Email } from '@/lib/store'

type BadgeKind = 'CAL' | 'TODO' | 'REPLY' | 'PDF'

function deriveBadges(email: Email): BadgeKind[] {
  const kinds: BadgeKind[] = []
  const actionTypes = new Set(email.suggestedActions?.map(a => a.type) ?? [])
  if (actionTypes.has('CALENDAR_EVENT')) kinds.push('CAL')
  if (actionTypes.has('TODO')) kinds.push('TODO')
  if (actionTypes.has('NEEDS_REPLY')) kinds.push('REPLY')
  const hasPdf = email.attachments?.some(a => a.mimeType === 'application/pdf') ?? false
  if (hasPdf) kinds.push('PDF')
  return kinds
}

export function BouncerBadges({ email }: { email: Email }) {
  const badges = deriveBadges(email)
  if (badges.length === 0) return null
  return (
    <div className="flex items-center gap-1.5">
      {badges.map(kind => (
        <span
          key={kind}
          data-badge={kind}
          className="text-[9px] font-bold uppercase tracking-widest text-foreground/60 border border-border px-1.5 py-[1px] bg-background"
        >
          {kind}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npx jest tests/components/widgets/bouncer-badges.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/bouncer-badges.tsx tests/components/widgets/bouncer-badges.test.tsx
git commit -m "feat(widget): BouncerBadges — CAL/TODO/REPLY/PDF derivation"
```

---

### Task 4: `BouncerRow` component

One compact row. Colored dot + `ORG · PERSON` label + subject + badges + left-border treatment driven by `featured` prop.

**Files:**
- Create: `src/components/widgets/bouncer-row.tsx`
- Create: `tests/components/widgets/bouncer-row.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/bouncer-row.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { BouncerRow } from '@/components/widgets/bouncer-row'
import type { Email } from '@/lib/store'

function mkEmail(overrides: Partial<Email>): Email {
  return {
    id: 'm1',
    subject: 'Zoo trip Thursday',
    sender: 'Ms. Redd <office@blessedsacrament.org>',
    classification: 'CALENDAR_EVENT',
    senderIdentity: { personId: 'ellie', orgName: 'Blessed Sacrament', confidence: 'high' },
    snippet: 'Zoo Thursday 8am',
    fullBody: 'Zoo Thursday 8am',
    attachments: [],
    suggestedActions: [],
    date: 0,
    hubStatus: 'UNREAD',
    ...overrides,
  } as Email
}

describe('BouncerRow', () => {
  it('renders the ORG · PERSON label when both are present', () => {
    render(<BouncerRow email={mkEmail({})} featured={false} />)
    expect(screen.getByText(/Blessed Sacrament · ellie/i)).toBeInTheDocument()
  })

  it('renders PERSON only when orgName is absent', () => {
    render(<BouncerRow email={mkEmail({ senderIdentity: { personId: 'doug', confidence: 'high' } })} featured={false} />)
    expect(screen.getByText(/^doug$/i)).toBeInTheDocument()
  })

  it('renders ORG only when personId is absent', () => {
    render(<BouncerRow email={mkEmail({ senderIdentity: { orgName: 'Audaucy', confidence: 'medium' } })} featured={false} />)
    expect(screen.getByText(/^Audaucy$/i)).toBeInTheDocument()
  })

  it('falls back to the raw sender when senderIdentity is absent', () => {
    render(<BouncerRow email={mkEmail({ senderIdentity: undefined, sender: 'noreply@example.com' })} featured={false} />)
    expect(screen.getByText(/noreply@example\.com/)).toBeInTheDocument()
  })

  it('renders the subject truncated (via CSS class)', () => {
    render(<BouncerRow email={mkEmail({ subject: 'A very long subject that should be truncated on screen' })} featured={false} />)
    const subject = screen.getByText(/A very long subject/)
    expect(subject.className).toMatch(/truncate/)
  })

  it('applies the featured border treatment when featured is true', () => {
    const { container } = render(<BouncerRow email={mkEmail({})} featured={true} />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toMatch(/border-l-\[3px\]/)
    expect(row.className).toMatch(/border-l-foreground/)
  })

  it('applies the muted border treatment when featured is false', () => {
    const { container } = render(<BouncerRow email={mkEmail({})} featured={false} />)
    const row = container.firstElementChild as HTMLElement
    expect(row.className).toMatch(/border-l/)
    expect(row.className).toMatch(/border-l-border/)
  })

  it('renders a sender-identity dot with an inline background-color style', () => {
    const { container } = render(<BouncerRow email={mkEmail({})} featured={false} />)
    const dot = container.querySelector('[data-testid="sender-dot"]') as HTMLElement
    expect(dot).not.toBeNull()
    expect(dot.getAttribute('style')).toMatch(/background-color/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/widgets/bouncer-row.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/components/widgets/bouncer-row.tsx`:

```tsx
"use client"

import type { Email } from '@/lib/store'
import { senderIdentityColor } from '@/lib/sender-identity-color'
import { BouncerBadges } from './bouncer-badges'

function identityLabel(email: Email): string {
  const id = email.senderIdentity
  const org = id?.orgName
  const person = id?.personId
  if (org && person) return `${org} · ${person}`
  if (person) return person
  if (org) return org
  return email.sender
}

export function BouncerRow({ email, featured }: { email: Email; featured: boolean }) {
  const color = senderIdentityColor(email.senderIdentity)
  const label = identityLabel(email)

  const borderClass = featured
    ? 'border-l-[3px] border-l-foreground shadow-[2px_2px_0_rgba(0,0,0,0.04)]'
    : 'border-l-[3px] border-l-border'

  return (
    <div className={`flex items-start gap-3 bg-card px-4 py-3 ${borderClass}`}>
      <span
        data-testid="sender-dot"
        aria-hidden="true"
        className="mt-1 block h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: color }}
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/60 truncate">
            {label}
          </span>
          <BouncerBadges email={email} />
        </div>
        <span className="text-sm font-medium tracking-tight text-foreground truncate">
          {email.subject}
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Confirm the tests pass**

Run: `npx jest tests/components/widgets/bouncer-row.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/widgets/bouncer-row.tsx tests/components/widgets/bouncer-row.test.tsx
git commit -m "feat(widget): BouncerRow — compact identity/subject/badges row"
```

---

### Task 5: Rewrite `Bouncer` (main widget)

Replace the accordion shell with the compact list. Uses `trpc.inbox.digest.useQuery()` — identical args to `/inbox` so the react-query cache is shared.

**Files:**
- Modify: `src/components/widgets/bouncer.tsx`
- Create: `tests/components/widgets/bouncer.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/widgets/bouncer.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { Bouncer } from '@/components/widgets/bouncer'
import { trpc } from '@/lib/trpc/client'
import type { Email } from '@/lib/store'
import { HubProvider } from '@/lib/store'

jest.mock('@/lib/trpc/client', () => ({
  trpc: {
    inbox: {
      digest: {
        useQuery: jest.fn(),
      },
    },
  },
}))

function mkEmail(overrides: Partial<Email>): Email {
  return {
    id: 'm1',
    subject: 'S',
    sender: 'a@b.c',
    classification: 'FYI',
    senderIdentity: { personId: 'ellie', confidence: 'high' },
    snippet: '',
    fullBody: '',
    attachments: [],
    suggestedActions: [],
    date: 0,
    hubStatus: 'UNREAD',
    ...overrides,
  } as Email
}

const emails: Email[] = [
  mkEmail({ id: 'e1', subject: 'Zoo Thursday', classification: 'CALENDAR_EVENT',
    suggestedActions: [{ id: 'a1', type: 'CALENDAR_EVENT', status: 'PROPOSED', title: 'Zoo', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number]] }),
  mkEmail({ id: 'e2', subject: 'Permission slip',
    senderIdentity: { personId: 'annie', orgName: 'Audaucy', confidence: 'medium' },
    suggestedActions: [{ id: 'a2', type: 'TODO', status: 'PROPOSED', title: 'Sign', confidence: 'medium', sourceQuote: 'x' } as Email['suggestedActions'][number]],
    attachments: [{ id: 'att1', filename: 'slip.pdf', mimeType: 'application/pdf', size: 1 }],
  }),
  mkEmail({ id: 'e3', subject: 'Reply to Doug',
    senderIdentity: { personId: 'doug', confidence: 'high' },
    classification: 'NEEDS_REPLY',
    suggestedActions: [{ id: 'a3', type: 'NEEDS_REPLY', status: 'PROPOSED', title: 'Reply', confidence: 'high', sourceQuote: 'x' } as Email['suggestedActions'][number]] }),
  mkEmail({ id: 'e4', subject: 'Weekly newsletter', classification: 'NEWSLETTER' }),
  mkEmail({ id: 'e5', subject: 'Fifth item', classification: 'FYI' }),
]

const useQueryMock = trpc.inbox.digest.useQuery as unknown as jest.Mock

describe('Bouncer widget', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useQueryMock.mockReturnValue({ data: { emails }, isLoading: false, error: null })
  })

  it('renders a header with title, unread count (excluding NEWSLETTER), and "3 accts"', () => {
    render(<HubProvider><Bouncer /></HubProvider>)
    expect(screen.getByText(/^Inbox$/i)).toBeInTheDocument()
    // 5 emails total, 1 NEWSLETTER, 4 counted
    expect(screen.getByTestId('unread-count')).toHaveTextContent('4')
    expect(screen.getByText(/3 accts/i)).toBeInTheDocument()
  })

  it('renders exactly the top 3 rows', () => {
    const { container } = render(<HubProvider><Bouncer /></HubProvider>)
    const rows = container.querySelectorAll('[data-testid="bouncer-row"]')
    expect(rows).toHaveLength(3)
  })

  it('marks the featured row with the dark left border', () => {
    render(<HubProvider><Bouncer /></HubProvider>)
    const featured = screen.getByTestId('bouncer-row-featured')
    expect(featured.className).toMatch(/border-l-foreground/)
  })

  it('renders the footer "N more · Open Triage" with href=/inbox?thread=<featuredId>', () => {
    render(<HubProvider><Bouncer /></HubProvider>)
    const link = screen.getByRole('link', { name: /Open Triage/i })
    expect(link).toHaveAttribute('href', '/inbox?thread=e1')
    // 4 counted - 3 shown = 1 more
    expect(screen.getByText(/1 more/i)).toBeInTheDocument()
  })

  it('renders an empty state when there are no emails', () => {
    useQueryMock.mockReturnValue({ data: { emails: [] }, isLoading: false, error: null })
    render(<HubProvider><Bouncer /></HubProvider>)
    expect(screen.getByText(/Inbox zero/i)).toBeInTheDocument()
  })

  it('renders a loading state when isLoading is true and no cached data', () => {
    useQueryMock.mockReturnValue({ data: undefined, isLoading: true, error: null })
    render(<HubProvider><Bouncer /></HubProvider>)
    expect(screen.getByTestId('bouncer-loading')).toBeInTheDocument()
  })

  it('excludes NEWSLETTER emails from the top 3 rows', () => {
    useQueryMock.mockReturnValue({
      data: { emails: [emails[3], emails[0], emails[1], emails[2]] },
      isLoading: false,
      error: null,
    })
    const { container } = render(<HubProvider><Bouncer /></HubProvider>)
    const rows = Array.from(container.querySelectorAll('[data-testid="bouncer-row"]'))
    const ids = rows.map(r => r.getAttribute('data-email-id'))
    expect(ids).toEqual(['e1', 'e2', 'e3'])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/widgets/bouncer.test.tsx`
Expected: FAIL — the current `Bouncer` uses `useHub().emails`, not `trpc.inbox.digest.useQuery()`, and has no unread-count or footer link.

- [ ] **Step 3: Implement the rewritten widget**

Replace the entire contents of `src/components/widgets/bouncer.tsx`:

```tsx
"use client"

import Link from 'next/link'
import { useHub, type Email } from '@/lib/store'
import { trpc } from '@/lib/trpc/client'
import { BouncerRow } from './bouncer-row'

const VISIBLE_COUNT = 3

function countable(emails: Email[]): Email[] {
  return emails.filter(e => e.classification !== 'NEWSLETTER')
}

export function Bouncer({ className }: { className?: string }) {
  const { lastSelectedEmailId } = useHub()
  const { data, isLoading, error } = trpc.inbox.digest.useQuery(undefined, {
    // Same args as /inbox — shared cache entry.
  })

  const allEmails = data?.emails ?? []
  const visibleEmails = countable(allEmails).slice(0, VISIBLE_COUNT)
  const unreadCount = countable(allEmails).length
  const moreCount = Math.max(0, unreadCount - visibleEmails.length)

  const featuredId =
    (lastSelectedEmailId && visibleEmails.find(e => e.id === lastSelectedEmailId)?.id) ||
    visibleEmails[0]?.id ||
    null

  return (
    <div className={`flex flex-col h-full ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-end justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="font-heading text-4xl font-light tracking-tighter text-foreground">Inbox</h2>
          <span
            data-testid="unread-count"
            className="text-xs font-mono text-foreground/60"
          >
            {unreadCount}
          </span>
        </div>
        <span className="text-muted-foreground text-[10px] uppercase tracking-widest pb-1">
          3 accts
        </span>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-2">
        {error ? (
          <p className="text-xs text-destructive font-mono">Sync error: {error.message}</p>
        ) : isLoading && allEmails.length === 0 ? (
          <p data-testid="bouncer-loading" className="text-foreground/40 text-sm italic font-serif">
            Loading inbox…
          </p>
        ) : visibleEmails.length === 0 ? (
          <p className="text-foreground/40 text-sm italic font-serif">Inbox zero achieved.</p>
        ) : (
          visibleEmails.map((email) => {
            const isFeatured = email.id === featuredId
            return (
              <div
                key={email.id}
                data-testid={isFeatured ? 'bouncer-row-featured' : 'bouncer-row'}
                data-email-id={email.id}
                className={`${isFeatured ? 'border-l-[3px] border-l-foreground shadow-[2px_2px_0_rgba(0,0,0,0.04)]' : 'border-l-[3px] border-l-border'}`}
              >
                <BouncerRow email={email} featured={isFeatured} />
              </div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {visibleEmails.length > 0 && featuredId && (
        <div className="shrink-0 border-t border-border mt-4 pt-4">
          <Link
            href={`/inbox?thread=${featuredId}`}
            className="flex items-center justify-between text-[10px] uppercase font-bold tracking-widest text-foreground/60 hover:text-foreground transition-colors"
          >
            <span>{moreCount} more</span>
            <span>Open Triage →</span>
          </Link>
        </div>
      )}
    </div>
  )
}
```

A subtlety for the test: the outer wrapper `<div>` already carries `data-testid="bouncer-row-featured"` when featured, and otherwise `data-testid="bouncer-row"`. The inner `BouncerRow` also has its own border classes, but the outer div is what the tests query. Keep both — the outer wrapper is what enables the `data-testid` switching without touching `BouncerRow`'s API.

- [ ] **Step 4: Confirm the tests pass**

Run: `npx jest tests/components/widgets/bouncer.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Confirm the previous tests still pass**

Run: `npx jest`
Expected: all existing + new tests pass.

- [ ] **Step 6: Confirm type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. If `src/app/page.tsx` breaks because it passes props the new widget doesn't accept, confirm the widget still accepts only `className?: string`.

- [ ] **Step 7: Commit**

```bash
git add src/components/widgets/bouncer.tsx tests/components/widgets/bouncer.test.tsx
git commit -m "feat(widget): rewrite Bouncer as compact list with shared trpc cache"
```

---

### Task 6: `/inbox` deep-link from `?thread=` query param

`/inbox` currently seeds `selectedId` with `emails[0]?.id`. Extend it to read `?thread=` on mount and use that id if it's present in `emails`. Also wire `setLastSelectedEmailId` so the widget's featured row follows what `/inbox` had selected.

Conceptually this belongs to Phase 3, but it's a small, tightly scoped addition required for this phase's footer link contract. Keep the diff minimal.

**Files:**
- Modify: `src/app/inbox/page.tsx`
- Create: `tests/components/inbox/deep-link.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/deep-link.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import InboxPage from '@/app/inbox/page'
import { HubProvider, useHub } from '@/lib/store'
import type { Email } from '@/lib/store'

jest.mock('next/navigation', () => ({
  useSearchParams: jest.fn(),
}))
import { useSearchParams } from 'next/navigation'

jest.mock('@/lib/store', () => {
  const actual = jest.requireActual('@/lib/store')
  return {
    ...actual,
    useHub: jest.fn(),
  }
})
import { useHub as useHubMock } from '@/lib/store'

function mkEmail(id: string, subject: string): Email {
  return {
    id, subject, sender: 'x@y.z', classification: 'FYI',
    snippet: '', fullBody: subject, attachments: [], suggestedActions: [],
    date: 0, hubStatus: 'UNREAD',
  } as Email
}

const emails: Email[] = [
  mkEmail('e1', 'First'),
  mkEmail('e2', 'Second'),
  mkEmail('e3', 'Third'),
]

describe('/inbox deep-link via ?thread=', () => {
  const setLastSelectedEmailId = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useHubMock as unknown as jest.Mock).mockReturnValue({
      emails,
      actOnEmailAction: jest.fn(),
      dismissEmailAction: jest.fn(),
      lastSelectedEmailId: null,
      setLastSelectedEmailId,
    })
  })

  it('seeds selection with ?thread=e2 when it matches an email', () => {
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('thread=e2'))
    render(<HubProvider><InboxPage /></HubProvider>)
    expect(screen.getByText('Second')).toBeInTheDocument()
    // Detail pane renders the selected email's subject in the header.
    // Use getAllByText because the subject also appears in the queue row.
    expect(screen.getAllByText('Second').length).toBeGreaterThanOrEqual(1)
  })

  it('falls back to emails[0] when ?thread= is absent', () => {
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''))
    render(<HubProvider><InboxPage /></HubProvider>)
    // emails[0] is "First" — should be the selected subject.
    expect(screen.getAllByText('First').length).toBeGreaterThanOrEqual(1)
  })

  it('falls back to emails[0] when ?thread= does not match any email', () => {
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('thread=missing'))
    render(<HubProvider><InboxPage /></HubProvider>)
    expect(screen.getAllByText('First').length).toBeGreaterThanOrEqual(1)
  })

  it('persists the selected id to setLastSelectedEmailId on mount', () => {
    ;(useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('thread=e3'))
    render(<HubProvider><InboxPage /></HubProvider>)
    expect(setLastSelectedEmailId).toHaveBeenCalledWith('e3')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/deep-link.test.tsx`
Expected: FAIL — the current `/inbox` does not consume `useSearchParams` and does not call `setLastSelectedEmailId`.

- [ ] **Step 3: Patch `/inbox/page.tsx`**

Open `src/app/inbox/page.tsx`. Make these edits:

1. Add the import near the top:

```ts
import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
```

(The file already imports `useState` from `react`; add `useEffect` alongside it.)

2. Replace the existing `const { emails, ... } = useHub()` + `const [selectedId, setSelectedId] = useState...` block with:

```tsx
  const { emails, actOnEmailAction, dismissEmailAction, setLastSelectedEmailId } = useHub()
  const searchParams = useSearchParams()
  const threadParam = searchParams?.get('thread') ?? null

  const initialId =
    (threadParam && emails.find(e => e.id === threadParam)?.id) ||
    emails[0]?.id ||
    null

  const [selectedId, setSelectedId] = useState<string | null>(initialId)

  useEffect(() => {
    if (selectedId) setLastSelectedEmailId(selectedId)
  }, [selectedId, setLastSelectedEmailId])

  useEffect(() => {
    // If deep-link changed after mount (e.g., navigation from the home widget), pick it up.
    if (threadParam && emails.some(e => e.id === threadParam) && threadParam !== selectedId) {
      setSelectedId(threadParam)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadParam, emails])
```

Leave the rest of the component identical.

- [ ] **Step 4: Confirm the tests pass**

Run: `npx jest tests/components/inbox/deep-link.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Confirm type-check + full suite**

Run: `npx tsc --noEmit && npx jest`
Expected: zero errors, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/inbox/page.tsx tests/components/inbox/deep-link.test.tsx
git commit -m "feat(inbox): deep-link selection via ?thread= query param"
```

---

### Task 7: Cache invalidation — clearing in `/inbox` updates the widget

The widget and `/inbox` already share the same `trpc.inbox.digest.useQuery()` cache entry by virtue of identical input (`undefined`). Any mutation that calls `utils.inbox.digest.invalidate()` on success will cause both consumers to refetch. This task only adds a test that proves the cross-surface update, to guard against regressions (e.g., someone later adds a query-key arg to the widget and accidentally breaks sharing).

**Files:**
- Create: `tests/components/widgets/bouncer-cache-sync.test.tsx`

- [ ] **Step 1: Write the test**

Create `tests/components/widgets/bouncer-cache-sync.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Bouncer } from '@/components/widgets/bouncer'
import { HubProvider } from '@/lib/store'
import type { Email } from '@/lib/store'

// Build a minimal trpc client mock that uses a real QueryClient so we can
// assert cache sharing semantics end-to-end.
jest.mock('@/lib/trpc/client', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query')
  return {
    trpc: {
      inbox: {
        digest: {
          useQuery: (input: unknown, opts: unknown) =>
            useQuery({
              queryKey: ['inbox.digest', input ?? null],
              queryFn: () => (globalThis as unknown as { __mockDigest: { emails: Email[] } }).__mockDigest,
              ...(opts as object),
            }),
        },
      },
    },
  }
})

function mkEmail(id: string, classification: Email['classification'] = 'FYI'): Email {
  return {
    id, subject: id, sender: 'x@y.z', classification,
    senderIdentity: { personId: id, confidence: 'high' },
    snippet: '', fullBody: '', attachments: [], suggestedActions: [],
    date: 0, hubStatus: 'UNREAD',
  } as Email
}

describe('Bouncer ↔ /inbox cache sync', () => {
  it('re-renders with fewer rows after inbox.digest cache is invalidated', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    ;(globalThis as unknown as { __mockDigest: { emails: Email[] } }).__mockDigest = {
      emails: [mkEmail('e1'), mkEmail('e2'), mkEmail('e3'), mkEmail('e4')],
    }

    render(
      <QueryClientProvider client={client}>
        <HubProvider><Bouncer /></HubProvider>
      </QueryClientProvider>
    )

    // Allow the initial fetch to resolve.
    await act(async () => { await client.fetchQuery({ queryKey: ['inbox.digest', null], queryFn: async () => (globalThis as unknown as { __mockDigest: unknown }).__mockDigest }) })

    expect(screen.getByTestId('unread-count')).toHaveTextContent('4')

    // Simulate /inbox clearing e1.
    ;(globalThis as unknown as { __mockDigest: { emails: Email[] } }).__mockDigest = {
      emails: [mkEmail('e2'), mkEmail('e3'), mkEmail('e4')],
    }
    await act(async () => { await client.invalidateQueries({ queryKey: ['inbox.digest'] }) })

    expect(screen.getByTestId('unread-count')).toHaveTextContent('3')
  })
})
```

- [ ] **Step 2: Run and watch it pass (or fail with a diagnostic if the mock is off)**

Run: `npx jest tests/components/widgets/bouncer-cache-sync.test.tsx`
Expected: PASS.

If it fails with a message about `useQueryClient` / `Provider`, the `HubProvider` or `Bouncer` is trying to access the real trpc client — double-check the jest mock path matches `@/lib/trpc/client` exactly.

- [ ] **Step 3: Commit**

```bash
git add tests/components/widgets/bouncer-cache-sync.test.tsx
git commit -m "test(widget): Bouncer reacts to inbox.digest cache invalidation"
```

---

### Task 8: Wire the new widget on the home page + smoke

The `Bouncer` component signature is unchanged (`className?: string`), so `src/app/page.tsx` does not need edits. But a quick manual smoke confirms everything hangs together in a real browser.

**Files:**
- No code changes.

- [ ] **Step 1: Full suite**

Run: `npx tsc --noEmit && npx jest && npm run lint`
Expected: all green.

- [ ] **Step 2: Dev-server smoke**

Run: `npm run dev`, log in, and verify in the browser:

1. Home page renders the compact Bouncer widget — header "Inbox", the unread count, "3 accts" label.
2. Exactly 3 rows visible when you have more than 3 unread emails (excluding NEWSLETTER).
3. First row has a darker left border; others use a muted border.
4. Each row shows a colored dot, `ORG · PERSON` (or whichever parts exist), subject truncated, and any of CAL / TODO / REPLY / PDF badges.
5. Footer shows `N more · Open Triage →`.
6. Clicking the footer navigates to `/inbox?thread=<id>` and that email is pre-selected on arrival.
7. In `/inbox`, click `Clear` on the pre-selected email → widget on the home tab (use a second tab) refreshes or refreshes on next focus, and the cleared email is gone, count drops by 1.

Record each ✅/❌ in the commit message.

- [ ] **Step 3: Kill the dev server and commit the smoke note**

```bash
git commit --allow-empty -m "chore: Phase 7 home widget verified end-to-end

Manual smoke:
- Header (title + count + 3 accts): ✅
- Top-3 rows with NEWSLETTER excluded: ✅
- Featured row dark border: ✅
- Badges CAL/TODO/REPLY/PDF: ✅
- Footer 'N more · Open Triage': ✅
- Deep-link /inbox?thread=<id>: ✅
- Clear-in-inbox → widget refresh: ✅"
```

---

### Task 9: Merge prep

- [ ] **Step 1: Rebase onto main if needed**

Run: `git fetch origin && git rebase origin/main`
Expected: no conflicts (no one else should be touching `bouncer.tsx` or `/inbox/page.tsx` concurrently). If conflicts in `/inbox/page.tsx` come from Phase 3, reconcile by keeping Phase 3's visuals and Phase 7's `useSearchParams` / `setLastSelectedEmailId` hooks.

- [ ] **Step 2: Final full suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: all green.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin inbox/phase-7-home-widget
gh pr create --title "Inbox Phase 7: home-page Bouncer widget redesign" --body "$(cat <<'EOF'
## Summary
- Rewrites the home-page Bouncer widget as a compact vertical list mirroring the Phase 3 /inbox Queue: colored sender-identity dot, ORG · PERSON, truncated subject, CAL/TODO/REPLY/PDF badges, featured row with dark left border.
- Widget and /inbox share a single trpc.inbox.digest.useQuery() cache entry, so clearing an email anywhere propagates.
- Adds /inbox deep-link via ?thread= query param and persists last-selected id to useHub() so the widget highlights the same email next visit.
- Splits Jest into node (server) and jsdom (components) projects.

## Test plan
- [ ] npx tsc --noEmit
- [ ] npx jest
- [ ] Manual smoke per Task 8 Step 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Post-Implementation Verification

1. `npx tsc --noEmit` — clean.
2. `npx jest` — full suite green (server project + components project).
3. `npm run lint` — clean.
4. Manual smoke from Task 8 Step 2 — all ✅.
5. Network-tab check in the browser: loading the home page fires **one** `/api/trpc/inbox.digest` call (batched with whatever else the page needs). Navigating to `/inbox` does not fire a second `inbox.digest` call — the cache is hit.

## What's Next

Phase 7 closes the inbox redesign arc. Future work that touches this widget:

- **Settings: top-N tunable.** The plan pins `VISIBLE_COUNT = 3` as a constant. When the user's settings gain a `widgetRowCount` preference, pipe it through `<Bouncer>` as a prop instead of the constant.
- **Account indicator on rows.** Today the header says "3 accts"; rows do not indicate which account. If prioritized, add a tiny account initial to the right of the `ORG · PERSON` line.
- **Optimistic clear from the widget.** The widget is read-only in this phase. Once `actionsRouter.markEmailCleared` ships (Phase 4/5 follow-up), we can add a long-press-to-clear affordance that writes through the same optimistic mutation `/inbox` uses.
