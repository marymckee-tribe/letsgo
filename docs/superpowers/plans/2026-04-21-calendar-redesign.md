# Calendar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `/calendar` weekly grid with a Schedule-X-powered page that supports day, week, and month views, calendar visibility toggles, profile filtering in a side panel, and AI prep-notes parity between home and calendar.

**Architecture:** Swap the custom `/calendar/page.tsx` week grid for a Schedule-X calendar app. Keep the existing server-side data pipeline (`/api/calendar/list`, multi-account merging, iCalUID dedupe, profile mapping). Extend the `CalendarMapping` schema with a `visible` flag so users can hide calendars. Render a vertical sidebar with calendar visibility + profile filter controls. Feed filtered events into Schedule-X. Theme Schedule-X via CSS variables to match the sorbet aesthetic.

**Tech Stack:** Next.js 16 (App Router), `@schedule-x/react`, `@schedule-x/calendar`, `@schedule-x/theme-default`, existing Firestore + Admin SDK, Jest + ts-jest.

**Spec reference:** This is Phase 1.5 — a calendar polish pass between Phase 1 (auth/multi-account, shipped) and Phase 4 (Google write flow, not yet planned).

---

## Before You Start — Read These

Schedule-X is actively evolving; version-specific API changes are common.

- Read the current Schedule-X docs for React at https://schedule-x.dev/docs/frameworks/react before writing any calendar code. Confirm the package names, `createCalendar` config shape, view modules (`viewDay`, `viewWeek`, `viewMonthGrid`, etc.), event format (`start`/`end` strings), calendar colors config, and theming variable names.
- Read the project's `AGENTS.md` (`node_modules/next/dist/docs/...`) before touching any Next.js route — Next.js 16 has breaking changes versus training data.
- If anything below conflicts with what the live Schedule-X docs say, follow the docs and update the plan.

---

## File Structure

### New files
- `src/components/calendar/calendar-app.tsx` — Schedule-X calendar wrapper (client component)
- `src/components/calendar/filter-sidebar.tsx` — Vertical sidebar: calendar visibility + profile filter
- `src/components/calendar/event-detail-drawer.tsx` — Side drawer shown on event click; displays AI prep notes
- `src/styles/schedule-x-theme.css` — CSS variable overrides theming Schedule-X to sorbet
- `tests/server/calendar-mappings.visibility.test.ts` — additional test for `visible` field round-trip

### Modified files
- `src/lib/server/calendar-mappings.ts` — add `visible?: boolean` (default `true`) to `CalendarMapping`; update setter to persist it
- `src/app/api/calendars/route.ts` — GET emits `visible` (default `true`); PUT accepts `visible` in body
- `src/app/api/calendar/list/route.ts` — filter out events whose `calendarId` has a mapping with `visible === false`
- `src/components/settings/calendars-section.tsx` — add visibility checkbox next to each calendar row
- `src/app/calendar/page.tsx` — replace the entire custom week grid with `<CalendarApp />` + `<FilterSidebar />`
- `src/lib/store.tsx` — extend `CalendarEvent` with `start: string` (ISO) and `end: string` (ISO) passed through verbatim from the server; keep the existing `date`/`time` fields for backwards compatibility with home-page widgets
- `src/app/api/calendar/event-notes/route.ts` — confirm or update to match new flow (same auth via Firebase ID token)
- `src/app/globals.css` (or equivalent) — import the new `schedule-x-theme.css`

### Out of scope
- Editing events in-place (create/update/delete) — Phase 4
- Recurrence editing — Phase 4
- Year view — product decision: skip
- Bulk calendar actions (assign all by domain pattern) — future
- Email → calendar action cards — Phase 2/3

---

## Prerequisites

These must hold before starting:

- [ ] **P1.** Branch `feature/inbox-phase-1` is checked out in `.worktrees/inbox-phase-1` and tests green (42 passing as of plan authoring).
- [ ] **P2.** `.env.local` contains all Phase 1 env vars (Google OAuth, Firebase Admin SA, token encryption key).
- [ ] **P3.** At least two Google accounts linked and at least one non-primary calendar visible in the existing `/settings` Calendars section (so the implementer can verify filtering works).

---

## Tasks

### Task 0: Install Schedule-X packages

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install packages**

Run: `npm install @schedule-x/react @schedule-x/calendar @schedule-x/theme-default @schedule-x/events-service`
Expected: packages added to `dependencies`. Verify peer dependency compatibility with React 19 / Next.js 16. If a peer warning about React 19 appears, check Schedule-X release notes and install the latest compatible minor version.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @schedule-x for calendar redesign"
```

---

### Task 1: Extend CalendarMapping with `visible` flag

**Files:**
- Modify: `src/lib/server/calendar-mappings.ts`
- Test: `tests/server/calendar-mappings.visibility.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/calendar-mappings.visibility.test.ts
import { setCalendarMapping, listCalendarMappings, type CalendarMapping } from '@/lib/server/calendar-mappings'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('calendar-mappings visibility', () => {
  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDoc: jest.Mock = jest.fn(() => ({ set: mockSet, get: mockGet, collection: mockCollection }))
  const mockCollection: jest.Mock = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({ collection: mockCollection, settings: jest.fn() })
  })

  it('persists visible=true by default on set when omitted', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.visible).toBe(true)
  })

  it('persists visible=false when provided', async () => {
    mockSet.mockResolvedValue(undefined)
    await setCalendarMapping('uid', {
      calendarId: 'c1',
      accountId: 'a1',
      calendarName: 'Work',
      profileId: null,
      visible: false,
    })
    const payload = mockSet.mock.calls[0][0] as CalendarMapping
    expect(payload.visible).toBe(false)
  })

  it('returns visible=true for docs missing the field (back-compat)', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'c1', data: () => ({ calendarId: 'c1', accountId: 'a1', calendarName: 'Work', profileId: null, updatedAt: 1 }) },
      ],
    })
    const out = await listCalendarMappings('uid')
    expect(out[0].visible).toBe(true)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/server/calendar-mappings.visibility.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend the module**

In `src/lib/server/calendar-mappings.ts`:

- Add `visible?: boolean` to the `CalendarMapping` interface (semantic default is `true`; the field is optional so existing docs without it read as `true`).
- In `setCalendarMapping`, accept `visible?: boolean` in the input, write `visible: input.visible ?? true` to Firestore.
- In `listCalendarMappings`, coerce reads: `visible: data.visible ?? true`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/calendar-mappings.visibility.test.ts`
Expected: 3 passing.

Also run: `npx jest`
Expected: 42 + 3 = 45 passing (previous 42 still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/calendar-mappings.ts tests/server/calendar-mappings.visibility.test.ts
git commit -m "feat(calendar): add visible flag to calendar mapping schema"
```

---

### Task 2: /api/calendars emits and accepts `visible`

**Files:**
- Modify: `src/app/api/calendars/route.ts`
- Modify: `tests/api/calendars.test.ts`

- [ ] **Step 1: Update the GET test**

In `tests/api/calendars.test.ts`, find the GET happy-path test. Add an assertion that `calendars[i].visible === true` when no mapping exists, and that it returns `false` when the mapping has `visible: false`.

```typescript
it('emits visible=true when calendar has no mapping', async () => {
  // existing happy-path setup...
  const res = await GET(req)
  const body = await res.json()
  expect(body.calendars[0].visible).toBe(true)
})

it('emits stored visible value when mapping present', async () => {
  ;(listCalendarMappings as jest.Mock).mockResolvedValue([
    { calendarId: 'c1', accountId: 'a1', calendarName: 'Work', profileId: null, visible: false, updatedAt: 1 },
  ])
  const res = await GET(req)
  const body = await res.json()
  const c = body.calendars.find((x: any) => x.calendarId === 'c1')
  expect(c.visible).toBe(false)
})
```

Add a PUT test:
```typescript
it('PUT accepts visible in body', async () => {
  const req = new Request('http://x/api/calendars', {
    method: 'PUT',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ calendarId: 'c1', accountId: 'a1', calendarName: 'Work', profileId: null, visible: false }),
  })
  const res = await PUT(req)
  expect(res.status).toBe(200)
  expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', expect.objectContaining({ visible: false }))
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/api/calendars.test.ts`
Expected: FAIL on new assertions.

- [ ] **Step 3: Update the route**

In `src/app/api/calendars/route.ts`:

- In GET: when merging stored mapping into each calendar, emit `visible: mapping?.visible ?? true`.
- In PUT: accept `visible: boolean | undefined` from body, pass through to `setCalendarMapping`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/calendars.test.ts`
Expected: all passing (previous 6 + 2 new = 8).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendars/route.ts tests/api/calendars.test.ts
git commit -m "feat(api): /api/calendars supports visible flag"
```

---

### Task 3: /api/calendar/list filters hidden calendars

**Files:**
- Modify: `src/app/api/calendar/list/route.ts`
- Modify: `tests/api/calendar-list.test.ts`

- [ ] **Step 1: Write failing test**

In `tests/api/calendar-list.test.ts`, add:

```typescript
it('filters out events whose calendar has visible=false in mapping', async () => {
  ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
  ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
  ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
  ;(listCalendarMappings as jest.Mock).mockResolvedValue([
    { calendarId: 'cal-hidden', accountId: 'a1', calendarName: 'Work', profileId: null, visible: false, updatedAt: 1 },
  ])
  ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
    { id: 'e1', title: 'Visible', start: '2026-04-22T10:00:00Z', calendarId: 'cal-visible' },
    { id: 'e2', title: 'Hidden', start: '2026-04-22T11:00:00Z', calendarId: 'cal-hidden' },
  ])

  const req = new Request('http://x/api/calendar/list', { method: 'POST', headers: { Authorization: 'Bearer t' } })
  const res = await POST(req)
  const body = await res.json()
  expect(body.events.map((e: any) => e.id)).toEqual(['e1'])
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/calendar-list.test.ts`
Expected: FAIL — the hidden event appears.

- [ ] **Step 3: Implement filter**

In `src/app/api/calendar/list/route.ts`:

- When building the mapping lookup, also build a `Set<string>` of hidden calendar IDs: `hiddenCalendars = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))`.
- After fetching + tagging events, before dedupe, filter: `events.filter(e => !hiddenCalendars.has(e.calendarId))`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/calendar-list.test.ts`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/calendar/list/route.ts tests/api/calendar-list.test.ts
git commit -m "feat(calendar): filter events from hidden calendars"
```

---

### Task 4: Visibility checkbox in Settings → Calendars

**Files:**
- Modify: `src/components/settings/calendars-section.tsx`

- [ ] **Step 1: Add visibility state + handler**

In `CalendarsSection`:

- Extend the local `Calendar` type to include `visible: boolean`.
- In the row render, before the profile dropdown, render a checkbox: `<input type="checkbox" checked={c.visible} onChange={...} />` with a subtle label "Show".
- On change, PUT the full mapping (including existing `profileId`) with the new `visible`. Optimistically update local state.

Minimal code sketch:

```tsx
const toggleVisible = async (c: Calendar) => {
  const next = !c.visible
  setCalendars(prev => prev.map(x => x.calendarId === c.calendarId ? { ...x, visible: next } : x))
  const token = await getIdToken()
  if (!token) return
  await fetch('/api/calendars', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      calendarId: c.calendarId,
      accountId: c.accountId,
      calendarName: c.calendarName,
      profileId: c.profileId,
      visible: next,
    }),
  })
}
```

- [ ] **Step 2: Run tsc + lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/calendars-section.tsx`
Expected: clean.

- [ ] **Step 3: Manual smoke**

1. `npm run dev`
2. Go to `/settings`, toggle a calendar's "Show" checkbox off.
3. Hard-refresh `/calendar` — events from that calendar disappear.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/calendars-section.tsx
git commit -m "feat(settings): add visibility toggle to calendars section"
```

---

### Task 5: Pass ISO start/end through to the store

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Extend CalendarEvent type**

Add to the type:

```typescript
export type CalendarEvent = {
  id: string
  title: string
  time: string
  date: number
  start?: string              // ISO (new; used by Schedule-X)
  end?: string                // ISO (new; used by Schedule-X)
  location?: string
  notes?: string
  fromEmail?: boolean
  aiTravelBuffer?: string | null
  aiPrepSuggestion?: string | null
  profileId?: string | null
  calendarId?: string
  calendarName?: string
  accountId?: string
}
```

- [ ] **Step 2: Carry `start`/`end`/`calendarId`/`calendarName`/`accountId` through in `hydrateCalendar`**

In the `data.events.map(...)` block, in addition to the existing derived `time`/`date`, add:

```typescript
return {
  id: e.id,
  title: e.title,
  time,
  date: startDate.getDate(),
  start: e.start,               // ISO pass-through
  end: e.end,                   // ISO pass-through
  location: e.location,
  fromEmail: false,
  profileId: e.profileId ?? null,
  calendarId: e.calendarId,
  calendarName: e.calendarName,
  accountId: e.accountId,
}
```

Update the type of the map parameter to include the new fields:

```typescript
(e: {
  id: string
  title: string
  start: string
  end?: string
  location?: string
  profileId?: string | null
  calendarId?: string
  calendarName?: string
  accountId?: string
})
```

- [ ] **Step 3: Verify no regressions**

Run: `npx tsc --noEmit && npx jest`
Expected: clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(store): pass ISO start/end and source fields through calendar events"
```

---

### Task 6: Build the Schedule-X calendar app wrapper

**Files:**
- Create: `src/components/calendar/calendar-app.tsx`

Before coding, read https://schedule-x.dev/docs/frameworks/react to confirm: (a) the `createCalendar` function signature, (b) the view imports (`createViewDay`, `createViewWeek`, `createViewMonthGrid`, possibly `createViewMonthAgenda`), (c) event format (Schedule-X v2 expects `start`/`end` as `'YYYY-MM-DD HH:mm'` strings, NOT ISO), (d) how to pass `calendars` config for per-calendar colors.

- [ ] **Step 1: Write the component shell**

```tsx
// src/components/calendar/calendar-app.tsx
"use client"

import { useEffect, useMemo } from 'react'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar'
import '@schedule-x/theme-default/dist/index.css'
import type { CalendarEvent } from '@/lib/store'

function toScheduleXDateTime(iso: string | undefined): string {
  // Schedule-X v2 expects 'YYYY-MM-DD HH:mm' (local) for timed events,
  // or 'YYYY-MM-DD' for all-day events.
  if (!iso) return ''
  if (!iso.includes('T')) return iso // already date-only (all-day)
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export interface CalendarAppProps {
  events: CalendarEvent[]
  onEventClick?: (id: string) => void
}

export function CalendarApp({ events, onEventClick }: CalendarAppProps) {
  const sxEvents = useMemo(() =>
    events
      .filter(e => e.start)
      .map(e => ({
        id: e.id,
        title: e.title,
        start: toScheduleXDateTime(e.start),
        end: toScheduleXDateTime(e.end ?? e.start),
        calendarId: e.calendarId ?? 'default',
      })),
  [events])

  const calendarApp = useCalendarApp({
    views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
    events: sxEvents,
    defaultView: 'week',
    callbacks: onEventClick ? { onEventClick: (e: { id: string }) => onEventClick(e.id) } : undefined,
  })

  // Sync events on prop change
  useEffect(() => {
    calendarApp.events.set(sxEvents)
  }, [sxEvents, calendarApp])

  return <ScheduleXCalendar calendarApp={calendarApp} />
}
```

**If the Schedule-X docs show a different API** (e.g., different import paths, different callback signatures, different event-update pattern), follow the docs. The shape above is a template.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean (may surface type issues in Schedule-X types — if so, narrow with `as` or a local interface).

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/calendar-app.tsx
git commit -m "feat(calendar): add Schedule-X calendar app wrapper"
```

---

### Task 7: Theme Schedule-X to sorbet

**Files:**
- Create: `src/styles/schedule-x-theme.css`
- Modify: `src/app/globals.css` (or wherever Tailwind entry lives)

- [ ] **Step 1: Identify the globals entry file**

Run: `rg "tailwindcss" src/app --files-with-matches` and `ls src/app/globals.css`
Expected: `src/app/globals.css` exists.

- [ ] **Step 2: Create theme override**

```css
/* src/styles/schedule-x-theme.css */
/* Override Schedule-X CSS variables to match the sorbet modern palette. */
/* Variable names must match the current Schedule-X version — confirm at https://schedule-x.dev/docs/calendar/theming */

.sx-react-calendar-wrapper,
.sx-react-calendar-wrapper.is-dark {
  --sx-color-primary: var(--foreground);
  --sx-color-on-primary: var(--background);
  --sx-color-surface: var(--background);
  --sx-color-on-surface: var(--foreground);
  --sx-color-outline: var(--border);
  --sx-color-surface-variant: var(--card);
  --sx-font-family: inherit;
  --sx-internal-color-border: var(--border);
  border: none;
}

.sx-react-calendar-wrapper * {
  font-feature-settings: normal;
  letter-spacing: -0.01em;
}
```

**Verify variable names against the live Schedule-X theming docs.** If the current version uses different names (e.g., `--sx-background-color` instead of `--sx-color-surface`), adapt.

- [ ] **Step 3: Import the CSS**

In `src/app/globals.css`, add at the top:

```css
@import '../styles/schedule-x-theme.css';
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/schedule-x-theme.css src/app/globals.css
git commit -m "feat(calendar): theme Schedule-X to sorbet palette"
```

---

### Task 8: Build the filter sidebar

**Files:**
- Create: `src/components/calendar/filter-sidebar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/calendar/filter-sidebar.tsx
"use client"

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-provider'
import { useHub } from '@/lib/store'

interface CalendarEntry {
  calendarId: string
  calendarName: string
  accountEmail: string
  visible: boolean
  profileId: string | null
}

export interface FilterSidebarProps {
  activeProfiles: Set<string>             // profile IDs currently active (empty = show all)
  onToggleProfile: (id: string) => void
  onToggleCalendar: (calendarId: string, next: boolean) => void
  calendars: CalendarEntry[]
}

export function FilterSidebar({ activeProfiles, onToggleProfile, onToggleCalendar, calendars }: FilterSidebarProps) {
  const { profiles } = useHub()

  return (
    <aside className="w-60 shrink-0 border-r border-border pr-6 flex flex-col gap-8">
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">People</h3>
        <ul className="flex flex-col gap-2">
          {profiles.map(p => {
            const active = activeProfiles.size === 0 || activeProfiles.has(p.id)
            return (
              <li key={p.id}>
                <button
                  onClick={() => onToggleProfile(p.id)}
                  className={`w-full text-left text-sm py-1 px-2 border-l-2 ${active ? 'border-foreground text-foreground' : 'border-transparent text-foreground/40'}`}
                >
                  {p.name}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">Calendars</h3>
        <ul className="flex flex-col gap-2">
          {calendars.map(c => (
            <li key={c.calendarId} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={c.visible}
                onChange={(e) => onToggleCalendar(c.calendarId, e.target.checked)}
                className="mt-1"
              />
              <div className="text-sm leading-tight">
                <div className={c.visible ? 'text-foreground' : 'text-foreground/40'}>{c.calendarName}</div>
                <div className="text-[10px] font-mono text-foreground/30">{c.accountEmail}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/filter-sidebar.tsx
git commit -m "feat(calendar): add filter sidebar for profiles and calendars"
```

---

### Task 9: Event detail drawer with AI prep notes

**Files:**
- Create: `src/components/calendar/event-detail-drawer.tsx`

- [ ] **Step 1: Implement**

The drawer is a slide-in right panel. It appears when `eventId != null`. It fetches AI prep notes via the existing `/api/calendar/event-notes` route and caches in the store (via `setEventNotes`).

```tsx
// src/components/calendar/event-detail-drawer.tsx
"use client"

import { useEffect, useState } from 'react'
import { useHub } from '@/lib/store'
import { useAuth } from '@/lib/auth-provider'

export interface EventDetailDrawerProps {
  eventId: string | null
  onClose: () => void
}

export function EventDetailDrawer({ eventId, onClose }: EventDetailDrawerProps) {
  const { events, profiles, setEventNotes } = useHub()
  const { getIdToken } = useAuth()
  const [loading, setLoading] = useState(false)

  const event = eventId ? events.find(e => e.id === eventId) ?? null : null

  useEffect(() => {
    if (!event || event.notes !== undefined) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const token = await getIdToken()
      if (!token) { setLoading(false); return }
      const res = await fetch('/api/calendar/event-notes', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: { title: event.title, date: event.date, time: event.time, location: event.location },
          profiles,
          nearbyEvents: events
            .filter(e => e.id !== event.id && e.date === event.date)
            .map(e => ({ title: e.title, date: e.date, time: e.time })),
        }),
      })
      const data = await res.json()
      if (cancelled) return
      setEventNotes(event.id, data.notes ?? '')
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [event, events, profiles, getIdToken, setEventNotes])

  if (!event) return null

  return (
    <aside className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border p-8 overflow-y-auto z-50">
      <button
        onClick={onClose}
        className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-foreground mb-6"
      >Close</button>
      <h2 className="font-heading text-3xl font-light tracking-tighter mb-2">{event.title}</h2>
      <div className="text-xs font-mono text-foreground/40 mb-6">
        {event.time}{event.location ? ` · ${event.location}` : ''}
      </div>
      <section className="mb-6">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">AI Prep</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : event.notes ? (
          <pre className="text-sm font-serif whitespace-pre-wrap leading-relaxed">{event.notes}</pre>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">No notes.</p>
        )}
      </section>
    </aside>
  )
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/event-detail-drawer.tsx
git commit -m "feat(calendar): add event detail drawer with AI prep notes"
```

---

### Task 10: Replace /calendar/page.tsx

**Files:**
- Modify: `src/app/calendar/page.tsx`

This is the full swap. The old week grid goes away. The new page renders: filter sidebar on the left, Schedule-X in the middle, event detail drawer on the right when an event is selected.

- [ ] **Step 1: Rewrite the page**

```tsx
// src/app/calendar/page.tsx
"use client"

import { useEffect, useMemo, useState } from 'react'
import { useHub } from '@/lib/store'
import { useAuth } from '@/lib/auth-provider'
import { CalendarApp } from '@/components/calendar/calendar-app'
import { FilterSidebar } from '@/components/calendar/filter-sidebar'
import { EventDetailDrawer } from '@/components/calendar/event-detail-drawer'

interface CalendarEntry {
  calendarId: string
  calendarName: string
  accountEmail: string
  accountId: string
  visible: boolean
  profileId: string | null
}

export default function CalendarPage() {
  const { events } = useHub()
  const { getIdToken } = useAuth()

  const [calendars, setCalendars] = useState<CalendarEntry[]>([])
  const [activeProfiles, setActiveProfiles] = useState<Set<string>>(new Set())
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  // Load calendars for the sidebar
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const token = await getIdToken()
      if (!token) return
      const res = await fetch('/api/calendars', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json()
      if (cancelled) return
      setCalendars((data.calendars || []).map((c: CalendarEntry) => ({
        calendarId: c.calendarId,
        calendarName: c.calendarName,
        accountEmail: c.accountEmail,
        accountId: c.accountId,
        visible: c.visible ?? true,
        profileId: c.profileId ?? null,
      })))
    }
    load()
    return () => { cancelled = true }
  }, [getIdToken])

  const hiddenCalendarIds = useMemo(
    () => new Set(calendars.filter(c => !c.visible).map(c => c.calendarId)),
    [calendars],
  )

  const visibleEvents = useMemo(() => events.filter(e => {
    if (e.calendarId && hiddenCalendarIds.has(e.calendarId)) return false
    if (activeProfiles.size > 0) {
      if (!e.profileId || !activeProfiles.has(e.profileId)) return false
    }
    return true
  }), [events, hiddenCalendarIds, activeProfiles])

  const toggleProfile = (id: string) => {
    setActiveProfiles(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCalendar = async (calendarId: string, nextVisible: boolean) => {
    const c = calendars.find(x => x.calendarId === calendarId)
    if (!c) return
    setCalendars(prev => prev.map(x => x.calendarId === calendarId ? { ...x, visible: nextVisible } : x))
    const token = await getIdToken()
    if (!token) return
    await fetch('/api/calendars', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendarId: c.calendarId,
        accountId: c.accountId,
        calendarName: c.calendarName,
        profileId: c.profileId,
        visible: nextVisible,
      }),
    })
  }

  return (
    <main className="flex-1 w-full bg-white text-foreground flex p-8 lg:p-12 h-[calc(100vh-6rem)]">
      <FilterSidebar
        activeProfiles={activeProfiles}
        onToggleProfile={toggleProfile}
        onToggleCalendar={toggleCalendar}
        calendars={calendars}
      />
      <div className="flex-1 min-w-0 ml-8">
        <CalendarApp events={visibleEvents} onEventClick={setSelectedEventId} />
      </div>
      <EventDetailDrawer eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </main>
  )
}
```

- [ ] **Step 2: Remove dead imports from the old page if any remain**

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke**

1. `npm run dev`
2. Go to `/calendar`. Confirm: sidebar shows profiles + calendars, Schedule-X renders week view, switching to day/month works.
3. Click an event → drawer slides in with AI prep notes (or "Generating…").
4. Toggle a calendar off in the sidebar → its events disappear and the setting persists on reload.
5. Click a profile → only events assigned to that profile remain.

- [ ] **Step 5: Commit**

```bash
git add src/app/calendar/page.tsx
git commit -m "feat(calendar): replace custom grid with Schedule-X + filters + drawer"
```

---

### Task 11: Fix home-page AI content regression

The home page shows AI content (schedule insights, event prep) that was previously populated by the now-removed `/api/calendar/digest` route. Confirm the gap and fill it.

**Files:**
- Investigate: `src/app/page.tsx`, `src/components/widgets/*`, `src/lib/store.tsx`
- Likely modify: one or more widgets + one server route

- [ ] **Step 1: Diagnose**

Run: `rg "scheduleInsights|aiPrepSuggestion|aiTravelBuffer" src`
Expected: results showing which components consume which fields.

Then:
- Check which widget on `/` depends on `scheduleInsights`. The previous implementation populated it in `hydrateCalendar` from `/api/calendar/digest`. Today `hydrateCalendar` leaves it empty (`scheduleInsights: []`).
- Check the same for `aiPrepSuggestion` / `aiTravelBuffer` — the old `/api/calendar/digest` may have populated these per-event.

- [ ] **Step 2: Decide the fix**

Two options — pick whichever is cleaner after diagnosis:

- **Option A:** Restore a thin AI-enrichment step in `hydrateCalendar` that calls a new `/api/calendar/insights` route which runs the same prompt the old `/api/calendar/digest` used to produce `scheduleInsights` and per-event AI fields.
- **Option B:** Delete the widgets that depend on fields we no longer populate, if they're stale Phase 0 code that the redesign obsoletes.

If the home widgets are actively part of the product (they are: Hub dashboard), pick **Option A**.

- [ ] **Step 3: Implement the chosen option**

For Option A, create `src/app/api/calendar/insights/route.ts` that:
1. Authenticates via Firebase ID token.
2. Takes events from request body (avoids refetching).
3. Runs the same LLM prompt shape as the old digest.
4. Returns `{ insights: string[], enriched: { [eventId]: { aiPrepSuggestion, aiTravelBuffer } } }`.

Then in `store.tsx` `hydrateCalendar`, after setting events, POST to the new route and call `setEvents(prev => prev.map(...merge enriched...))` and `setScheduleInsights(res.insights)`.

Write tests mirroring the structure of `tests/api/inbox-digest.test.ts` (mock `ai`/`@ai-sdk/openai`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: clean.

Manually verify the home page now shows the AI content.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(calendar): restore AI schedule insights for home widgets"
```

If Option B was chosen instead, the commit message would be `chore(home): remove widgets depending on deprecated AI fields`.

---

### Task 12: Full verification + manual smoke

- [ ] **Step 1: Run the full suite**

Run: `npx jest`
Expected: all tests passing (previous 42 + Task 1's +3 + Task 2's +2 + Task 3's +1 + any Task 11 additions).

Run: `npx tsc --noEmit`
Expected: clean.

Run: `npx eslint jest.config.mjs src/lib/server/ src/app/api/ src/components/ tests/`
Expected: zero errors.

- [ ] **Step 2: End-to-end smoke checklist**

- [ ] Day / Week / Month view switcher works in `/calendar`
- [ ] Sidebar shows every linked calendar grouped by account
- [ ] Calendar visibility toggle hides events immediately and persists on reload
- [ ] Profile filter narrows to events tagged with the selected profile
- [ ] Clicking an event opens the right-side drawer with AI prep notes
- [ ] Notes are cached (re-clicking the same event does not regenerate)
- [ ] Home page widgets show AI schedule insights (Task 11 fix)
- [ ] Theme matches sorbet — no Schedule-X default colors leaking through
- [ ] No Firestore permission errors
- [ ] No duplicate event warnings in console

- [ ] **Step 3: Final commit if any small fixes emerged**

```bash
git add -A
git status  # confirm intended diff only
git commit -m "chore: calendar redesign polish"
```

---

## Post-Plan Verification

Before declaring the calendar redesign done:

1. All 12 tasks committed.
2. `npx jest` — green.
3. `npx tsc --noEmit` — zero errors.
4. `npx eslint` — zero errors on touched files.
5. Manual smoke checklist from Task 12 — every box checked.

## What's Next

After this ships:
- **Phase 4:** Google write flow (edit/create/delete events and tasks with idempotency). Without this, Schedule-X edits are display-only.
- **Phase 2:** AI extraction redesign (the 6 classifications / 3 action types work referenced in the Phase 1 plan's "What's Next").
- **Phase 3:** `/inbox` three-pane redesign.
