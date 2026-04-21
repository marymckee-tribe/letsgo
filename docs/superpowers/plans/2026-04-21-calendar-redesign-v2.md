# Calendar Redesign v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hand-rolled `/calendar` weekly grid with a Schedule-X-powered page that supports day/week/month views, per-calendar visibility toggles, profile filtering in a side panel, a sorbet-themed look, and an event detail drawer with AI prep notes — all built on the new tRPC + TanStack Query baseline.

**Architecture:** Schedule-X renders inside a `use client` boundary that consumes `trpc.calendar.list.useQuery()`. Per-calendar visibility lives on the `CalendarMapping` Firestore doc (`visible: boolean`, default `true`) and is set via `trpc.calendars.setVisibility.useMutation()`. The `calendar.list` procedure filters hidden-calendar events server-side. Profile filtering is client-side over already-fetched events. AI prep notes are generated on demand by a new `trpc.calendar.getPrepNotes` procedure that ports the prompt/schema from the deleted `/api/calendar/digest` route. Timezone-safe display uses `date-fns-tz` instead of the buggy `toLocaleTimeString` pattern.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, TanStack Query v5, `@schedule-x/react`, `@schedule-x/calendar`, `@schedule-x/events-service`, `@schedule-x/theme-default`, `date-fns-tz`, Firestore + Admin SDK, Jest + ts-jest, Zod v4.

**Spec reference:** Phase 1.5 — a calendar polish pass between the tRPC architecture migration (just landed) and Phase 4 (Google write flow, not yet planned).

---

## Why this plan exists — differences from the cancelled v1

A previous version of this plan (`docs/superpowers/plans/2026-04-21-calendar-redesign.md`) was cancelled mid-execution when the project pivoted to migrate the server layer to tRPC + TanStack Query first. That v1 plan is preserved in git for reference. The scope, design ambition, and feature list are **identical to v1**. What changed:

| Concern | v1 (cancelled) | v2 (this plan) |
|---|---|---|
| Visibility write path | `PUT /api/calendars` accepts `visible` in body | `trpc.calendars.setVisibility.useMutation({ calendarId, visible })` |
| Event fetch path | `POST /api/calendar/list` | `trpc.calendar.list.useQuery()` (filters hidden calendars server-side) |
| AI prep notes | Old `/api/calendar/event-notes` route | New `trpc.calendar.getPrepNotes.useQuery({ eventId })` procedure — re-uses the `generateObject` prompt + schema from the deleted `/api/calendar/digest/route.ts` (recover from `git show HEAD~5:src/app/api/calendar/digest/route.ts`) |
| Cache invalidation after visibility toggle | Manual component refetch | `trpc.useUtils().calendar.list.invalidate()` + `utils.calendars.list.invalidate()` |
| Schedule-X mount | Client component (unchanged) | Client component inside explicit `"use client"` boundary per Next.js 16 conventions |
| Settings UI | "Show" checkbox via manual fetch | "Show" checkbox wired through the tRPC mutation + utils invalidation |
| Timezone handling | `toLocaleTimeString` (bug farm — wrong in DST, wrong across zones) | `date-fns-tz` `formatInTimeZone` / `toZonedTime` |
| Home-page AI content regression fix | Option A: new `/api/calendar/insights` Route Handler | New `trpc.calendar.insights.useQuery()` procedure (same prompt shape) |
| Store integration | `useEffect + fetch` | Already-migrated `trpc.*.useQuery()` hooks in `src/lib/store.tsx` |

Everything else (Schedule-X view set, filter sidebar, event detail drawer, sorbet theming, scope boundaries) carries over from v1 verbatim.

---

## Before You Start — Read These

Schedule-X, tRPC, and Next.js 16 are all actively evolving — version-specific API drift is likely.

- Read the current Schedule-X React docs (use Context7: resolve `schedule-x` → `query-docs` for the React framework integration page). Confirm: `createCalendar` signature, view module names (`createViewDay`, `createViewWeek`, `createViewMonthGrid`), event format for Schedule-X v4 (v4 expects `start`/`end` as `'YYYY-MM-DD HH:mm'` strings for timed events, `'YYYY-MM-DD'` for all-day), `calendars` config for per-calendar colors, and theme variable names.
- Read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.
- Skim the in-repo plan `docs/superpowers/plans/2026-04-21-architecture-trpc-react-query.md` — you should already be familiar with the tRPC patterns in use (protectedProcedure, context, `createCaller` testing, `trpc.useUtils()` invalidation).

`AGENTS.md` reminder: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."*

If the live docs conflict with code samples below, **follow the docs and update the plan in-flight**.

---

## File Structure

### New files
- `src/components/calendar/calendar-app.tsx` — Schedule-X calendar wrapper (client component)
- `src/components/calendar/filter-sidebar.tsx` — Vertical sidebar: profile filter + calendar visibility checkboxes
- `src/components/calendar/event-detail-drawer.tsx` — Right-side drawer shown on event click; displays AI prep notes via `trpc.calendar.getPrepNotes.useQuery`
- `src/lib/datetime.ts` — thin wrappers around `date-fns-tz` (`formatInZone`, `toScheduleXDateTime`, `userTimeZone`)
- `src/styles/schedule-x-theme.css` — CSS variable overrides theming Schedule-X to the sorbet palette
- `tests/server/calendar-mappings.visibility.test.ts` — round-trip for the `visible` field (default `true`, explicit `false`, back-compat read)
- `tests/server/trpc/routers/calendar.visibility.test.ts` — `calendar.list` filters events from hidden calendars
- `tests/server/trpc/routers/calendars.setVisibility.test.ts` — `calendars.setVisibility` mutation persists the flag
- `tests/server/trpc/routers/calendar.getPrepNotes.test.ts` — AI prep-notes procedure (mocked `generateObject`)
- `tests/server/trpc/routers/calendar.insights.test.ts` — home-page insights procedure (mocked `generateObject`)
- `tests/lib/datetime.test.ts` — `toScheduleXDateTime` correctness across zones

### Modified files
- `src/lib/server/calendar-mappings.ts` — add `visible?: boolean` to `CalendarMapping`; persist with default `true`; coerce on read
- `src/server/trpc/routers/calendars.ts` — existing `list` now emits `visible`; add `setVisibility({ calendarId, visible })` mutation
- `src/server/trpc/routers/calendar.ts` — existing `list` filters events whose `calendarId` is in the hidden set; add `getPrepNotes({ eventId })` and `insights({ eventIds? })` procedures
- `src/components/settings/calendars-section.tsx` — add "Show" checkbox column wired to `trpc.calendars.setVisibility.useMutation`
- `src/app/calendar/page.tsx` — replace the custom week grid with `<FilterSidebar />` + `<CalendarApp />` + `<EventDetailDrawer />`
- `src/lib/store.tsx` — extend the `CalendarEvent` projection to carry `start: string` / `end: string` / `calendarId` / `calendarName` / `accountId` verbatim from `trpc.calendar.list`; wire `trpc.calendar.insights.useQuery()` into the home-widget enrichment slot
- `src/app/globals.css` — `@import` the new `schedule-x-theme.css`
- `package.json` — add `date-fns`, `date-fns-tz`

### Out of scope
- Editing events in-place (create/update/delete) — Phase 4 Google write flow
- Creating events from the calendar UI — Phase 4 (the only write path today is inbox → action commit)
- Recurrence editing — Phase 4
- Year view — product decision: skip
- Bulk calendar actions (assign all by domain pattern) — future

---

## Prerequisites

These must hold before starting:

- [ ] **P1.** The tRPC architecture migration (`docs/superpowers/plans/2026-04-21-architecture-trpc-react-query.md`) has merged to `main`. Confirm by running `ls src/server/trpc/routers/calendar.ts src/server/trpc/routers/calendars.ts` — both files must exist.
- [ ] **P2.** `npx tsc --noEmit && npx jest && npm run lint` — all green on `main` tip.
- [ ] **P3.** `.env.local` contains `OPENAI_API_KEY` (the AI prep-notes procedure needs it; confirm it is already present from Phase 1).
- [ ] **P4.** At least two Google accounts linked and at least one non-primary calendar visible in `/settings → Calendars` (so the implementer can verify the visibility filter end-to-end).
- [ ] **P5.** Create the working branch: `git checkout -b feature/calendar-redesign-v2`.

---

## Tasks

### Task 0: Install `date-fns` + `date-fns-tz`; verify Schedule-X packages

Schedule-X packages are already installed from the cancelled v1 run (check `package.json` — `@schedule-x/calendar@^4.5.0`, `@schedule-x/events-service@^4.5.0`, `@schedule-x/react@^4.1.0`, `@schedule-x/theme-default@^4.5.0` are present). The only new deps are timezone utilities.

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Confirm Schedule-X is already installed**

Run: `node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies).filter(k=>k.startsWith('@schedule-x')))"`
Expected output: `[ '@schedule-x/calendar', '@schedule-x/events-service', '@schedule-x/react', '@schedule-x/theme-default' ]`

If any are missing, run `npm install @schedule-x/react@^4 @schedule-x/calendar@^4 @schedule-x/events-service@^4 @schedule-x/theme-default@^4` before proceeding.

- [ ] **Step 2: Install timezone utilities**

Run: `npm install date-fns@^4 date-fns-tz@^3`
Expected: both added to `dependencies`. Confirm with `node -e "console.log(require('./package.json').dependencies['date-fns-tz'])"`.

- [ ] **Step 3: Verify suite still green**

Run: `npx tsc --noEmit && npx jest`
Expected: zero type errors; same test count as before this plan started (baseline from the tRPC migration).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add date-fns + date-fns-tz for calendar redesign v2"
```

---

### Task 1: `src/lib/datetime.ts` — timezone-safe helpers

The existing repo uses `toLocaleTimeString` in several places. That returns the *browser's* locale formatting with no explicit zone anchor, which (a) breaks tests running under UTC and (b) silently produces the wrong string during DST transitions. Centralize the two things the calendar actually needs: formatting for display, and formatting into Schedule-X's wire format.

**Files:**
- Create: `src/lib/datetime.ts`
- Create: `tests/lib/datetime.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/datetime.test.ts`:

```ts
import { toScheduleXDateTime, formatInZone, userTimeZone } from '@/lib/datetime'

describe('datetime', () => {
  describe('toScheduleXDateTime', () => {
    it('formats an ISO timestamp into Schedule-X v4 "YYYY-MM-DD HH:mm" in the target zone', () => {
      const iso = '2026-04-23T15:00:00.000Z' // 15:00 UTC
      expect(toScheduleXDateTime(iso, 'America/Los_Angeles')).toBe('2026-04-23 08:00')
      expect(toScheduleXDateTime(iso, 'America/New_York')).toBe('2026-04-23 11:00')
      expect(toScheduleXDateTime(iso, 'UTC')).toBe('2026-04-23 15:00')
    })

    it('returns a date-only string unchanged (all-day events)', () => {
      expect(toScheduleXDateTime('2026-04-23', 'America/Los_Angeles')).toBe('2026-04-23')
    })

    it('returns empty string for undefined/empty input', () => {
      expect(toScheduleXDateTime(undefined, 'UTC')).toBe('')
      expect(toScheduleXDateTime('', 'UTC')).toBe('')
    })
  })

  describe('formatInZone', () => {
    it('formats a 12-hour clock time in the target zone', () => {
      expect(formatInZone('2026-04-23T15:00:00.000Z', 'America/Los_Angeles', 'h:mm a')).toBe('8:00 AM')
      expect(formatInZone('2026-04-23T15:00:00.000Z', 'America/New_York', 'h:mm a')).toBe('11:00 AM')
    })
  })

  describe('userTimeZone', () => {
    it('returns a valid IANA zone string', () => {
      const zone = userTimeZone()
      expect(zone).toMatch(/^[A-Za-z_]+\/[A-Za-z_]+/)
    })
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/lib/datetime.test.ts`
Expected: FAIL — `Cannot find module '@/lib/datetime'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/datetime.ts`:

```ts
import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import { format } from 'date-fns'

/**
 * Returns the browser's IANA time-zone string (falls back to UTC on the server).
 * Use this as the default zone for user-visible formatting.
 */
export function userTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Schedule-X v4 expects timed events as "YYYY-MM-DD HH:mm" **local** to the viewer.
 * All-day events are passed through unchanged ("YYYY-MM-DD").
 * See https://schedule-x.dev/docs/calendar/events
 */
export function toScheduleXDateTime(iso: string | undefined, zone: string): string {
  if (!iso) return ''
  if (!iso.includes('T')) return iso // date-only → all-day
  return formatInTimeZone(new Date(iso), zone, 'yyyy-MM-dd HH:mm')
}

/**
 * Format an ISO timestamp in the target zone using a date-fns format string.
 * Use 12-hour clock strings (e.g. "h:mm a") per the user's UI preferences.
 */
export function formatInZone(iso: string, zone: string, fmt: string): string {
  return formatInTimeZone(new Date(iso), zone, fmt)
}

/**
 * Convert an ISO timestamp into a Date representing the same wall-clock
 * time as viewed in `zone`. Useful for day-bucketing events by the viewer's calendar day.
 */
export function zonedDate(iso: string, zone: string): Date {
  return toZonedTime(new Date(iso), zone)
}

/**
 * Passthrough re-export so callers don't import date-fns directly.
 */
export { format }
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/lib/datetime.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/datetime.ts tests/lib/datetime.test.ts
git commit -m "feat(lib): timezone-safe datetime helpers using date-fns-tz"
```

---

### Task 2: Extend `CalendarMapping` with `visible` flag

**Files:**
- Modify: `src/lib/server/calendar-mappings.ts`
- Create: `tests/server/calendar-mappings.visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/calendar-mappings.visibility.test.ts`:

```ts
import { setCalendarMapping, listCalendarMappings, type CalendarMapping } from '@/lib/server/calendar-mappings'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('calendar-mappings visibility', () => {
  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDoc: jest.Mock = jest.fn(() => ({ set: mockSet, get: mockGet }))
  const mockCollection: jest.Mock = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({
      collection: () => ({ doc: () => ({ collection: mockCollection }) }),
    })
  })

  it('persists visible=true by default when omitted on set', async () => {
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

  it('persists visible=false when provided explicitly', async () => {
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
        {
          id: 'c1',
          data: () => ({
            calendarId: 'c1',
            accountId: 'a1',
            calendarName: 'Work',
            profileId: null,
            updatedAt: 1,
          }),
        },
      ],
    })
    const out = await listCalendarMappings('uid')
    expect(out[0].visible).toBe(true)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/calendar-mappings.visibility.test.ts`
Expected: FAIL — `visible` is `undefined` on the written payload.

- [ ] **Step 3: Extend the module**

In `src/lib/server/calendar-mappings.ts`:

1. Add `visible?: boolean` to the `CalendarMapping` interface (optional; semantic default `true`).
2. In `setCalendarMapping`, write `visible: input.visible ?? true` into the Firestore payload.
3. In `listCalendarMappings`, coerce on read: `visible: data.visible ?? true`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/calendar-mappings.visibility.test.ts`
Expected: PASS (3 tests).

Run: `npx jest`
Expected: full suite green (baseline + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/calendar-mappings.ts tests/server/calendar-mappings.visibility.test.ts
git commit -m "feat(calendar): add visible flag to CalendarMapping schema"
```

---

### Task 3: `calendars.setVisibility` mutation + `calendars.list` emits `visible`

**Files:**
- Modify: `src/server/trpc/routers/calendars.ts`
- Create: `tests/server/trpc/routers/calendars.setVisibility.test.ts`

- [ ] **Step 1: Write the failing router test**

Create `tests/server/trpc/routers/calendars.setVisibility.test.ts`:

```ts
import { calendarsRouter } from '@/server/trpc/routers/calendars'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-mappings')

describe('calendars router — visibility', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(setCalendarMapping as jest.Mock).mockResolvedValue(undefined)
  })

  it('list emits visible=true for calendars with no mapping', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }] }),
    }) as unknown as typeof fetch
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    const { calendars } = await caller.list()
    expect(calendars[0].visible).toBe(true)
  })

  it('list emits visible=false when the mapping says so', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal1', accountId: 'a1', calendarName: 'Mary', profileId: null, visible: false, updatedAt: 1 },
    ])
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }] }),
    }) as unknown as typeof fetch
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    const { calendars } = await caller.list()
    expect(calendars[0].visible).toBe(false)
  })

  it('setVisibility persists visible=false and preserves existing profileId', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal1', accountId: 'a1', calendarName: 'Mary', profileId: 'mary', visible: true, updatedAt: 1 },
    ])
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    await caller.setVisibility({ calendarId: 'cal1', visible: false })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', expect.objectContaining({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'mary',
      visible: false,
    }))
  })

  it('setVisibility throws NOT_FOUND when the mapping does not exist', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.setVisibility({ calendarId: 'does-not-exist', visible: false }))
      .rejects.toThrow(TRPCError)
  })

  it('setVisibility rejects unauthenticated callers', async () => {
    const caller = calendarsRouter.createCaller({})
    await expect(caller.setVisibility({ calendarId: 'cal1', visible: false }))
      .rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendars.setVisibility.test.ts`
Expected: FAIL — `setVisibility` is not a member of the router.

- [ ] **Step 3: Extend the router**

Edit `src/server/trpc/routers/calendars.ts`:

1. In the existing `list` procedure, extend the mapping lookup to carry `visible` through. Change the `mappingMap` from `Map<string, string | null>` (profileId only) to `Map<string, { profileId: string | null; visible: boolean }>`. Emit `visible: mappingMap.get(c.id)?.visible ?? true` in the `CalendarListItem`.

2. Add `visible: boolean` to the `CalendarListItem` interface.

3. Add the `setVisibility` mutation:

```ts
import { TRPCError } from '@trpc/server'

// ... inside the router object:
setVisibility: protectedProcedure
  .input(z.object({
    calendarId: z.string().min(1),
    visible: z.boolean(),
  }))
  .mutation(async ({ ctx, input }) => {
    const mappings = await listCalendarMappings(ctx.uid)
    const existing = mappings.find(m => m.calendarId === input.calendarId)
    if (!existing) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: `No mapping found for calendar ${input.calendarId}. Call calendars.list first to seed a mapping row.`,
      })
    }
    await setCalendarMapping(ctx.uid, {
      calendarId: existing.calendarId,
      accountId: existing.accountId,
      calendarName: existing.calendarName,
      profileId: existing.profileId,
      visible: input.visible,
    })
    return { ok: true }
  }),
```

4. **Important:** `calendars.list` must also *seed* a minimal mapping row the first time it sees a calendar (so `setVisibility` has something to update). In the list procedure, after building the per-account calendar list, for each calendar not yet in `mappingMap` call `setCalendarMapping(ctx.uid, { calendarId, accountId, calendarName, profileId: null, visible: true })`. This is a one-time idempotent seed; subsequent `list` calls find the mapping already present.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/trpc/routers/calendars.setVisibility.test.ts`
Expected: PASS (5 tests).

Run: `npx jest tests/server/trpc/routers/calendars.test.ts`
Expected: PASS — if the existing "list without mapping" test now fails because the seed side effect changes the `setCalendarMapping` call count, update that test to assert the seed happens (do not suppress the seed).

Run: `npx jest`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/calendars.ts tests/server/trpc/routers/calendars.setVisibility.test.ts tests/server/trpc/routers/calendars.test.ts
git commit -m "feat(trpc): calendars.setVisibility + calendars.list emits visible flag"
```

---

### Task 4: `calendar.list` filters events from hidden calendars

**Files:**
- Modify: `src/server/trpc/routers/calendar.ts`
- Create: `tests/server/trpc/routers/calendar.visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/trpc/routers/calendar.visibility.test.ts`:

```ts
import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')

describe('calendar.list — visibility filter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
  })

  it('drops events whose calendar has visible=false in the mapping', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([
      { calendarId: 'cal-hidden', accountId: 'a1', calendarName: 'Hidden', profileId: null, visible: false, updatedAt: 1 },
      { calendarId: 'cal-visible', accountId: 'a1', calendarName: 'Visible', profileId: null, visible: true, updatedAt: 1 },
    ])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Keep me', start: '2026-04-22T10:00:00Z', calendarId: 'cal-visible' },
      { id: 'e2', title: 'Drop me', start: '2026-04-22T11:00:00Z', calendarId: 'cal-hidden' },
    ])

    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events.map(e => e.id)).toEqual(['e1'])
  })

  it('keeps all events when no mappings hide anything', async () => {
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'A', start: '2026-04-22T10:00:00Z', calendarId: 'cal1' },
      { id: 'e2', title: 'B', start: '2026-04-22T11:00:00Z', calendarId: 'cal2' },
    ])
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events.map(e => e.id).sort()).toEqual(['e1', 'e2'])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendar.visibility.test.ts`
Expected: FAIL — the hidden event leaks through.

- [ ] **Step 3: Add the filter**

In `src/server/trpc/routers/calendar.ts`, inside the `list` procedure:

1. After loading `listCalendarMappings(ctx.uid)`, build: `const hiddenCalendarIds = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))`.
2. After the event array is built (and before the existing iCalUID dedupe), apply: `events = events.filter(e => !hiddenCalendarIds.has(e.calendarId ?? ''))`.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/trpc/routers/calendar.visibility.test.ts`
Expected: PASS (2 tests).

Run: `npx jest tests/server/trpc/routers/calendar.test.ts`
Expected: still green (the existing happy-path mocks don't set `visible: false`).

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/calendar.ts tests/server/trpc/routers/calendar.visibility.test.ts
git commit -m "feat(trpc): calendar.list filters events from hidden calendars"
```

---

### Task 5: `calendar.getPrepNotes` procedure (re-implements the deleted digest)

The old `/api/calendar/digest/route.ts` was deleted during the tRPC migration with the intent to replan the AI prep-notes feature. This task re-implements it as a per-event tRPC procedure. Recover the original prompt + schema from git: `git show HEAD~5:src/app/api/calendar/digest/route.ts` (adjust the `HEAD~5` offset as needed — use `git log --all --oneline -- src/app/api/calendar/digest/route.ts` to find the last commit that had the file).

**Files:**
- Modify: `src/server/trpc/routers/calendar.ts`
- Create: `tests/server/trpc/routers/calendar.getPrepNotes.test.ts`

- [ ] **Step 1: Recover the original prompt**

Run:

```bash
git log --all --oneline -- src/app/api/calendar/digest/route.ts | head
```

Note the most recent commit hash that shows the file. Then run:

```bash
git show <hash>:src/app/api/calendar/digest/route.ts > /tmp/old-digest.ts
```

Read `/tmp/old-digest.ts`. Extract: (a) the Zod schema for the AI output, (b) the prompt template, (c) the `generateObject` call (model name + options).

- [ ] **Step 2: Write the router test**

Create `tests/server/trpc/routers/calendar.getPrepNotes.test.ts`:

```ts
import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')
jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('calendar.getPrepNotes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      {
        id: 'e1',
        title: 'Dentist',
        start: '2026-04-23T15:00:00.000Z',
        end: '2026-04-23T16:00:00.000Z',
        location: '123 Main St, San Francisco, CA',
        calendarId: 'cal1',
      },
      {
        id: 'e2',
        title: 'Lunch',
        start: '2026-04-23T12:00:00.000Z',
        calendarId: 'cal1',
      },
    ])
  })

  it('returns AI prep notes for the given event', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        travelBuffer: 'Leave by 7:45 AM; 30 min drive with traffic.',
        prepSuggestion: 'Bring insurance card and recent X-rays.',
      },
    })
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.getPrepNotes({ eventId: 'e1' })
    expect(result.travelBuffer).toContain('7:45')
    expect(result.prepSuggestion).toContain('insurance')
  })

  it('throws NOT_FOUND when the event does not exist', async () => {
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.getPrepNotes({ eventId: 'nonexistent' })).rejects.toThrow(/NOT_FOUND|not found/i)
  })

  it('rejects unauthenticated callers', async () => {
    const caller = calendarRouter.createCaller({})
    await expect(caller.getPrepNotes({ eventId: 'e1' })).rejects.toThrow()
  })

  it('passes nearby events (same day, other events) into the prompt context', async () => {
    const generateObject = aiModule.generateObject as jest.Mock
    generateObject.mockResolvedValue({
      object: { travelBuffer: null, prepSuggestion: null },
    })
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    await caller.getPrepNotes({ eventId: 'e1' })
    const promptArg = generateObject.mock.calls[0][0].prompt as string
    // The "Lunch" event shares the day and should be referenced so the AI can reason about travel buffers
    expect(promptArg).toContain('Lunch')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendar.getPrepNotes.test.ts`
Expected: FAIL — `getPrepNotes` not a member.

- [ ] **Step 3: Add the procedure**

Edit `src/server/trpc/routers/calendar.ts`. Add (adapting the prompt/schema from the recovered `/tmp/old-digest.ts`):

```ts
import { z } from 'zod'
import { generateObject } from 'ai'
import { openai } from '@ai-sdk/openai'
import { TRPCError } from '@trpc/server'
// ... existing imports

const PrepNotesSchema = z.object({
  travelBuffer: z.string().nullable(),
  prepSuggestion: z.string().nullable(),
})

// Inside the router definition, alongside `list`:
getPrepNotes: protectedProcedure
  .input(z.object({ eventId: z.string().min(1) }))
  .query(async ({ ctx, input }) => {
    // Reuse the same fetch pipeline as `list` — the calendar-fetcher is lightweight and keeps the
    // single-source-of-truth principle. Optimization (caching) is a Phase 4 concern.
    const accounts = await listAccounts(ctx.uid)
    const mappings = await listCalendarMappings(ctx.uid)
    const hiddenCalendarIds = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))

    const all = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
        if (!rt) return []
        const { accessToken } = await refreshAccessToken(rt)
        const raw = await fetchCalendarEvents(accessToken)
        return raw.map(e => ({ ...e, accountId: acc.id, accountEmail: acc.email }))
      } catch {
        return []
      }
    }))
    const events = all.flat().filter(e => !hiddenCalendarIds.has(e.calendarId ?? ''))
    const target = events.find(e => e.id === input.eventId)
    if (!target) {
      throw new TRPCError({ code: 'NOT_FOUND', message: `Event ${input.eventId} not found` })
    }

    const sameDay = events
      .filter(e => e.id !== target.id && e.start?.slice(0, 10) === target.start?.slice(0, 10))
      .map(e => ({ title: e.title, start: e.start, end: e.end, location: e.location }))

    // Prompt ported from the deleted /api/calendar/digest/route.ts — keep behavior identical.
    const prompt = `You are a Chief of Staff AI helping Mary prepare for an upcoming calendar event.

TARGET EVENT:
Title: ${target.title}
Start: ${target.start}
End: ${target.end ?? 'unknown'}
Location: ${target.location ?? 'unknown'}

OTHER EVENTS ON THE SAME DAY (for travel-buffer reasoning):
${JSON.stringify(sameDay, null, 2)}

Produce two short strings:
1. travelBuffer — leave-by advice accounting for the previous/next event on the same day and the target location. Null if no location or no travel implication.
2. prepSuggestion — one concrete action Mary should take before this event (documents to bring, pre-read, agenda item). Null if nothing meaningful.

Be terse. No preamble. Mary reads these in a 96-px-wide sidebar.`

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: PrepNotesSchema,
      prompt,
    })
    return object
  }),
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/trpc/routers/calendar.getPrepNotes.test.ts`
Expected: PASS (4 tests).

Run: `npx jest`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/calendar.ts tests/server/trpc/routers/calendar.getPrepNotes.test.ts
git commit -m "feat(trpc): calendar.getPrepNotes re-implements AI prep notes on tRPC"
```

---

### Task 6: `calendar.insights` procedure (home-widget enrichment)

The home page previously showed schedule insights (a bulleted summary) populated by the old `/api/calendar/digest` route. That route was deleted; home widgets now render stale. Re-expose the feature as `trpc.calendar.insights.useQuery()` so the store can light up the widget slot.

**Files:**
- Modify: `src/server/trpc/routers/calendar.ts`
- Create: `tests/server/trpc/routers/calendar.insights.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/trpc/routers/calendar.insights.test.ts`:

```ts
import { calendarRouter } from '@/server/trpc/routers/calendar'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'
import { listCalendarMappings } from '@/lib/server/calendar-mappings'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')
jest.mock('@/lib/server/calendar-mappings')
jest.mock('ai', () => ({ generateObject: jest.fn() }))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('calendar.insights', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Standup', start: '2026-04-22T15:00:00Z', calendarId: 'cal1' },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { insights: ['Your morning is clear — good block for deep work.'] },
    })
  })

  it('returns an array of insight strings', async () => {
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { insights } = await caller.insights()
    expect(insights).toEqual(['Your morning is clear — good block for deep work.'])
  })

  it('returns empty insights when there are no upcoming events', async () => {
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([])
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { insights } = await caller.insights()
    expect(insights).toEqual([])
  })

  it('rejects unauthenticated callers', async () => {
    const caller = calendarRouter.createCaller({})
    await expect(caller.insights()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendar.insights.test.ts`
Expected: FAIL — `insights` not a member.

- [ ] **Step 3: Add the procedure**

Edit `src/server/trpc/routers/calendar.ts`:

```ts
const InsightsSchema = z.object({
  insights: z.array(z.string()),
})

// In the router object:
insights: protectedProcedure.query(async ({ ctx }) => {
  const accounts = await listAccounts(ctx.uid)
  const mappings = await listCalendarMappings(ctx.uid)
  const hiddenCalendarIds = new Set(mappings.filter(m => m.visible === false).map(m => m.calendarId))

  const all = await Promise.all(accounts.map(async (acc) => {
    try {
      const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
      if (!rt) return []
      const { accessToken } = await refreshAccessToken(rt)
      return await fetchCalendarEvents(accessToken)
    } catch {
      return []
    }
  }))
  const events = all.flat().filter(e => !hiddenCalendarIds.has(e.calendarId ?? ''))
  if (events.length === 0) return { insights: [] }

  // Only forward-looking events
  const now = Date.now()
  const upcoming = events
    .filter(e => e.start && new Date(e.start).getTime() >= now)
    .slice(0, 20)
    .map(e => ({ title: e.title, start: e.start, location: e.location }))
  if (upcoming.length === 0) return { insights: [] }

  const prompt = `You are Mary's Chief of Staff AI. Produce 1-4 bullet-point observations about her upcoming day/week of calendar events. Be terse, signal-rich, no preamble.

EVENTS:
${JSON.stringify(upcoming, null, 2)}`

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: InsightsSchema,
    prompt,
  })
  return object
}),
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/trpc/routers/calendar.insights.test.ts`
Expected: PASS (3 tests).

Run: `npx jest`
Expected: full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/calendar.ts tests/server/trpc/routers/calendar.insights.test.ts
git commit -m "feat(trpc): calendar.insights for home widget enrichment"
```

---

### Task 7: Extend `CalendarEvent` in the store

The existing `CalendarEvent` type in `src/lib/store.tsx` carries UI-projection fields (`time: string`, `date: number`). Schedule-X needs ISO `start`/`end`, and the filter sidebar needs `calendarId`, `calendarName`, `accountId`. Pass them through verbatim from `trpc.calendar.list` output.

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Extend the type**

In `src/lib/store.tsx`, find the `CalendarEvent` type definition. Add the new fields as optional so downstream consumers don't need to change:

```ts
export type CalendarEvent = {
  id: string
  title: string
  time: string
  date: number
  start?: string              // ISO pass-through (new)
  end?: string                // ISO pass-through (new)
  location?: string
  notes?: string
  fromEmail?: boolean
  aiTravelBuffer?: string | null
  aiPrepSuggestion?: string | null
  profileId?: string | null
  calendarId?: string         // pass-through (new)
  calendarName?: string       // pass-through (new)
  accountId?: string          // pass-through (new)
}
```

- [ ] **Step 2: Carry the fields through the `trpc.calendar.list` projection**

Find the block that transforms the server response into `CalendarEvent[]`. Update the map to include the new fields:

```ts
const events: CalendarEvent[] = useMemo(() => {
  if (!calendarData?.events) return []
  const tz = userTimeZone()
  return calendarData.events.map((e) => {
    const startDate = e.start ? zonedDate(e.start, tz) : new Date()
    const time = e.start ? formatInZone(e.start, tz, 'h:mm a') : ''
    return {
      id: e.id,
      title: e.title,
      time,
      date: startDate.getDate(),
      start: e.start,
      end: e.end,
      location: e.location,
      fromEmail: false,
      profileId: e.profileId ?? null,
      calendarId: e.calendarId,
      calendarName: e.calendarName,
      accountId: e.accountId,
    }
  })
}, [calendarData])
```

Note the switch from `toLocaleTimeString` to `formatInZone` — add the imports:

```ts
import { formatInZone, zonedDate, userTimeZone } from '@/lib/datetime'
```

Remove the now-dead `toLocaleTimeString` call from this block.

- [ ] **Step 3: Wire `trpc.calendar.insights` into the store**

Add alongside the existing `trpc.calendar.list.useQuery()` call:

```ts
const { data: insightsData } = trpc.calendar.insights.useQuery(undefined, {
  enabled: !!user,
  staleTime: 5 * 60 * 1000, // 5 minutes — cheap to keep stale for the home widget
})

const scheduleInsights: string[] = useMemo(
  () => insightsData?.insights ?? [],
  [insightsData],
)
```

Expose `scheduleInsights` from the `useHub` hook's return value. (Find the existing return shape and add the field.)

- [ ] **Step 4: Verify compile + test**

Run: `npx tsc --noEmit && npx jest`
Expected: zero errors, full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(store): pass ISO start/end + source fields; wire scheduleInsights"
```

---

### Task 8: Schedule-X calendar app wrapper

**Files:**
- Create: `src/components/calendar/calendar-app.tsx`

Before coding, verify via Context7: Schedule-X v4 React integration API (imports, `useCalendarApp`, `ScheduleXCalendar`, event format, callback signatures).

- [ ] **Step 1: Write the component**

Create `src/components/calendar/calendar-app.tsx`:

```tsx
"use client"

import { useEffect, useMemo } from 'react'
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react'
import { createViewDay, createViewWeek, createViewMonthGrid } from '@schedule-x/calendar'
import { createEventsServicePlugin } from '@schedule-x/events-service'
import '@schedule-x/theme-default/dist/index.css'
import type { CalendarEvent } from '@/lib/store'
import { toScheduleXDateTime, userTimeZone } from '@/lib/datetime'

export interface CalendarAppProps {
  events: CalendarEvent[]
  onEventClick?: (eventId: string) => void
}

export function CalendarApp({ events, onEventClick }: CalendarAppProps) {
  const zone = userTimeZone()

  const sxEvents = useMemo(() =>
    events
      .filter(e => e.start)
      .map(e => ({
        id: e.id,
        title: e.title,
        start: toScheduleXDateTime(e.start, zone),
        end: toScheduleXDateTime(e.end ?? e.start, zone),
        calendarId: e.calendarId ?? 'default',
      })),
  [events, zone])

  const eventsService = useMemo(() => createEventsServicePlugin(), [])

  const calendarApp = useCalendarApp({
    views: [createViewDay(), createViewWeek(), createViewMonthGrid()],
    events: sxEvents,
    defaultView: 'week',
    plugins: [eventsService],
    callbacks: onEventClick ? {
      onEventClick: (e: { id: string }) => onEventClick(String(e.id)),
    } : undefined,
  })

  // Keep Schedule-X in sync with our React state on every `events` change.
  useEffect(() => {
    eventsService.set(sxEvents)
  }, [sxEvents, eventsService])

  return <ScheduleXCalendar calendarApp={calendarApp} />
}
```

**If Context7 / the live docs show a different API** (e.g., `calendars` config goes onto `useCalendarApp` vs the plugin, event update pattern differs), follow the docs. The shape above is a template.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean. If the Schedule-X types surface errors, narrow with a local interface rather than `as any`.

- [ ] **Step 3: Commit**

```bash
git add src/components/calendar/calendar-app.tsx
git commit -m "feat(calendar): Schedule-X calendar app wrapper"
```

---

### Task 9: Sorbet CSS theme for Schedule-X

**Files:**
- Create: `src/styles/schedule-x-theme.css`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Confirm the globals entry file**

Run: `ls src/app/globals.css`
Expected: file exists. If the project uses a different name, adjust below.

- [ ] **Step 2: Create the theme override**

Create `src/styles/schedule-x-theme.css`. Variable names must match the current Schedule-X version — confirm via Context7 on `schedule-x theming` before finalizing.

```css
/* src/styles/schedule-x-theme.css
   Overrides Schedule-X CSS variables to match the sorbet palette.
   The variable names below target Schedule-X v4. If v5+ renames them, update here. */

.sx-react-calendar-wrapper,
.sx-react-calendar-wrapper.is-dark {
  --sx-color-primary: var(--foreground);
  --sx-color-on-primary: var(--background);
  --sx-color-primary-container: var(--card);
  --sx-color-on-primary-container: var(--foreground);
  --sx-color-surface: var(--background);
  --sx-color-on-surface: var(--foreground);
  --sx-color-surface-container: var(--card);
  --sx-color-outline: var(--border);
  --sx-color-outline-variant: var(--border);
  --sx-color-background: var(--background);

  --sx-font-family: inherit;
  --sx-internal-color-border: var(--border);

  border: none;
}

.sx-react-calendar-wrapper * {
  font-feature-settings: normal;
  letter-spacing: -0.01em;
}
```

- [ ] **Step 3: Import it**

Edit `src/app/globals.css`. Add near the top (after any Tailwind directives):

```css
@import '../styles/schedule-x-theme.css';
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/schedule-x-theme.css src/app/globals.css
git commit -m "feat(calendar): sorbet theme for Schedule-X via CSS variable overrides"
```

---

### Task 10: Filter sidebar component

**Files:**
- Create: `src/components/calendar/filter-sidebar.tsx`

- [ ] **Step 1: Implement**

Create `src/components/calendar/filter-sidebar.tsx`:

```tsx
"use client"

import { trpc } from '@/lib/trpc/client'
import { useHub } from '@/lib/store'

export interface FilterSidebarProps {
  activeProfiles: Set<string>              // empty set = show all
  onToggleProfile: (profileId: string) => void
}

export function FilterSidebar({ activeProfiles, onToggleProfile }: FilterSidebarProps) {
  const { profiles } = useHub()
  const { data: calendarsData } = trpc.calendars.list.useQuery()
  const utils = trpc.useUtils()
  const setVisibility = trpc.calendars.setVisibility.useMutation({
    onSuccess: async () => {
      // Refetch both the calendar metadata and the event list so hidden events disappear immediately.
      await Promise.all([
        utils.calendars.list.invalidate(),
        utils.calendar.list.invalidate(),
      ])
    },
  })

  const calendars = calendarsData?.calendars ?? []

  return (
    <aside className="w-60 shrink-0 border-r border-border pr-6 flex flex-col gap-8">
      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          People
        </h3>
        <ul className="flex flex-col gap-2">
          {profiles.map(p => {
            const active = activeProfiles.size === 0 || activeProfiles.has(p.id)
            return (
              <li key={p.id}>
                <button
                  onClick={() => onToggleProfile(p.id)}
                  className={`w-full text-left text-sm py-1 px-2 border-l-2 transition-colors ${
                    active ? 'border-foreground text-foreground' : 'border-transparent text-foreground/40'
                  }`}
                >
                  {p.name}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Calendars
        </h3>
        <ul className="flex flex-col gap-2">
          {calendars.map(c => (
            <li key={c.calendarId} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={c.visible}
                disabled={setVisibility.isPending}
                onChange={(e) => setVisibility.mutate({
                  calendarId: c.calendarId,
                  visible: e.target.checked,
                })}
                className="mt-1"
              />
              <div className="text-sm leading-tight">
                <div className={c.visible ? 'text-foreground' : 'text-foreground/40'}>
                  {c.calendarName}
                </div>
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
git commit -m "feat(calendar): filter sidebar (profiles + calendar visibility)"
```

---

### Task 11: Event detail drawer with AI prep notes

**Files:**
- Create: `src/components/calendar/event-detail-drawer.tsx`

- [ ] **Step 1: Implement**

Create `src/components/calendar/event-detail-drawer.tsx`:

```tsx
"use client"

import { trpc } from '@/lib/trpc/client'
import { useHub } from '@/lib/store'
import { formatInZone, userTimeZone } from '@/lib/datetime'

export interface EventDetailDrawerProps {
  eventId: string | null
  onClose: () => void
}

export function EventDetailDrawer({ eventId, onClose }: EventDetailDrawerProps) {
  const { events } = useHub()
  const zone = userTimeZone()

  const event = eventId ? events.find(e => e.id === eventId) ?? null : null

  const { data: prep, isLoading } = trpc.calendar.getPrepNotes.useQuery(
    { eventId: eventId ?? '' },
    {
      enabled: !!eventId,
      staleTime: 10 * 60 * 1000, // 10 min — prep notes don't change between clicks
    },
  )

  if (!event) return null

  const timeLabel = event.start
    ? formatInZone(event.start, zone, 'EEEE, MMM d · h:mm a')
    : event.time

  return (
    <aside className="fixed right-0 top-0 h-full w-96 bg-background border-l border-border p-8 overflow-y-auto z-50">
      <button
        onClick={onClose}
        className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-foreground mb-6"
      >
        Close
      </button>

      <h2 className="font-heading text-3xl font-light tracking-tighter mb-2">{event.title}</h2>
      <div className="text-xs font-mono text-foreground/40 mb-6">
        {timeLabel}
        {event.location ? ` · ${event.location}` : ''}
      </div>

      <section className="mb-6">
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Travel buffer
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : prep?.travelBuffer ? (
          <p className="text-sm font-serif leading-relaxed">{prep.travelBuffer}</p>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">No travel advice.</p>
        )}
      </section>

      <section>
        <h3 className="text-[10px] uppercase tracking-widest font-semibold text-foreground/40 mb-3">
          Prep suggestion
        </h3>
        {isLoading ? (
          <p className="text-sm text-muted-foreground font-serif italic">Generating…</p>
        ) : prep?.prepSuggestion ? (
          <p className="text-sm font-serif leading-relaxed">{prep.prepSuggestion}</p>
        ) : (
          <p className="text-sm text-muted-foreground font-serif italic">No prep needed.</p>
        )}
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
git add src/components/calendar/event-detail-drawer.tsx
git commit -m "feat(calendar): event detail drawer with AI prep notes via tRPC"
```

---

### Task 12: Rewrite `/calendar/page.tsx`

Full swap. Old week grid deleted; new page composes sidebar + Schedule-X + drawer.

**Files:**
- Modify: `src/app/calendar/page.tsx`

- [ ] **Step 1: Rewrite**

Replace the entire contents of `src/app/calendar/page.tsx` with:

```tsx
"use client"

import { useMemo, useState } from 'react'
import { useHub } from '@/lib/store'
import { trpc } from '@/lib/trpc/client'
import { CalendarApp } from '@/components/calendar/calendar-app'
import { FilterSidebar } from '@/components/calendar/filter-sidebar'
import { EventDetailDrawer } from '@/components/calendar/event-detail-drawer'

export default function CalendarPage() {
  const { events } = useHub()
  const { data: calendarsData } = trpc.calendars.list.useQuery()

  const [activeProfiles, setActiveProfiles] = useState<Set<string>>(new Set())
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  const hiddenCalendarIds = useMemo(
    () => new Set(
      (calendarsData?.calendars ?? [])
        .filter(c => !c.visible)
        .map(c => c.calendarId),
    ),
    [calendarsData],
  )

  // Server already filters by visibility, but we re-filter client-side for zero-flicker
  // when the user toggles a calendar off (the mutation's invalidation has a round-trip).
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

  return (
    <main className="flex-1 w-full bg-white text-foreground flex p-8 lg:p-12 h-[calc(100vh-6rem)]">
      <FilterSidebar
        activeProfiles={activeProfiles}
        onToggleProfile={toggleProfile}
      />
      <div className="flex-1 min-w-0 ml-8">
        <CalendarApp
          events={visibleEvents}
          onEventClick={setSelectedEventId}
        />
      </div>
      <EventDetailDrawer
        eventId={selectedEventId}
        onClose={() => setSelectedEventId(null)}
      />
    </main>
  )
}
```

- [ ] **Step 2: Remove any dead imports / helper functions left over in the same file**

Check the file before committing. The old week-grid implementation had helper functions (`buildWeekGrid`, `formatHour`, etc.) — delete them all; the new page has no use.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual smoke**

1. `npm run dev`
2. Visit `/calendar`. Confirm:
   - Sidebar renders profiles and calendars grouped by account
   - Schedule-X renders week view by default
   - Day / Week / Month toggle works
   - Clicking a calendar checkbox hides its events immediately
   - Clicking a profile narrows to profile-tagged events
   - Clicking an event opens the drawer
   - Drawer shows "Generating…" then AI content
   - Re-clicking the same event is instant (cache hit)
   - Theme matches sorbet (no Schedule-X default blue leaking)

- [ ] **Step 5: Commit**

```bash
git add src/app/calendar/page.tsx
git commit -m "feat(calendar): replace custom grid with Schedule-X + filters + drawer"
```

---

### Task 13: Settings → Calendars section wires to `setVisibility`

Settings gets a "Show" checkbox column so the same toggle is available in one central place, not only from the calendar page sidebar.

**Files:**
- Modify: `src/components/settings/calendars-section.tsx`

- [ ] **Step 1: Audit the existing component**

Read `src/components/settings/calendars-section.tsx`. After the tRPC migration, it already consumes `trpc.calendars.list.useQuery()` and `trpc.calendars.updateMapping.useMutation()`. This task adds a visibility toggle alongside the existing profile dropdown.

- [ ] **Step 2: Add the visibility column**

In the row render, before the profile dropdown:

```tsx
import { trpc } from '@/lib/trpc/client'
// (already present)

export function CalendarsSection() {
  const { data } = trpc.calendars.list.useQuery()
  const utils = trpc.useUtils()
  const setVisibility = trpc.calendars.setVisibility.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.calendars.list.invalidate(),
        utils.calendar.list.invalidate(),
      ])
    },
  })
  // ... existing updateMapping mutation

  const calendars = data?.calendars ?? []

  return (
    <section>
      {/* existing heading */}
      <table>
        <thead>
          <tr>
            <th>Show</th>
            <th>Calendar</th>
            <th>Account</th>
            <th>Profile</th>
          </tr>
        </thead>
        <tbody>
          {calendars.map(c => (
            <tr key={c.calendarId}>
              <td>
                <input
                  type="checkbox"
                  checked={c.visible}
                  disabled={setVisibility.isPending}
                  onChange={(e) => setVisibility.mutate({
                    calendarId: c.calendarId,
                    visible: e.target.checked,
                  })}
                />
              </td>
              <td>{c.calendarName}</td>
              <td className="font-mono text-xs text-foreground/40">{c.accountEmail}</td>
              <td>
                {/* existing profile dropdown wired to updateMapping */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
```

Match the existing component's visual conventions (the example above shows the behavior, not the exact markup — respect the current design system classes in use).

- [ ] **Step 3: Verify compile + lint**

Run: `npx tsc --noEmit && npx eslint src/components/settings/calendars-section.tsx`
Expected: clean.

- [ ] **Step 4: Manual smoke**

1. `npm run dev`
2. Go to `/settings`. Toggle "Show" off for a calendar.
3. Navigate to `/calendar`. That calendar's events should be gone.
4. Return to `/settings`. Toggle back on. `/calendar` should show them again after the next refetch.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/calendars-section.tsx
git commit -m "feat(settings): visibility checkbox column wired to calendars.setVisibility"
```

---

### Task 14: Home-widget AI insights — verify the regression is fixed

Home-page widgets that depended on `scheduleInsights` were broken by the deletion of `/api/calendar/digest` during the tRPC migration. Task 7 wired the new `trpc.calendar.insights` query into the store. This task confirms the widget actually renders.

**Files:**
- Investigate: `src/app/page.tsx`, `src/components/widgets/*`
- Likely modify: one widget that consumes `scheduleInsights`

- [ ] **Step 1: Diagnose**

Run: `rg "scheduleInsights|aiPrepSuggestion|aiTravelBuffer" src`
Expected: results showing which components consume which fields.

- [ ] **Step 2: Confirm the widget is reading from the `useHub` hook**

Open the widget file surfaced by Step 1 (likely `src/components/widgets/schedule-widget.tsx` or similar). Verify it reads `scheduleInsights` via `useHub()`. If the widget is still pointing at a removed field (`scheduleInsights` was never added back to the hook's return in Task 7), add it to the destructuring and render.

Sketch (replace once you've read the actual widget):

```tsx
const { scheduleInsights } = useHub()

return (
  <div>
    <h3>Today's signal</h3>
    {scheduleInsights.length === 0
      ? <p className="italic text-muted-foreground">Nothing to flag.</p>
      : <ul>{scheduleInsights.map((s, i) => <li key={i}>{s}</li>)}</ul>}
  </div>
)
```

- [ ] **Step 3: Manual smoke**

1. `npm run dev`
2. Load `/`. Confirm the schedule-insights widget renders 1-4 bullet points (or an empty-state message).
3. Check the Network tab: a single `/api/trpc/calendar.insights,...` batch call on initial load.

- [ ] **Step 4: Verify automated suite**

Run: `npx tsc --noEmit && npx jest`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(home): restore schedule-insights widget via calendar.insights query"
```

---

### Task 15: Full verification + manual smoke

- [ ] **Step 1: Run the full automated suite**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npx jest`
Expected: every test green (baseline + all new router tests + datetime tests + visibility tests + prep-notes tests + insights tests).

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 2: End-to-end smoke checklist**

Run through the full flow. Check each box only after manual verification.

- [ ] Day / Week / Month view switcher works on `/calendar`
- [ ] Sidebar shows every linked calendar grouped by account
- [ ] Calendar visibility toggle in sidebar hides events immediately (optimistic) and persists across reload
- [ ] Calendar visibility toggle in `/settings` produces the same result (no UI divergence between the two entry points)
- [ ] Profile filter in sidebar narrows to events tagged with the selected profile; clearing all selections restores all events
- [ ] Clicking an event opens the right-side drawer
- [ ] Drawer shows `Generating…` then AI content (travel buffer + prep suggestion)
- [ ] Re-clicking the same event within 10 min hits the query cache (instant render, no network call)
- [ ] Home schedule-insights widget renders the bulleted insights from `calendar.insights`
- [ ] Theme matches sorbet: no Schedule-X default blue / chrome bleeding through
- [ ] No Firestore permission errors in the server log
- [ ] No duplicate-event warnings in the browser console
- [ ] Timezone displays correct wall-clock times in the drawer (test by changing your system timezone, or inspect the 12-hour string)

- [ ] **Step 3: Final commit if any polish fixes emerged**

```bash
git add -A
git status
git commit -m "chore: calendar redesign v2 polish"
```

- [ ] **Step 4: Open PR**

```bash
git push -u origin feature/calendar-redesign-v2
gh pr create --title "Calendar redesign v2: Schedule-X + visibility + filters + AI prep notes" --body "$(cat <<'EOF'
## Summary
- Schedule-X integration with day/week/month views, sorbet-themed
- Per-calendar visibility flag (`CalendarMapping.visible`) + `calendars.setVisibility` mutation
- Profile filter sidebar (client-side) + calendar visibility checkboxes
- Event detail drawer with AI prep notes via new `calendar.getPrepNotes` tRPC procedure
- Home-widget regression fix: new `calendar.insights` procedure backs the schedule-insights widget
- Timezone-safe display via `date-fns-tz`

Rewrite of the cancelled `docs/superpowers/plans/2026-04-21-calendar-redesign.md` on top of the new tRPC + TanStack Query baseline.

## Test plan
- [x] Full jest suite green
- [x] Zero tsc / lint errors
- [x] Manual smoke checklist in the plan — every box checked
EOF
)"
```

---

## Post-Plan Verification

Before declaring the calendar redesign v2 done:

1. All 16 tasks committed (Tasks 0-15).
2. `npx tsc --noEmit` — zero errors.
3. `npx jest` — full suite green.
4. `npm run lint` — zero errors.
5. Manual smoke checklist from Task 15 Step 2 — every box checked.
6. PR open against `main`.

## What's Next

After this ships:
- **Phase 4:** Google write flow. The drawer becomes editable; `calendar.createEvent` / `calendar.updateEvent` / `calendar.deleteEvent` mutations back the UI with optimistic updates and idempotency keys.
- **Calendar color coding:** Wire per-calendar colors into Schedule-X's `calendars` config, stored on `CalendarMapping` (one more field). Trivial extension.
- **Recurrence:** Currently Schedule-X shows each occurrence independently (as fetched from Google). Editing recurrence rules is Phase 4+.
- **Share-to-calendar from inbox:** Phase 2 (inbox AI extraction) produces calendar-invite action chips; committing one uses the Phase 4 write flow.
