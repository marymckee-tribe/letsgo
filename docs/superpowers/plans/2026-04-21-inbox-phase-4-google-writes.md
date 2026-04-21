# Inbox Redesign — Phase 4: Google Write Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 2 action cards into real Google commits. A single click on an action card's "Add to Calendar" / "Add to Tasks" writes the event or task to the user's Google account via a new `actionsRouter`, stores the resulting `googleId` on the action, and never creates a duplicate — even if the user double-clicks, retries a failed commit, or reloads mid-flight. A sibling `inboxRouter.markCleared` mutation flips an email to `CLEARED`, marks any orphan `PROPOSED` actions as `DISMISSED_BY_CLEAR`, and marks the underlying Gmail message as read.

**Architecture:** One new tRPC router (`actions`) exposes `commitCalendar`, `commitTask`, `dismiss`, and `retry` as `protectedProcedure.mutation`s. Each commit is keyed by a deterministic idempotency key `${emailId}:${actionId}` stored in `users/{uid}/idempotencyKeys/{key}` → `{ googleId, committedAt, type }`. A retry with the same key short-circuits to the stored `googleId` instead of hitting Google again. Calendar commits run a duplicate-detection pre-check (fuzzy title match within ±2h of proposed start) and raise `TRPCError({ code: 'CONFLICT' })` with a structured `data` payload unless the caller passes `force: true`. All Google writes reuse Phase 1's `refreshAccessToken` path so 401s transparently re-mint access tokens. The UI layer wraps each mutation in a TanStack Query optimistic update via `trpc.useUtils()` — snapshot → write → rollback-on-error → invalidate-on-success. Email state (hubStatus + action status + googleId) persists in a new Firestore collection `users/{uid}/emails/{emailId}` so writes survive reload. A second new mutation, `inboxRouter.markCleared`, composes the Firestore write + Gmail `users.messages.modify` call + orphan-action bookkeeping in one server round-trip.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, `@tanstack/react-query` v5 (via `@trpc/react-query`), Zod 4, Firebase Admin SDK, `date-fns-tz` (newly added) for IANA timezone formatting, `googleapis` npm package (already installed — but we use raw `fetch()` for the write calls to match the `calendar-fetcher.ts` / `gmail-fetcher.ts` / `tasks-fetcher.ts` house style; the `googleapis` package is already used only inside `google-oauth.ts`), Jest + ts-jest.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "Google Write Flow" section (idempotency, double-click protection, duplicate detection, error handling) and the `hubStatus` / `DISMISSED_BY_CLEAR` notes in the "What clearing means" section.

**Base branch:** Branch `feature/inbox-phase-4` off the tip of Phase 3's merged branch (or Phase 2's if Phase 3 is in-flight — this plan does not depend on Phase 3 UI structure, only on Phase 2 data types). This plan assumes the tRPC + react-query baseline from `docs/superpowers/plans/2026-04-21-architecture-trpc-react-query.md` is in place (root router, `protectedProcedure`, `createCaller`, `trpc.useUtils()` client-side).

---

## Before You Start — Read These

Next.js 16 and tRPC v11's App Router setup differ from most tutorials. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler conventions (only relevant for one file in this plan, the tRPC catch-all already exists)
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- `https://trpc.io/docs/server/error-handling` — `TRPCError` with custom `data` payload (needed for `CONFLICT` duplicate-detection response)
- `https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates` — official optimistic-update recipe (the pattern used in every UI task here)
- `https://date-fns.org/v3.6.0/docs/Time-Zones` — `date-fns-tz` API; `fromZonedTime` and `formatInTimeZone` specifically. Confirm your installed version's API matches before using — the package had breaking changes at v3.

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not assume patterns from memory.

If anything in this plan conflicts with what the official docs say, follow the docs and update the plan.

---

## File Structure

### New files
- `src/lib/server/emails-store.ts` — Firestore CRUD for per-email state (`hubStatus`, `suggestedActions[]` with commit metadata). Collection: `users/{uid}/emails/{emailId}`.
- `src/lib/server/idempotency-store.ts` — `getIdempotencyRecord(uid, key)` / `setIdempotencyRecord(uid, key, { googleId, type })`. Collection: `users/{uid}/idempotencyKeys/{key}`.
- `src/lib/server/calendar-writer.ts` — `createCalendarEvent(accessToken, input)` using raw `fetch()`; returns `{ id, htmlLink }`.
- `src/lib/server/tasks-writer.ts` — `createTask(accessToken, input)` using raw `fetch()`; returns `{ id }`.
- `src/lib/server/calendar-duplicate-check.ts` — `findDuplicateCalendarEvent(accessToken, { title, start, end })` → `{ id, title, start } | null`.
- `src/lib/server/gmail-writer.ts` — `markMessageRead(accessToken, messageId)` calling `users.messages.modify` with `removeLabelIds: ['UNREAD']`.
- `src/lib/server/tz-helpers.ts` — wraps `date-fns-tz` to turn `{ date: epochMs, time: 'HH:mm', tz: 'America/Los_Angeles' }` into `{ dateTime: ISO, timeZone: 'America/Los_Angeles' }` suitable for the Calendar API body.
- `src/lib/server/action-resolver.ts` — `resolveActionContext(uid, emailId, actionId)` loads email + action + account, refreshes access token, returns `{ action, email, account, accessToken }` or throws `TRPCError`. Shared by all four commit procedures.
- `src/server/trpc/routers/actions.ts` — tRPC router with `commitCalendar`, `commitTask`, `dismiss`, `retry`.
- `src/hooks/use-commit-action.ts` — small client-side wrapper around `trpc.actions.commitCalendar.useMutation()` / `commitTask.useMutation()` that encapsulates the optimistic-update dance (snapshot → mutate → rollback → invalidate). Consumed by the action card component.
- `src/components/inbox/duplicate-warning-dialog.tsx` — pre-commit warning shown when calendar commit throws `CONFLICT`; "Add anyway" button re-triggers the mutation with `force: true`.
- `tests/server/emails-store.test.ts`
- `tests/server/idempotency-store.test.ts`
- `tests/server/calendar-writer.test.ts`
- `tests/server/tasks-writer.test.ts`
- `tests/server/calendar-duplicate-check.test.ts`
- `tests/server/gmail-writer.test.ts`
- `tests/server/tz-helpers.test.ts`
- `tests/server/action-resolver.test.ts`
- `tests/server/trpc/routers/actions.test.ts`
- `tests/server/trpc/routers/actions-errors.test.ts` — integration tests for the full error matrix (5xx → EDITING, 4xx → FAILED, 401 → refresh, duplicate → CONFLICT + force override, idempotency round-trip)
- `tests/server/trpc/routers/inbox-mark-cleared.test.ts`
- `tests/hooks/use-commit-action.test.tsx` — React Testing Library test for the optimistic update + rollback

### Modified files
- `src/server/trpc/routers/inbox.ts` — add `markCleared` mutation (alongside the existing `digest` query from Phase 2). Also add a new `getEmail({ emailId })` query used by the action router's resolver fallback (only if Phase 3 hasn't added one already — check first).
- `src/server/trpc/root.ts` — mount `actionsRouter`
- `src/lib/store.tsx` — add optimistic-update helpers that expose `markCleared` + `commitAction` from within the store surface (only if the store pattern is still in use after Phase 3 — if Phase 3 removed the store in favor of direct hook calls in components, skip this file and do the work inside components)
- `src/components/inbox/action-card.tsx` (created in Phase 3) — wire the commit/dismiss/retry buttons through `useCommitAction`; add `disabled={mutation.isPending}`; render the duplicate-warning dialog; render FAILED state with inline error + Dismiss/Retry buttons
- `src/components/inbox/email-detail.tsx` (created in Phase 3) — wire the "Clear" button through `trpc.inbox.markCleared.useMutation()` with an optimistic update
- `package.json` — add `date-fns` + `date-fns-tz` deps

### Explicitly NOT touched
- `src/lib/server/accounts.ts`, `src/lib/server/google-oauth.ts`, `src/lib/server/crypto.ts`, `src/lib/server/firebase-admin.ts` — all reused as-is.
- `src/lib/server/calendar-fetcher.ts`, `src/lib/server/gmail-fetcher.ts`, `src/lib/server/tasks-fetcher.ts` — read-only fetchers; the new writers live in their own files.
- `src/lib/server/classification-schema.ts` + `src/lib/server/digest-prompt.ts` (Phase 2) — the AI pipeline is untouched.
- `src/app/api/trpc/[trpc]/route.ts` — the catch-all Route Handler is already live from the tRPC baseline.

### Out of scope for Phase 4
- PDF extraction (Phase 5)
- Reply sending via `gmail.send` (Phase 6)
- Home widget redesign (Phase 7)

---

## Prerequisites (one-time)

- [ ] **P1. Phases 1–3 merged (or at least Phase 2).** Run `git log --oneline -30` and confirm `feature/inbox-phase-1` and `feature/inbox-phase-2` are in history. Phase 3 UI is strongly preferred but not strictly required — the procedures and store work stand on their own; only the component tasks (13, 14) assume Phase 3 components exist.
- [ ] **P2. tRPC + react-query baseline merged.** Run `ls src/server/trpc/routers/` — you should see `accounts.ts`, `auth.ts`, `calendar.ts`, `calendars.ts`, `gmail.ts`, `tasks.ts`, `inbox.ts`. If not, the baseline plan (`docs/superpowers/plans/2026-04-21-architecture-trpc-react-query.md`) must land first.
- [ ] **P3. Confirm `googleapis` and `googleapis` scopes.** Run `grep -n "SCOPES" src/lib/server/google-oauth.ts`. `calendar.events`, `tasks`, `gmail.modify` must already be present. (They were added in Phase 1; verify nothing regressed.)
- [ ] **P4. Environment variables.** No new env vars. Phase 4 reuses `GOOGLE_OAUTH_*`, `FIREBASE_ADMIN_SA_JSON`, `TOKEN_ENCRYPTION_KEY`.
- [ ] **P5. Create the working branch.** Run `git checkout -b feature/inbox-phase-4`.
- [ ] **P6. Confirm the baseline is green.** Run `npx tsc --noEmit && npx jest && npm run lint`. All three must pass before starting.

---

## Tasks

### Task 0: Install date-fns-tz

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the deps**

Run:

```bash
npm install date-fns@^3 date-fns-tz@^3
```

Expected: `date-fns` and `date-fns-tz` appear in `dependencies`. Both libraries on v3 ship ESM-first; the codebase's `moduleResolution` in `tsconfig.json` should be `bundler` or `node16` — confirm with `grep -n moduleResolution tsconfig.json` before committing.

- [ ] **Step 2: Sanity check**

Run: `npx tsc --noEmit`
Expected: zero errors (no new code yet).

Run: `npx jest`
Expected: existing suite still passes.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add date-fns + date-fns-tz for tz-aware Calendar writes"
```

---

### Task 1: Timezone helpers

Turn the action's `{ date: epochMs, time: 'HH:mm' }` plus the user's browser tz into a `{ dateTime, timeZone }` pair the Calendar API accepts.

**Files:**
- Create: `src/lib/server/tz-helpers.ts`
- Create: `tests/server/tz-helpers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/tz-helpers.test.ts`:

```ts
import { buildCalendarDateTime, buildCalendarAllDay } from '@/lib/server/tz-helpers'

describe('buildCalendarDateTime', () => {
  it('combines an epoch-ms date and an HH:mm time in the given tz into RFC3339', () => {
    // 2026-05-15 is a Friday. 9:30 AM Pacific = 16:30 UTC.
    const epochMsForThatMorningUtc = Date.UTC(2026, 4, 15, 0, 0, 0) // midnight UTC on the target day
    const result = buildCalendarDateTime({
      dateEpochMs: epochMsForThatMorningUtc,
      time: '09:30',
      timeZone: 'America/Los_Angeles',
    })
    expect(result.timeZone).toBe('America/Los_Angeles')
    // The ISO string must have a -07:00 offset because May 15 is DST.
    expect(result.dateTime).toMatch(/^2026-05-15T09:30:00(-07:00|-08:00)$/)
  })

  it('honors the provided timezone even when the server runs in UTC', () => {
    const epochMs = Date.UTC(2026, 0, 10, 0, 0, 0) // Jan 10 — standard time
    const result = buildCalendarDateTime({
      dateEpochMs: epochMs,
      time: '18:00',
      timeZone: 'America/New_York',
    })
    expect(result.dateTime).toBe('2026-01-10T18:00:00-05:00')
    expect(result.timeZone).toBe('America/New_York')
  })

  it('throws on invalid HH:mm', () => {
    expect(() =>
      buildCalendarDateTime({ dateEpochMs: 0, time: '9:30', timeZone: 'UTC' }),
    ).toThrow(/HH:mm/)
  })
})

describe('buildCalendarAllDay', () => {
  it('returns { date } in YYYY-MM-DD format in the given tz', () => {
    const epochMs = Date.UTC(2026, 4, 15, 23, 0, 0) // 23:00 UTC on May 15
    // In LA that's 16:00 on May 15 — still the 15th locally.
    const result = buildCalendarAllDay({
      dateEpochMs: epochMs,
      timeZone: 'America/Los_Angeles',
    })
    expect(result.date).toBe('2026-05-15')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/tz-helpers.test.ts`
Expected: FAIL with `Cannot find module '@/lib/server/tz-helpers'`.

- [ ] **Step 3: Implement the helper**

Create `src/lib/server/tz-helpers.ts`:

```ts
import { formatInTimeZone } from 'date-fns-tz'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface TimedSlot {
  dateTime: string // RFC3339 with offset
  timeZone: string
}

export interface AllDaySlot {
  date: string // YYYY-MM-DD
}

export function buildCalendarDateTime(input: {
  dateEpochMs: number
  time: string
  timeZone: string
}): TimedSlot {
  if (!HHMM.test(input.time)) {
    throw new Error(`Invalid time format (expected HH:mm): ${input.time}`)
  }
  const ymd = formatInTimeZone(new Date(input.dateEpochMs), input.timeZone, 'yyyy-MM-dd')
  const offset = formatInTimeZone(new Date(input.dateEpochMs), input.timeZone, 'xxx')
  return {
    dateTime: `${ymd}T${input.time}:00${offset}`,
    timeZone: input.timeZone,
  }
}

export function buildCalendarAllDay(input: {
  dateEpochMs: number
  timeZone: string
}): AllDaySlot {
  return {
    date: formatInTimeZone(new Date(input.dateEpochMs), input.timeZone, 'yyyy-MM-dd'),
  }
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/tz-helpers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/tz-helpers.ts tests/server/tz-helpers.test.ts
git commit -m "feat(server): tz-aware helpers for Calendar API datetime fields"
```

---

### Task 2: Idempotency store

Deterministic keys backed by Firestore. Must survive reload, double-click, and retry.

**Files:**
- Create: `src/lib/server/idempotency-store.ts`
- Create: `tests/server/idempotency-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/idempotency-store.test.ts`:

```ts
import { getIdempotencyRecord, setIdempotencyRecord, buildIdempotencyKey } from '@/lib/server/idempotency-store'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('idempotency-store', () => {
  const docMock = { get: jest.fn(), set: jest.fn() }
  const colMock = { doc: jest.fn(() => docMock) }
  const adminDbMock = {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ collection: jest.fn(() => colMock) })) })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue(adminDbMock)
  })

  it('buildIdempotencyKey joins emailId and actionId with a colon', () => {
    expect(buildIdempotencyKey('e1', 'a1')).toBe('e1:a1')
  })

  it('getIdempotencyRecord returns null for a missing doc', async () => {
    docMock.get.mockResolvedValue({ exists: false })
    const result = await getIdempotencyRecord('uid1', 'e1:a1')
    expect(result).toBeNull()
  })

  it('getIdempotencyRecord returns the stored record when present', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({ googleId: 'gcal-event-123', type: 'CALENDAR_EVENT', committedAt: 1700000000000 }),
    })
    const result = await getIdempotencyRecord('uid1', 'e1:a1')
    expect(result).toEqual({ googleId: 'gcal-event-123', type: 'CALENDAR_EVENT', committedAt: 1700000000000 })
  })

  it('setIdempotencyRecord writes the googleId + type + timestamp', async () => {
    docMock.set.mockResolvedValue(undefined)
    await setIdempotencyRecord('uid1', 'e1:a1', { googleId: 'gcal-event-123', type: 'CALENDAR_EVENT' })
    expect(docMock.set).toHaveBeenCalledWith(
      expect.objectContaining({
        googleId: 'gcal-event-123',
        type: 'CALENDAR_EVENT',
        committedAt: expect.any(Number),
      }),
    )
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/idempotency-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/idempotency-store.ts`:

```ts
import { getAdminDb } from './firebase-admin'

export type IdempotencyType = 'CALENDAR_EVENT' | 'TODO'

export interface IdempotencyRecord {
  googleId: string
  type: IdempotencyType
  committedAt: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('idempotencyKeys')
}

export function buildIdempotencyKey(emailId: string, actionId: string): string {
  return `${emailId}:${actionId}`
}

export async function getIdempotencyRecord(uid: string, key: string): Promise<IdempotencyRecord | null> {
  const snap = await col(uid).doc(key).get()
  if (!snap.exists) return null
  return snap.data() as IdempotencyRecord
}

export async function setIdempotencyRecord(
  uid: string,
  key: string,
  input: { googleId: string; type: IdempotencyType },
): Promise<void> {
  const record: IdempotencyRecord = {
    googleId: input.googleId,
    type: input.type,
    committedAt: Date.now(),
  }
  await col(uid).doc(key).set(record)
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/idempotency-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/idempotency-store.ts tests/server/idempotency-store.test.ts
git commit -m "feat(server): Firestore-backed idempotency key store"
```

---

### Task 3: Per-email state store

Phase 2's digest returns emails live; nothing is persisted. Phase 4 adds a per-email Firestore record so `hubStatus` and action commit state survive reload.

**Files:**
- Create: `src/lib/server/emails-store.ts`
- Create: `tests/server/emails-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/emails-store.test.ts`:

```ts
import {
  getEmailState,
  updateEmailHubStatus,
  updateActionStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('emails-store', () => {
  const docMock = { get: jest.fn(), set: jest.fn(), update: jest.fn() }
  const colMock = { doc: jest.fn(() => docMock) }
  const adminDbMock = {
    collection: jest.fn(() => ({ doc: jest.fn(() => ({ collection: jest.fn(() => colMock) })) })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue(adminDbMock)
  })

  it('getEmailState returns null for a missing doc', async () => {
    docMock.get.mockResolvedValue({ exists: false })
    expect(await getEmailState('uid1', 'e1')).toBeNull()
  })

  it('updateEmailHubStatus merges hubStatus into the email doc', async () => {
    docMock.set.mockResolvedValue(undefined)
    await updateEmailHubStatus('uid1', 'e1', 'CLEARED')
    expect(docMock.set).toHaveBeenCalledWith({ hubStatus: 'CLEARED' }, { merge: true })
  })

  it('updateActionStatus merges the action state by actionId', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({
        hubStatus: 'UNREAD',
        suggestedActions: [
          { id: 'a1', status: 'PROPOSED' },
          { id: 'a2', status: 'PROPOSED' },
        ],
      }),
    })
    docMock.set.mockResolvedValue(undefined)
    await updateActionStatus('uid1', 'e1', 'a1', { status: 'COMMITTED', googleId: 'gcal-1' })
    const call = docMock.set.mock.calls[0][0]
    expect(call.suggestedActions).toEqual([
      { id: 'a1', status: 'COMMITTED', googleId: 'gcal-1' },
      { id: 'a2', status: 'PROPOSED' },
    ])
  })

  it('markOrphanActionsDismissedByClear flips only PROPOSED/EDITING actions', async () => {
    docMock.get.mockResolvedValue({
      exists: true,
      data: () => ({
        suggestedActions: [
          { id: 'a1', status: 'PROPOSED' },
          { id: 'a2', status: 'COMMITTED', googleId: 'gcal-1' },
          { id: 'a3', status: 'EDITING' },
          { id: 'a4', status: 'FAILED' },
        ],
      }),
    })
    docMock.set.mockResolvedValue(undefined)
    await markOrphanActionsDismissedByClear('uid1', 'e1')
    const call = docMock.set.mock.calls[0][0]
    expect(call.suggestedActions.map((a: { id: string; status: string }) => [a.id, a.status])).toEqual([
      ['a1', 'DISMISSED_BY_CLEAR'],
      ['a2', 'COMMITTED'],
      ['a3', 'DISMISSED_BY_CLEAR'],
      ['a4', 'FAILED'],
    ])
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/emails-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/emails-store.ts`:

```ts
import { getAdminDb } from './firebase-admin'

export type EmailHubStatus = 'UNREAD' | 'READ' | 'CLEARED'

export type StoredActionStatus =
  | 'PROPOSED'
  | 'EDITING'
  | 'WRITING'
  | 'COMMITTED'
  | 'DISMISSED'
  | 'FAILED'
  | 'DISMISSED_BY_CLEAR'

export interface StoredAction {
  id: string
  status: StoredActionStatus
  googleId?: string
  errorMessage?: string
  // remaining fields (title, date, time, etc.) mirror the Phase 2 EmailAction shape
  [key: string]: unknown
}

export interface StoredEmail {
  id: string
  hubStatus: EmailHubStatus
  suggestedActions: StoredAction[]
  [key: string]: unknown
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('emails')
}

export async function getEmailState(uid: string, emailId: string): Promise<StoredEmail | null> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) return null
  return snap.data() as StoredEmail
}

export async function upsertEmailState(uid: string, email: StoredEmail): Promise<void> {
  await col(uid).doc(email.id).set(email, { merge: true })
}

export async function updateEmailHubStatus(
  uid: string,
  emailId: string,
  hubStatus: EmailHubStatus,
): Promise<void> {
  await col(uid).doc(emailId).set({ hubStatus }, { merge: true })
}

export async function updateActionStatus(
  uid: string,
  emailId: string,
  actionId: string,
  patch: Partial<StoredAction>,
): Promise<void> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) {
    throw new Error(`Email ${emailId} not found in Firestore`)
  }
  const data = snap.data() as StoredEmail
  const next = (data.suggestedActions ?? []).map((a) =>
    a.id === actionId ? { ...a, ...patch } : a,
  )
  await col(uid).doc(emailId).set({ suggestedActions: next }, { merge: true })
}

export async function markOrphanActionsDismissedByClear(
  uid: string,
  emailId: string,
): Promise<void> {
  const snap = await col(uid).doc(emailId).get()
  if (!snap.exists) return
  const data = snap.data() as StoredEmail
  const next = (data.suggestedActions ?? []).map((a) => {
    if (a.status === 'PROPOSED' || a.status === 'EDITING') {
      return { ...a, status: 'DISMISSED_BY_CLEAR' as const }
    }
    return a
  })
  await col(uid).doc(emailId).set({ suggestedActions: next }, { merge: true })
}
```

- [ ] **Step 4: Update inbox digest to seed this store**

Modify `src/server/trpc/routers/inbox.ts` so the `digest` query, after it resolves the AI-digested emails, calls `upsertEmailState` for each one (seeding `hubStatus: 'UNREAD'` and `suggestedActions` with `status: 'PROPOSED'` if the email was never persisted before). If the email already exists in the store, prefer the stored `hubStatus` and per-action `status`+`googleId` over the freshly-digested values — we don't want to revive a DISMISSED action or un-commit a COMMITTED one.

Concretely, inside `inbox.digest` after the `generateObject` + merge step:

```ts
import { getEmailState, upsertEmailState } from '@/lib/server/emails-store'

// ...inside the procedure, after `digested` is built...

const merged = await Promise.all(
  digested.map(async (email) => {
    const stored = await getEmailState(ctx.uid, email.id)
    if (!stored) {
      await upsertEmailState(ctx.uid, {
        ...email,
        hubStatus: 'UNREAD',
        suggestedActions: email.suggestedActions.map(a => ({ ...a, status: 'PROPOSED' })),
      } as StoredEmail)
      return { ...email, hubStatus: 'UNREAD' as const, suggestedActions: email.suggestedActions.map(a => ({ ...a, status: 'PROPOSED' as const })) }
    }
    // Merge: stored state wins for hubStatus + per-action status/googleId
    const storedActionById = new Map(stored.suggestedActions.map(a => [a.id, a]))
    return {
      ...email,
      hubStatus: stored.hubStatus,
      suggestedActions: email.suggestedActions.map(a => {
        const s = storedActionById.get(a.id)
        return s ? { ...a, status: s.status, googleId: s.googleId } : { ...a, status: 'PROPOSED' as const }
      }),
    }
  }),
)

return { emails: merged }
```

Do not remove the existing `generateObject` call; only add the stored-state merge on top of its output.

- [ ] **Step 5: Confirm pass**

Run: `npx jest tests/server/emails-store.test.ts`
Expected: PASS (4 tests).

Run: `npx jest tests/server/trpc/routers/inbox.test.ts`
Expected: existing Phase 2 tests still pass — update their mocks to stub `getEmailState: jest.fn().mockResolvedValue(null)` and verify `upsertEmailState` is called. If this breaks the snapshot of the existing test, regenerate it by hand in the same commit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/emails-store.ts tests/server/emails-store.test.ts src/server/trpc/routers/inbox.ts tests/server/trpc/routers/inbox.test.ts
git commit -m "feat(server): per-email Firestore state store + seed from inbox.digest"
```

---

### Task 4: Calendar writer

Raw-`fetch()` wrapper that POSTs to `/calendar/v3/calendars/primary/events`.

**Files:**
- Create: `src/lib/server/calendar-writer.ts`
- Create: `tests/server/calendar-writer.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/calendar-writer.test.ts`:

```ts
import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'

describe('createCalendarEvent', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('POSTs to /calendars/primary/events and returns the created event id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'evt-xyz', htmlLink: 'https://calendar.google.com/x' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createCalendarEvent('token123', {
      summary: 'Ellie zoo trip',
      description: 'Permission slip due',
      start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      location: 'SF Zoo',
    })

    expect(result).toEqual({ id: 'evt-xyz', htmlLink: 'https://calendar.google.com/x' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      Authorization: 'Bearer token123',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body)
    expect(body.summary).toBe('Ellie zoo trip')
    expect(body.start.timeZone).toBe('America/Los_Angeles')
  })

  it('throws CalendarWriteError with statusCode on 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Calendar access forbidden' } }),
    }) as unknown as typeof fetch

    await expect(
      createCalendarEvent('token123', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      }),
    ).rejects.toMatchObject({
      name: 'CalendarWriteError',
      statusCode: 403,
      message: expect.stringContaining('Calendar access forbidden'),
    })
  })

  it('throws CalendarWriteError with statusCode on 5xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Service unavailable' } }),
    }) as unknown as typeof fetch

    await expect(
      createCalendarEvent('t', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      }),
    ).rejects.toMatchObject({ statusCode: 503 })
  })

  it('passes CalendarWriteError instanceof Error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({}),
    }) as unknown as typeof fetch
    try {
      await createCalendarEvent('t', {
        summary: 'x',
        start: { dateTime: '2026-05-15T09:30:00-07:00', timeZone: 'America/Los_Angeles' },
        end: { dateTime: '2026-05-15T11:30:00-07:00', timeZone: 'America/Los_Angeles' },
      })
      fail('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CalendarWriteError)
    }
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/calendar-writer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/calendar-writer.ts`:

```ts
export interface CalendarEventInput {
  summary: string
  description?: string
  location?: string
  start: { dateTime: string; timeZone: string } | { date: string }
  end: { dateTime: string; timeZone: string } | { date: string }
}

export interface CalendarEventResult {
  id: string
  htmlLink?: string
}

export class CalendarWriteError extends Error {
  readonly name = 'CalendarWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function createCalendarEvent(
  accessToken: string,
  input: CalendarEventInput,
): Promise<CalendarEventResult> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Calendar write failed (${res.status})`
    throw new CalendarWriteError(msg, res.status)
  }

  const data = (await res.json()) as { id: string; htmlLink?: string }
  return { id: data.id, htmlLink: data.htmlLink }
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/calendar-writer.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/calendar-writer.ts tests/server/calendar-writer.test.ts
git commit -m "feat(server): calendar-writer with typed error on HTTP failures"
```

---

### Task 5: Calendar duplicate detection

Fuzzy-title match within ±2h of the proposed start, against `calendar.events.list`.

**Files:**
- Create: `src/lib/server/calendar-duplicate-check.ts`
- Create: `tests/server/calendar-duplicate-check.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/calendar-duplicate-check.test.ts`:

```ts
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'

describe('findDuplicateCalendarEvent', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('returns null when no events come back', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })

  it('returns the event when title matches case-insensitive in the window', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'evt-1',
            summary: 'ELLIE ZOO TRIP',
            start: { dateTime: '2026-05-15T10:00:00-07:00' },
          },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toEqual({
      id: 'evt-1',
      title: 'ELLIE ZOO TRIP',
      start: '2026-05-15T10:00:00-07:00',
    })
  })

  it('ignores events whose title is materially different', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'evt-1', summary: 'Dentist appointment', start: { dateTime: '2026-05-15T10:00:00-07:00' } },
        ],
      }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'Ellie zoo trip',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })

  it('queries the ±2h window via timeMin/timeMax', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [] }) })
    global.fetch = fetchMock as unknown as typeof fetch

    await findDuplicateCalendarEvent('token', {
      title: 'x',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    const url = new URL(fetchMock.mock.calls[0][0] as string)
    const timeMin = new Date(url.searchParams.get('timeMin')!).getTime()
    const timeMax = new Date(url.searchParams.get('timeMax')!).getTime()
    const start = new Date('2026-05-15T09:30:00-07:00').getTime()
    expect(start - timeMin).toBe(2 * 60 * 60 * 1000)
    expect(timeMax - start).toBe(2 * 60 * 60 * 1000)
  })

  it('returns null on API error instead of throwing (fail-open)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'oops' } }),
    }) as unknown as typeof fetch

    const result = await findDuplicateCalendarEvent('token', {
      title: 'x',
      startDateTime: '2026-05-15T09:30:00-07:00',
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/calendar-duplicate-check.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/calendar-duplicate-check.ts`:

```ts
const TWO_HOURS_MS = 2 * 60 * 60 * 1000

export interface DuplicateMatch {
  id: string
  title: string
  start: string
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isFuzzyMatch(a: string, b: string): boolean {
  const na = normalize(a)
  const nb = normalize(b)
  if (na === nb) return true
  // Containment match — "Ellie zoo trip" vs "Ellie's zoo trip (class A)"
  if (na.length >= 4 && nb.includes(na)) return true
  if (nb.length >= 4 && na.includes(nb)) return true
  return false
}

export async function findDuplicateCalendarEvent(
  accessToken: string,
  input: { title: string; startDateTime: string },
): Promise<DuplicateMatch | null> {
  const startMs = new Date(input.startDateTime).getTime()
  const timeMin = new Date(startMs - TWO_HOURS_MS).toISOString()
  const timeMax = new Date(startMs + TWO_HOURS_MS).toISOString()

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/primary/events` +
    `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&orderBy=startTime&maxResults=25`

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) return null
    const data = (await res.json()) as {
      items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }>
    }
    const match = (data.items ?? []).find(
      (e) => e.summary && isFuzzyMatch(e.summary, input.title),
    )
    if (!match) return null
    return {
      id: match.id,
      title: match.summary!,
      start: match.start?.dateTime ?? match.start?.date ?? '',
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/calendar-duplicate-check.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/calendar-duplicate-check.ts tests/server/calendar-duplicate-check.test.ts
git commit -m "feat(server): calendar duplicate detection (±2h fuzzy title match)"
```

---

### Task 6: Tasks writer + Gmail writer

Two simple writers grouped in one task to keep commit cadence tight.

**Files:**
- Create: `src/lib/server/tasks-writer.ts`
- Create: `src/lib/server/gmail-writer.ts`
- Create: `tests/server/tasks-writer.test.ts`
- Create: `tests/server/gmail-writer.test.ts`

- [ ] **Step 1: Tasks test first**

Create `tests/server/tasks-writer.test.ts`:

```ts
import { createTask, TasksWriteError, getDefaultTaskListId } from '@/lib/server/tasks-writer'

describe('tasks-writer', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('getDefaultTaskListId returns the first list id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ id: 'list-a' }, { id: 'list-b' }] }),
    }) as unknown as typeof fetch
    expect(await getDefaultTaskListId('token')).toBe('list-a')
  })

  it('getDefaultTaskListId throws TasksWriteError when no lists exist', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    }) as unknown as typeof fetch
    await expect(getDefaultTaskListId('token')).rejects.toBeInstanceOf(TasksWriteError)
  })

  it('createTask POSTs to /lists/{listId}/tasks and returns the id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'task-abc' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await createTask('token', 'list-a', {
      title: 'Sign permission slip',
      notes: 'From Audaucy',
      due: '2026-05-20T00:00:00.000Z',
    })
    expect(result).toEqual({ id: 'task-abc' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://tasks.googleapis.com/tasks/v1/lists/list-a/tasks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).title).toBe('Sign permission slip')
  })

  it('createTask throws TasksWriteError with statusCode on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'bad request' } }),
    }) as unknown as typeof fetch
    await expect(createTask('t', 'list-a', { title: 'x' })).rejects.toMatchObject({
      name: 'TasksWriteError',
      statusCode: 400,
    })
  })
})
```

- [ ] **Step 2: Tasks writer**

Create `src/lib/server/tasks-writer.ts`:

```ts
export interface TaskInput {
  title: string
  notes?: string
  due?: string // RFC3339; Google Tasks uses date-only precision but accepts full datetime
}

export interface TaskResult {
  id: string
}

export class TasksWriteError extends Error {
  readonly name = 'TasksWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function getDefaultTaskListId(accessToken: string): Promise<string> {
  const res = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new TasksWriteError(`Tasks list fetch failed (${res.status})`, res.status)
  }
  const data = (await res.json()) as { items?: Array<{ id: string }> }
  const first = data.items?.[0]
  if (!first) {
    throw new TasksWriteError('No task lists available', 404)
  }
  return first.id
}

export async function createTask(
  accessToken: string,
  listId: string,
  input: TaskInput,
): Promise<TaskResult> {
  const res = await fetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Tasks write failed (${res.status})`
    throw new TasksWriteError(msg, res.status)
  }
  const data = (await res.json()) as { id: string }
  return { id: data.id }
}
```

- [ ] **Step 3: Gmail test**

Create `tests/server/gmail-writer.test.ts`:

```ts
import { markMessageRead, GmailWriteError } from '@/lib/server/gmail-writer'

describe('gmail-writer', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('calls users.messages.modify with removeLabelIds: [UNREAD]', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'msg-1' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    await markMessageRead('token', 'msg-1')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/msg-1/modify')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ removeLabelIds: ['UNREAD'] })
  })

  it('throws GmailWriteError with statusCode on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'insufficient scope' } }),
    }) as unknown as typeof fetch
    await expect(markMessageRead('t', 'msg-1')).rejects.toMatchObject({
      name: 'GmailWriteError',
      statusCode: 403,
    })
  })
})
```

- [ ] **Step 4: Gmail writer**

Create `src/lib/server/gmail-writer.ts`:

```ts
export class GmailWriteError extends Error {
  readonly name = 'GmailWriteError'
  constructor(message: string, public readonly statusCode: number) {
    super(message)
  }
}

export async function markMessageRead(accessToken: string, messageId: string): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/modify`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const msg = data?.error?.message ?? `Gmail modify failed (${res.status})`
    throw new GmailWriteError(msg, res.status)
  }
}
```

- [ ] **Step 5: Run both**

Run: `npx jest tests/server/tasks-writer.test.ts tests/server/gmail-writer.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/tasks-writer.ts src/lib/server/gmail-writer.ts tests/server/tasks-writer.test.ts tests/server/gmail-writer.test.ts
git commit -m "feat(server): tasks-writer (createTask/getDefaultTaskListId) + gmail-writer (markMessageRead)"
```

---

### Task 7: Action resolver

Single helper used by every commit procedure. Resolves email → action → account → access token, or throws a typed `TRPCError`.

**Files:**
- Create: `src/lib/server/action-resolver.ts`
- Create: `tests/server/action-resolver.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/action-resolver.test.ts`:

```ts
import { resolveActionContext } from '@/lib/server/action-resolver'
import { getEmailState } from '@/lib/server/emails-store'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/emails-store')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')

describe('resolveActionContext', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns { action, email, account, accessToken } on success', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1',
      accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })

    const result = await resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' })
    expect(result.action.id).toBe('act1')
    expect(result.accessToken).toBe('at')
    expect(result.account.email).toBe('mary@tribe.ai')
  })

  it('throws NOT_FOUND when the email is missing from Firestore', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue(null)
    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws NOT_FOUND when the action id is not on the email', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1', suggestedActions: [],
    })
    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('throws UNAUTHORIZED when refresh token is missing (account removed)', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue(null)

    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('throws UNAUTHORIZED when refreshAccessToken fails (re-link needed)', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1',
      suggestedActions: [{ id: 'act1', type: 'CALENDAR_EVENT', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockRejectedValue(new Error('invalid_grant'))

    await expect(
      resolveActionContext({ uid: 'u1', emailId: 'e1', actionId: 'act1' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/action-resolver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/action-resolver.ts`:

```ts
import { TRPCError } from '@trpc/server'
import { getEmailState, type StoredAction, type StoredEmail } from './emails-store'
import { listAccounts, getDecryptedRefreshToken, type Account } from './accounts'
import { refreshAccessToken } from './google-oauth'

export interface ActionContext {
  email: StoredEmail
  action: StoredAction
  account: Account
  accessToken: string
}

export async function resolveActionContext(input: {
  uid: string
  emailId: string
  actionId: string
}): Promise<ActionContext> {
  const email = await getEmailState(input.uid, input.emailId)
  if (!email) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Email ${input.emailId} not found` })
  }
  const action = email.suggestedActions.find((a) => a.id === input.actionId)
  if (!action) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `Action ${input.actionId} not on email ${input.emailId}` })
  }

  const accounts = await listAccounts(input.uid)
  const accountId = (email.accountId as string | undefined) ?? accounts[0]?.id
  const account = accounts.find((a) => a.id === accountId)
  if (!account) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Account for this email is no longer linked. Please re-add the Google account.',
    })
  }

  const rt = await getDecryptedRefreshToken(input.uid, account.id)
  if (!rt) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Missing refresh token. Please re-add the Google account.',
    })
  }

  try {
    const { accessToken } = await refreshAccessToken(rt)
    return { email, action, account, accessToken }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'token refresh failed'
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: `Google token refresh failed (${message}). Please re-add the account.`,
    })
  }
}
```

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/action-resolver.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/action-resolver.ts tests/server/action-resolver.test.ts
git commit -m "feat(server): action-resolver helper shared by every commit procedure"
```

---

### Task 8: Actions router — happy path (commitCalendar, commitTask, dismiss)

Wire the four primitives (resolver, writers, tz helpers, idempotency) into tRPC procedures. This task covers the success paths; Task 9 covers failure + idempotency short-circuit + duplicate detection; Task 10 is the error matrix.

**Files:**
- Create: `src/server/trpc/routers/actions.ts`
- Create: `tests/server/trpc/routers/actions.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/trpc/routers/actions.test.ts`:

```ts
import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import {
  getIdempotencyRecord,
  setIdempotencyRecord,
  buildIdempotencyKey,
} from '@/lib/server/idempotency-store'
import { createCalendarEvent } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, getDefaultTaskListId } from '@/lib/server/tasks-writer'
import { updateActionStatus } from '@/lib/server/emails-store'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return {
    ...actual,
    getIdempotencyRecord: jest.fn(),
    setIdempotencyRecord: jest.fn(),
  }
})
jest.mock('@/lib/server/calendar-writer')
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/tasks-writer')
jest.mock('@/lib/server/emails-store')

describe('actions router — happy paths', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      accessToken: 'at',
      account: { id: 'a1', email: 'mary@tribe.ai' },
      email: { id: 'e1' },
      action: {
        id: 'act1',
        type: 'CALENDAR_EVENT',
        status: 'EDITING',
        title: 'Ellie zoo trip',
        date: Date.UTC(2026, 4, 15, 0, 0, 0),
        time: '09:30',
      },
    })
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'gcal-evt-1', htmlLink: 'https://x' })
    ;(getDefaultTaskListId as jest.Mock).mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockResolvedValue({ id: 'gt-1' })
    ;(setIdempotencyRecord as jest.Mock).mockResolvedValue(undefined)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('commitCalendar writes the event, stores googleId, returns the action', async () => {
    const caller = actionsRouter.createCaller({ uid: 'u1' })
    const result = await caller.commitCalendar({
      emailId: 'e1',
      actionId: 'act1',
      timeZone: 'America/Los_Angeles',
    })

    expect(createCalendarEvent).toHaveBeenCalledWith(
      'at',
      expect.objectContaining({
        summary: 'Ellie zoo trip',
        start: expect.objectContaining({ timeZone: 'America/Los_Angeles' }),
      }),
    )
    expect(setIdempotencyRecord).toHaveBeenCalledWith('u1', 'e1:act1', {
      googleId: 'gcal-evt-1',
      type: 'CALENDAR_EVENT',
    })
    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'COMMITTED', googleId: 'gcal-evt-1' }),
    )
    expect(result.action.status).toBe('COMMITTED')
    expect(result.action.googleId).toBe('gcal-evt-1')
  })

  it('commitTask writes a task on the default list, stores googleId', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      accessToken: 'at',
      account: { id: 'a1' },
      email: { id: 'e1' },
      action: {
        id: 'act1', type: 'TODO', status: 'EDITING',
        title: 'Sign permission slip', date: Date.UTC(2026, 4, 20, 0, 0, 0),
      },
    })
    const caller = actionsRouter.createCaller({ uid: 'u1' })
    const result = await caller.commitTask({
      emailId: 'e1',
      actionId: 'act1',
      timeZone: 'America/Los_Angeles',
    })
    expect(getDefaultTaskListId).toHaveBeenCalledWith('at')
    expect(createTask).toHaveBeenCalledWith(
      'at', 'list-a',
      expect.objectContaining({ title: 'Sign permission slip' }),
    )
    expect(setIdempotencyRecord).toHaveBeenCalledWith('u1', 'e1:act1', {
      googleId: 'gt-1', type: 'TODO',
    })
    expect(result.action.status).toBe('COMMITTED')
  })

  it('dismiss moves the action to DISMISSED without a Google write', async () => {
    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await caller.dismiss({ emailId: 'e1', actionId: 'act1' })
    expect(createCalendarEvent).not.toHaveBeenCalled()
    expect(createTask).not.toHaveBeenCalled()
    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      { status: 'DISMISSED' },
    )
  })

  it('commitCalendar rejects unauthenticated callers', async () => {
    const caller = actionsRouter.createCaller({})
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toThrow()
  })

  it('buildIdempotencyKey is used verbatim', () => {
    expect(buildIdempotencyKey('e1', 'act1')).toBe('e1:act1')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/server/trpc/routers/actions.ts`:

```ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import { resolveActionContext } from '@/lib/server/action-resolver'
import {
  buildIdempotencyKey,
  getIdempotencyRecord,
  setIdempotencyRecord,
} from '@/lib/server/idempotency-store'
import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, getDefaultTaskListId, TasksWriteError } from '@/lib/server/tasks-writer'
import { updateActionStatus, type StoredAction } from '@/lib/server/emails-store'
import { buildCalendarDateTime, buildCalendarAllDay } from '@/lib/server/tz-helpers'

const CommitInput = z.object({
  emailId: z.string().min(1),
  actionId: z.string().min(1),
  timeZone: z.string().min(1), // IANA, e.g. "America/Los_Angeles"
  force: z.boolean().optional(), // only read by commitCalendar
})

const DismissInput = z.object({
  emailId: z.string().min(1),
  actionId: z.string().min(1),
})

function mapErrorToTRPC(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err
  if (err instanceof CalendarWriteError || err instanceof TasksWriteError) {
    const status = err.statusCode
    if (status === 401) {
      return new TRPCError({ code: 'UNAUTHORIZED', message: err.message })
    }
    if (status >= 500) {
      // transient — server returns TIMEOUT so the client classifies it correctly
      return new TRPCError({ code: 'TIMEOUT', message: err.message })
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: err.message })
  }
  const message = err instanceof Error ? err.message : 'Unknown error'
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message })
}

export const actionsRouter = router({
  commitCalendar: protectedProcedure
    .input(CommitInput)
    .mutation(async ({ ctx, input }) => {
      const key = buildIdempotencyKey(input.emailId, input.actionId)

      // Idempotency short-circuit: if this key already committed, return the stored state.
      const existing = await getIdempotencyRecord(ctx.uid, key)
      if (existing && existing.type === 'CALENDAR_EVENT') {
        await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
          status: 'COMMITTED',
          googleId: existing.googleId,
        })
        return {
          action: {
            id: input.actionId,
            status: 'COMMITTED' as const,
            googleId: existing.googleId,
          },
        }
      }

      const { action, accessToken } = await resolveActionContext({
        uid: ctx.uid,
        emailId: input.emailId,
        actionId: input.actionId,
      })

      if (action.type !== 'CALENDAR_EVENT') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Action ${input.actionId} is not a CALENDAR_EVENT` })
      }

      const title = String(action.title ?? 'Untitled event')
      const dateEpochMs = Number(action.date ?? 0)
      const hasTime = typeof action.time === 'string' && action.time.length > 0

      const start = hasTime
        ? buildCalendarDateTime({ dateEpochMs, time: action.time as string, timeZone: input.timeZone })
        : buildCalendarAllDay({ dateEpochMs, timeZone: input.timeZone })

      // Duplicate detection (timed events only — all-day is ambiguous enough we skip it)
      if (hasTime && !input.force) {
        const startDateTime = (start as { dateTime: string }).dateTime
        const dupe = await findDuplicateCalendarEvent(accessToken, {
          title,
          startDateTime,
        })
        if (dupe) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `An event titled "${dupe.title}" already exists near that time`,
            cause: {
              existingEventId: dupe.id,
              existingTitle: dupe.title,
              existingStart: dupe.start,
            },
          })
        }
      }

      const end = hasTime
        ? buildCalendarDateTime({
            dateEpochMs,
            time: addOneHour(action.time as string),
            timeZone: input.timeZone,
          })
        : buildCalendarAllDay({ dateEpochMs, timeZone: input.timeZone })

      let googleEvent
      try {
        googleEvent = await createCalendarEvent(accessToken, {
          summary: title,
          description: typeof action.sourceQuote === 'string' ? `From email: "${action.sourceQuote}"` : undefined,
          location: typeof action.location === 'string' ? action.location : undefined,
          start,
          end,
        })
      } catch (err) {
        // leave the action in EDITING for 5xx; flip to FAILED for 4xx. The UI decides based on the code.
        if (err instanceof CalendarWriteError && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 401) {
          await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
            status: 'FAILED',
            errorMessage: err.message,
          })
        }
        throw mapErrorToTRPC(err)
      }

      await setIdempotencyRecord(ctx.uid, key, {
        googleId: googleEvent.id,
        type: 'CALENDAR_EVENT',
      })
      await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
        status: 'COMMITTED',
        googleId: googleEvent.id,
      })

      return {
        action: {
          id: input.actionId,
          status: 'COMMITTED' as const,
          googleId: googleEvent.id,
        },
      }
    }),

  commitTask: protectedProcedure
    .input(CommitInput)
    .mutation(async ({ ctx, input }) => {
      const key = buildIdempotencyKey(input.emailId, input.actionId)

      const existing = await getIdempotencyRecord(ctx.uid, key)
      if (existing && existing.type === 'TODO') {
        await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
          status: 'COMMITTED',
          googleId: existing.googleId,
        })
        return {
          action: {
            id: input.actionId,
            status: 'COMMITTED' as const,
            googleId: existing.googleId,
          },
        }
      }

      const { action, accessToken } = await resolveActionContext({
        uid: ctx.uid,
        emailId: input.emailId,
        actionId: input.actionId,
      })

      if (action.type !== 'TODO') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Action ${input.actionId} is not a TODO` })
      }

      const title = String(action.title ?? 'Untitled task')
      const dateEpochMs = typeof action.date === 'number' ? action.date : null
      const due = dateEpochMs !== null
        ? new Date(dateEpochMs).toISOString().split('T')[0] + 'T00:00:00.000Z' // Google Tasks uses date-only
        : undefined

      let listId: string
      try {
        listId = await getDefaultTaskListId(accessToken)
      } catch (err) {
        throw mapErrorToTRPC(err)
      }

      let googleTask
      try {
        googleTask = await createTask(accessToken, listId, {
          title,
          notes: typeof action.sourceQuote === 'string' ? `From email: "${action.sourceQuote}"` : undefined,
          due,
        })
      } catch (err) {
        if (err instanceof TasksWriteError && err.statusCode >= 400 && err.statusCode < 500 && err.statusCode !== 401) {
          await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
            status: 'FAILED',
            errorMessage: err.message,
          })
        }
        throw mapErrorToTRPC(err)
      }

      await setIdempotencyRecord(ctx.uid, key, {
        googleId: googleTask.id,
        type: 'TODO',
      })
      await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
        status: 'COMMITTED',
        googleId: googleTask.id,
      })

      return {
        action: {
          id: input.actionId,
          status: 'COMMITTED' as const,
          googleId: googleTask.id,
        },
      }
    }),

  dismiss: protectedProcedure
    .input(DismissInput)
    .mutation(async ({ ctx, input }) => {
      await updateActionStatus(ctx.uid, input.emailId, input.actionId, {
        status: 'DISMISSED',
      })
      return {
        action: { id: input.actionId, status: 'DISMISSED' as const } satisfies Partial<StoredAction>,
      }
    }),

  retry: protectedProcedure
    .input(CommitInput)
    .mutation(async ({ ctx, input }) => {
      // Thin wrapper: look at the action's type and dispatch to the same logic.
      const email = await resolveActionContext({
        uid: ctx.uid,
        emailId: input.emailId,
        actionId: input.actionId,
      })
      if (email.action.type === 'CALENDAR_EVENT') {
        // Re-invoke the same procedure body via the caller
        return actionsRouter.createCaller(ctx).commitCalendar(input)
      }
      if (email.action.type === 'TODO') {
        return actionsRouter.createCaller(ctx).commitTask(input)
      }
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: `Action type ${String(email.action.type)} is not retryable`,
      })
    }),
})

function addOneHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const next = (h + 1) % 24
  return `${String(next).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
```

- [ ] **Step 4: Mount on root**

Edit `src/server/trpc/root.ts`:

```ts
import { actionsRouter } from './routers/actions'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
  calendars: calendarsRouter,
  gmail: gmailRouter,
  tasks: tasksRouter,
  inbox: inboxRouter,
  actions: actionsRouter,
})
```

- [ ] **Step 5: Confirm pass**

Run: `npx jest tests/server/trpc/routers/actions.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/actions.ts src/server/trpc/root.ts tests/server/trpc/routers/actions.test.ts
git commit -m "feat(trpc): actions.commitCalendar + commitTask + dismiss + retry"
```

---

### Task 9: Idempotency + duplicate detection integration tests

Prove the two features actually work end-to-end through the router's `createCaller` — not just the primitives.

**Files:**
- Create: `tests/server/trpc/routers/actions-idempotency.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/server/trpc/routers/actions-idempotency.test.ts`:

```ts
import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import { getIdempotencyRecord, setIdempotencyRecord } from '@/lib/server/idempotency-store'
import { createCalendarEvent } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { updateActionStatus } from '@/lib/server/emails-store'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return { ...actual, getIdempotencyRecord: jest.fn(), setIdempotencyRecord: jest.fn() }
})
jest.mock('@/lib/server/calendar-writer')
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/emails-store')

const baseContext = {
  accessToken: 'at',
  account: { id: 'a1', email: 'mary@tribe.ai' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'CALENDAR_EVENT', status: 'EDITING',
    title: 'Ellie zoo trip', date: Date.UTC(2026, 4, 15, 0, 0, 0), time: '09:30',
  },
}

describe('actions router — idempotency + duplicate detection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(resolveActionContext as jest.Mock).mockResolvedValue(baseContext)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(createCalendarEvent as jest.Mock).mockResolvedValue({ id: 'gcal-1' })
    ;(setIdempotencyRecord as jest.Mock).mockResolvedValue(undefined)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('second call with same key returns stored googleId without hitting Google', async () => {
    ;(getIdempotencyRecord as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ googleId: 'gcal-1', type: 'CALENDAR_EVENT', committedAt: 1 })

    const caller = actionsRouter.createCaller({ uid: 'u1' })

    const first = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })
    const second = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })

    expect(first.action.googleId).toBe('gcal-1')
    expect(second.action.googleId).toBe('gcal-1')
    expect(createCalendarEvent).toHaveBeenCalledTimes(1) // only the first call wrote to Google
  })

  it('duplicate detection throws CONFLICT with structured cause', async () => {
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue({
      id: 'existing-evt-1',
      title: 'Ellie zoo trip',
      start: '2026-05-15T10:00:00-07:00',
    })

    const caller = actionsRouter.createCaller({ uid: 'u1' })

    await expect(
      caller.commitCalendar({
        emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      cause: {
        existingEventId: 'existing-evt-1',
        existingTitle: 'Ellie zoo trip',
        existingStart: '2026-05-15T10:00:00-07:00',
      },
    })
    expect(createCalendarEvent).not.toHaveBeenCalled()
  })

  it('force: true bypasses duplicate detection and still writes', async () => {
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue({
      id: 'existing-evt-1', title: 'Ellie zoo trip', start: '2026-05-15T10:00:00-07:00',
    })

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    const result = await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles', force: true,
    })

    expect(result.action.googleId).toBe('gcal-1')
    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
    // findDuplicateCalendarEvent should not even have been called because force short-circuits
    expect(findDuplicateCalendarEvent).not.toHaveBeenCalled()
  })

  it('duplicate detection is skipped for all-day events (no time)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue({
      ...baseContext,
      action: { ...baseContext.action, time: undefined },
    })
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await caller.commitCalendar({
      emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles',
    })
    expect(findDuplicateCalendarEvent).not.toHaveBeenCalled()
    expect(createCalendarEvent).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run**

Run: `npx jest tests/server/trpc/routers/actions-idempotency.test.ts`
Expected: PASS (4 tests).

If a test fails because the router body does not short-circuit on the idempotency record, or because the `force` flag is not honored, fix the router — the test is the source of truth.

- [ ] **Step 3: Commit**

```bash
git add tests/server/trpc/routers/actions-idempotency.test.ts
git commit -m "test(actions): idempotency short-circuit + duplicate detection + force override"
```

---

### Task 10: Error-path integration tests

The error matrix from the spec spelled out as tests. This is the required "at least one task covers error-path integration tests explicitly" task.

**Files:**
- Create: `tests/server/trpc/routers/actions-errors.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/server/trpc/routers/actions-errors.test.ts`:

```ts
import { actionsRouter } from '@/server/trpc/routers/actions'
import { resolveActionContext } from '@/lib/server/action-resolver'
import { getIdempotencyRecord } from '@/lib/server/idempotency-store'
import { createCalendarEvent, CalendarWriteError } from '@/lib/server/calendar-writer'
import { findDuplicateCalendarEvent } from '@/lib/server/calendar-duplicate-check'
import { createTask, TasksWriteError } from '@/lib/server/tasks-writer'
import { updateActionStatus } from '@/lib/server/emails-store'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/action-resolver')
jest.mock('@/lib/server/idempotency-store', () => {
  const actual = jest.requireActual('@/lib/server/idempotency-store')
  return { ...actual, getIdempotencyRecord: jest.fn(), setIdempotencyRecord: jest.fn() }
})
jest.mock('@/lib/server/calendar-writer')
jest.mock('@/lib/server/calendar-duplicate-check')
jest.mock('@/lib/server/tasks-writer')
jest.mock('@/lib/server/emails-store')

const calendarAction = {
  accessToken: 'at',
  account: { id: 'a1' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'CALENDAR_EVENT', status: 'EDITING',
    title: 'Zoo', date: Date.UTC(2026, 4, 15, 0, 0, 0), time: '09:30',
  },
}

const taskAction = {
  accessToken: 'at',
  account: { id: 'a1' },
  email: { id: 'e1' },
  action: {
    id: 'act1', type: 'TODO', status: 'EDITING',
    title: 'Sign slip', date: Date.UTC(2026, 4, 20, 0, 0, 0),
  },
}

describe('actions router — error matrix', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getIdempotencyRecord as jest.Mock).mockResolvedValue(null)
    ;(findDuplicateCalendarEvent as jest.Mock).mockResolvedValue(null)
    ;(updateActionStatus as jest.Mock).mockResolvedValue(undefined)
  })

  it('5xx from Calendar → TIMEOUT; action is NOT flipped to FAILED (stays EDITING)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('boom', 503))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('network error (no HTTP status) → INTERNAL_SERVER_ERROR; stays EDITING', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new Error('ECONNRESET'))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('4xx (non-401) from Calendar → BAD_REQUEST; action flips to FAILED with message', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('bad summary', 400))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'bad summary' }),
    )
  })

  it('401 from Calendar → UNAUTHORIZED; action is NOT flipped to FAILED (token-refresh UX)', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(calendarAction)
    ;(createCalendarEvent as jest.Mock).mockRejectedValue(new CalendarWriteError('expired', 401))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })

  it('upstream refreshAccessToken failure → UNAUTHORIZED with re-link message', async () => {
    ;(resolveActionContext as jest.Mock).mockRejectedValue(
      new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Google token refresh failed (invalid_grant). Please re-add the account.',
      }),
    )

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitCalendar({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: expect.stringContaining('re-add'),
    })
  })

  it('4xx from Tasks → BAD_REQUEST; action flips to FAILED', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(taskAction)
    const { getDefaultTaskListId } = jest.requireMock('@/lib/server/tasks-writer') as {
      getDefaultTaskListId: jest.Mock; createTask: jest.Mock
    }
    getDefaultTaskListId.mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockRejectedValue(new TasksWriteError('forbidden', 403))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitTask({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(updateActionStatus).toHaveBeenCalledWith(
      'u1', 'e1', 'act1',
      expect.objectContaining({ status: 'FAILED', errorMessage: 'forbidden' }),
    )
  })

  it('5xx from Tasks → TIMEOUT; stays EDITING', async () => {
    ;(resolveActionContext as jest.Mock).mockResolvedValue(taskAction)
    const { getDefaultTaskListId } = jest.requireMock('@/lib/server/tasks-writer') as {
      getDefaultTaskListId: jest.Mock; createTask: jest.Mock
    }
    getDefaultTaskListId.mockResolvedValue('list-a')
    ;(createTask as jest.Mock).mockRejectedValue(new TasksWriteError('backend down', 502))

    const caller = actionsRouter.createCaller({ uid: 'u1' })
    await expect(
      caller.commitTask({ emailId: 'e1', actionId: 'act1', timeZone: 'UTC' }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })

    expect(updateActionStatus).not.toHaveBeenCalledWith(
      'u1', 'e1', 'act1', expect.objectContaining({ status: 'FAILED' }),
    )
  })
})
```

- [ ] **Step 2: Run**

Run: `npx jest tests/server/trpc/routers/actions-errors.test.ts`
Expected: PASS (7 tests). If any fail, the router's error mapping is wrong — fix `mapErrorToTRPC` or the conditional that flips actions to `FAILED`.

- [ ] **Step 3: Commit**

```bash
git add tests/server/trpc/routers/actions-errors.test.ts
git commit -m "test(actions): full error matrix (5xx, 4xx, 401, network, tasks)"
```

---

### Task 11: `inbox.markCleared` mutation

Composes: (1) set `hubStatus: CLEARED` in Firestore, (2) call Gmail `users.messages.modify` to remove `UNREAD`, (3) flip orphan PROPOSED/EDITING actions to `DISMISSED_BY_CLEAR`.

**Files:**
- Modify: `src/server/trpc/routers/inbox.ts`
- Create: `tests/server/trpc/routers/inbox-mark-cleared.test.ts`

- [ ] **Step 1: Write the test**

Create `tests/server/trpc/routers/inbox-mark-cleared.test.ts`:

```ts
import { inboxRouter } from '@/server/trpc/routers/inbox'
import {
  getEmailState,
  updateEmailHubStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { markMessageRead, GmailWriteError } from '@/lib/server/gmail-writer'

jest.mock('@/lib/server/emails-store')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-writer')

describe('inbox.markCleared', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getEmailState as jest.Mock).mockResolvedValue({
      id: 'e1', accountId: 'a1', hubStatus: 'UNREAD',
      suggestedActions: [{ id: 'act1', status: 'PROPOSED' }],
    })
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(markMessageRead as jest.Mock).mockResolvedValue(undefined)
    ;(updateEmailHubStatus as jest.Mock).mockResolvedValue(undefined)
    ;(markOrphanActionsDismissedByClear as jest.Mock).mockResolvedValue(undefined)
  })

  it('sets hubStatus=CLEARED, marks Gmail message read, flips orphan actions', async () => {
    const caller = inboxRouter.createCaller({ uid: 'u1' })
    const result = await caller.markCleared({ emailId: 'e1' })

    expect(updateEmailHubStatus).toHaveBeenCalledWith('u1', 'e1', 'CLEARED')
    expect(markMessageRead).toHaveBeenCalledWith('at', 'e1')
    expect(markOrphanActionsDismissedByClear).toHaveBeenCalledWith('u1', 'e1')
    expect(result).toEqual({ ok: true })
  })

  it('still flips hubStatus + orphans even when Gmail mark-read fails (non-fatal)', async () => {
    ;(markMessageRead as jest.Mock).mockRejectedValue(new GmailWriteError('scope', 403))

    const caller = inboxRouter.createCaller({ uid: 'u1' })
    const result = await caller.markCleared({ emailId: 'e1' })

    expect(updateEmailHubStatus).toHaveBeenCalledWith('u1', 'e1', 'CLEARED')
    expect(markOrphanActionsDismissedByClear).toHaveBeenCalledWith('u1', 'e1')
    expect(result.ok).toBe(true)
    expect(result.gmailMarkReadFailed).toBe(true)
  })

  it('throws NOT_FOUND when the email is not in Firestore', async () => {
    ;(getEmailState as jest.Mock).mockResolvedValue(null)
    const caller = inboxRouter.createCaller({ uid: 'u1' })
    await expect(caller.markCleared({ emailId: 'e1' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller({})
    await expect(caller.markCleared({ emailId: 'e1' })).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/inbox-mark-cleared.test.ts`
Expected: FAIL — `markCleared` doesn't exist on the router.

- [ ] **Step 3: Extend the router**

Edit `src/server/trpc/routers/inbox.ts` to append the mutation:

```ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import {
  getEmailState,
  updateEmailHubStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { markMessageRead } from '@/lib/server/gmail-writer'

// ...existing digest procedure above...

export const inboxRouter = router({
  // ...digest: protectedProcedure.query(...) [existing]

  markCleared: protectedProcedure
    .input(z.object({ emailId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const email = await getEmailState(ctx.uid, input.emailId)
      if (!email) {
        throw new TRPCError({ code: 'NOT_FOUND', message: `Email ${input.emailId} not found` })
      }

      // 1. Flip hubStatus
      await updateEmailHubStatus(ctx.uid, input.emailId, 'CLEARED')

      // 2. Orphan actions
      await markOrphanActionsDismissedByClear(ctx.uid, input.emailId)

      // 3. Gmail mark-as-read (best-effort; don't unwind if this fails)
      let gmailMarkReadFailed = false
      const accounts = await listAccounts(ctx.uid)
      const accountId = (email.accountId as string | undefined) ?? accounts[0]?.id
      const account = accounts.find((a) => a.id === accountId)
      if (account) {
        try {
          const rt = await getDecryptedRefreshToken(ctx.uid, account.id)
          if (rt) {
            const { accessToken } = await refreshAccessToken(rt)
            await markMessageRead(accessToken, input.emailId)
          } else {
            gmailMarkReadFailed = true
          }
        } catch {
          gmailMarkReadFailed = true
        }
      } else {
        gmailMarkReadFailed = true
      }

      return { ok: true as const, gmailMarkReadFailed }
    }),
})
```

Note: keep the existing `digest` procedure exactly as Phase 2 left it. Only add `markCleared` inside the same `router({ ... })` call, or refactor to a spread pattern — whichever matches the current file's style. **Do not** create a second `inboxRouter` export.

- [ ] **Step 4: Confirm pass**

Run: `npx jest tests/server/trpc/routers/inbox-mark-cleared.test.ts`
Expected: PASS (4 tests).

Run: `npx jest tests/server/trpc/routers/inbox.test.ts`
Expected: existing digest tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/inbox.ts tests/server/trpc/routers/inbox-mark-cleared.test.ts
git commit -m "feat(trpc): inbox.markCleared — hubStatus + gmail read + orphan-action bookkeeping"
```

---

### Task 12: Client hook — `useCommitAction` with optimistic update

Encapsulate the `snapshot → mutate → rollback → invalidate` dance so every action card looks clean.

**Files:**
- Create: `src/hooks/use-commit-action.ts`
- Create: `tests/hooks/use-commit-action.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/use-commit-action.test.tsx`:

```tsx
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import React from 'react'
import { trpc } from '@/lib/trpc/client'
import { useCommitAction } from '@/hooks/use-commit-action'

// A minimal in-process MSW-free fixture: stub fetch so tRPC calls resolve as we choose.
describe('useCommitAction', () => {
  const originalFetch = global.fetch

  function wrapper(children: React.ReactNode) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    const client = trpc.createClient({
      links: [httpBatchLink({ url: 'http://localhost/api/trpc', transformer: superjson })],
    })
    return (
      <trpc.Provider client={client} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    )
  }

  afterEach(() => { global.fetch = originalFetch })

  it('optimistically flips the action to WRITING, then COMMITTED on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ result: { data: { json: { action: { id: 'act1', status: 'COMMITTED', googleId: 'g1' } } } } }]),
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useCommitAction({ emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles' }),
      { wrapper: ({ children }) => wrapper(children) as React.ReactElement },
    )

    await act(async () => {
      await result.current.commitCalendar()
    })

    await waitFor(() => {
      expect(result.current.lastStatus).toBe('COMMITTED')
    })
  })

  it('rolls back to PROPOSED when the mutation rejects', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ([{ error: { json: { message: 'boom', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR' } } } }]),
    }) as unknown as typeof fetch

    const { result } = renderHook(
      () => useCommitAction({ emailId: 'e1', actionId: 'act1', timeZone: 'America/Los_Angeles' }),
      { wrapper: ({ children }) => wrapper(children) as React.ReactElement },
    )

    await act(async () => {
      try { await result.current.commitCalendar() } catch {}
    })

    await waitFor(() => {
      expect(result.current.lastStatus).toBe('PROPOSED') // rolled back
    })
    expect(result.current.errorMessage).toMatch(/boom/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/hooks/use-commit-action.test.tsx`
Expected: FAIL — hook does not exist.

- [ ] **Step 3: Implement the hook**

Create `src/hooks/use-commit-action.ts`:

```ts
"use client"

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import type { EmailActionStatus } from '@/lib/store'

type OptimisticPatch = { status: EmailActionStatus; googleId?: string }

export function useCommitAction(input: {
  emailId: string
  actionId: string
  timeZone: string
}) {
  const utils = trpc.useUtils()
  const [lastStatus, setLastStatus] = useState<EmailActionStatus>('PROPOSED')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function patchCache(patch: OptimisticPatch) {
    utils.inbox.digest.setData(undefined, (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        emails: prev.emails.map((e) =>
          e.id !== input.emailId
            ? e
            : {
                ...e,
                suggestedActions: e.suggestedActions.map((a) =>
                  a.id !== input.actionId ? a : { ...a, ...patch },
                ),
              },
        ),
      }
    })
  }

  async function withOptimistic(
    mutationCall: () => Promise<{ action: { status: EmailActionStatus; googleId?: string } }>,
  ) {
    setErrorMessage(null)
    const snapshot = utils.inbox.digest.getData()
    patchCache({ status: 'WRITING' })
    setLastStatus('WRITING')

    try {
      const res = await mutationCall()
      patchCache({ status: res.action.status, googleId: res.action.googleId })
      setLastStatus(res.action.status)
      // Invalidate to keep server authoritative after the optimistic update.
      await utils.inbox.digest.invalidate()
      return res
    } catch (err: unknown) {
      if (snapshot) utils.inbox.digest.setData(undefined, snapshot)
      setLastStatus('PROPOSED')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      throw err
    }
  }

  const commitCalendarMutation = trpc.actions.commitCalendar.useMutation()
  const commitTaskMutation = trpc.actions.commitTask.useMutation()
  const dismissMutation = trpc.actions.dismiss.useMutation()
  const retryMutation = trpc.actions.retry.useMutation()

  return {
    lastStatus,
    errorMessage,
    isPending:
      commitCalendarMutation.isPending ||
      commitTaskMutation.isPending ||
      dismissMutation.isPending ||
      retryMutation.isPending,
    async commitCalendar(opts?: { force?: boolean }) {
      return withOptimistic(() =>
        commitCalendarMutation.mutateAsync({ ...input, force: opts?.force }),
      )
    },
    async commitTask() {
      return withOptimistic(() => commitTaskMutation.mutateAsync(input))
    },
    async dismiss() {
      return withOptimistic(() =>
        dismissMutation.mutateAsync({ emailId: input.emailId, actionId: input.actionId }),
      )
    },
    async retry() {
      return withOptimistic(() => retryMutation.mutateAsync(input))
    },
  }
}
```

- [ ] **Step 4: Run and iterate**

Run: `npx jest tests/hooks/use-commit-action.test.tsx`
Expected: PASS (2 tests).

If the test complains about missing `@testing-library/react` in `package.json`, install it:

```bash
npm install --save-dev @testing-library/react @testing-library/dom jest-environment-jsdom
```

…and add `/** @jest-environment jsdom */` at the top of the test file. Only do this if `package.json` doesn't already have `@testing-library/react` (Phase 3 likely added it).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-commit-action.ts tests/hooks/use-commit-action.test.tsx
git commit -m "feat(client): useCommitAction hook with optimistic update + rollback"
```

---

### Task 13: Wire action card to `useCommitAction`

Assumes Phase 3 created `src/components/inbox/action-card.tsx`. If it did not, implement a minimal version here; otherwise edit in place.

**Files:**
- Modify: `src/components/inbox/action-card.tsx` (create if Phase 3 hasn't)
- Create: `src/components/inbox/duplicate-warning-dialog.tsx`

- [ ] **Step 1: Locate the action card**

Run: `ls src/components/inbox/`
If `action-card.tsx` exists, open it and find the existing commit/dismiss handlers. Replace them with the hook. If not, create a minimal new component at `src/components/inbox/action-card.tsx`:

```tsx
"use client"

import { useState } from 'react'
import { useCommitAction } from '@/hooks/use-commit-action'
import { DuplicateWarningDialog } from './duplicate-warning-dialog'
import type { Email, EmailAction } from '@/lib/store'

export function ActionCard({ email, action, timeZone }: {
  email: Email
  action: EmailAction
  timeZone: string
}) {
  const commit = useCommitAction({ emailId: email.id, actionId: action.id, timeZone })
  const [duplicate, setDuplicate] = useState<null | { existingEventId: string; existingTitle: string; existingStart: string }>(null)

  async function onCommit() {
    try {
      if (action.type === 'CALENDAR_EVENT') await commit.commitCalendar()
      else if (action.type === 'TODO') await commit.commitTask()
    } catch (err: unknown) {
      const trpcErr = err as { data?: { code?: string }; cause?: unknown; shape?: { data?: { cause?: unknown } } }
      if (trpcErr?.data?.code === 'CONFLICT') {
        // tRPC v11 surfaces `cause` via the shape; fall back to any path it might live at
        const cause = (trpcErr.cause ?? trpcErr.shape?.data?.cause) as typeof duplicate
        setDuplicate(cause ?? null)
      }
    }
  }

  async function onForceCommit() {
    setDuplicate(null)
    if (action.type === 'CALENDAR_EVENT') await commit.commitCalendar({ force: true })
  }

  const status = commit.lastStatus === 'PROPOSED' ? action.status : commit.lastStatus

  return (
    <div className="action-card" data-status={status}>
      <div className="title">{action.title}</div>

      {status === 'COMMITTED' && (
        <div className="committed-row">✓ Added to Google · <a href={googleLinkFor(action)} target="_blank" rel="noreferrer">open ↗</a></div>
      )}

      {status === 'FAILED' && (
        <div className="failed-row">
          <span className="error">{commit.errorMessage ?? 'Failed'}</span>
          <button onClick={() => commit.retry()} disabled={commit.isPending}>Retry</button>
          <button onClick={() => commit.dismiss()} disabled={commit.isPending}>Dismiss</button>
        </div>
      )}

      {(status === 'PROPOSED' || status === 'EDITING' || status === 'WRITING') && (
        <div className="actions-row">
          <button onClick={onCommit} disabled={commit.isPending}>
            {action.type === 'CALENDAR_EVENT' ? 'Add to Calendar' : 'Add to Tasks'}
          </button>
          <button onClick={() => commit.dismiss()} disabled={commit.isPending}>Dismiss</button>
        </div>
      )}

      {duplicate && (
        <DuplicateWarningDialog
          existingTitle={duplicate.existingTitle}
          existingStart={duplicate.existingStart}
          onCancel={() => setDuplicate(null)}
          onConfirm={onForceCommit}
        />
      )}
    </div>
  )
}

function googleLinkFor(action: EmailAction): string {
  if (action.type === 'CALENDAR_EVENT' && action.googleId) {
    return `https://calendar.google.com/calendar/event?eid=${encodeURIComponent(action.googleId)}`
  }
  if (action.type === 'TODO') return 'https://tasks.google.com/'
  return '#'
}
```

Note: if Phase 3 shipped a richer action card (with inline editing, confidence glyph, sourceQuote tooltip, etc.), keep those features — only swap the button-click handlers to call `commit.commitCalendar()` / `commit.commitTask()` / `commit.dismiss()` / `commit.retry()`, and replace the old disabled prop with `disabled={commit.isPending}`.

- [ ] **Step 2: Duplicate warning dialog**

Create `src/components/inbox/duplicate-warning-dialog.tsx`:

```tsx
"use client"

export function DuplicateWarningDialog({
  existingTitle,
  existingStart,
  onCancel,
  onConfirm,
}: {
  existingTitle: string
  existingStart: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const when = new Date(existingStart).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div role="dialog" aria-label="Duplicate event warning" className="duplicate-warning">
      <p>Looks like you already have <strong>{existingTitle}</strong> at {when}. Add anyway?</p>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>Add anyway</button>
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manual smoke** (only if a dev Google account is linked)

Run: `npm run dev`. Open `/inbox`, click "Add to Calendar" on an action. Verify the event appears in Google Calendar. Click again → button is disabled during the round-trip. After success, the row flips to the ✓ state. Click "Dismiss" on a different action → it collapses without a Google write.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/action-card.tsx src/components/inbox/duplicate-warning-dialog.tsx
git commit -m "feat(inbox): action-card wired to commit mutations with duplicate warning"
```

---

### Task 14: Wire email-detail Clear button to `markCleared`

**Files:**
- Modify: `src/components/inbox/email-detail.tsx` (created in Phase 3; verify path first)

- [ ] **Step 1: Locate the Clear button**

Run: `grep -rn "Clear" src/components/inbox/`
Expected: a `<button>Clear</button>` (or similar) in the email detail/reader pane. Note its current onClick handler.

- [ ] **Step 2: Wire the mutation**

Inside the component body, replace the existing handler with:

```tsx
const utils = trpc.useUtils()
const markCleared = trpc.inbox.markCleared.useMutation({
  onMutate: async (vars) => {
    await utils.inbox.digest.cancel()
    const snapshot = utils.inbox.digest.getData()
    utils.inbox.digest.setData(undefined, (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        emails: prev.emails.map((e) =>
          e.id === vars.emailId
            ? {
                ...e,
                hubStatus: 'CLEARED' as const,
                suggestedActions: e.suggestedActions.map((a) =>
                  a.status === 'PROPOSED' || a.status === 'EDITING'
                    ? { ...a, status: 'DISMISSED_BY_CLEAR' as const }
                    : a,
                ),
              }
            : e,
        ),
      }
    })
    return { snapshot }
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.snapshot) utils.inbox.digest.setData(undefined, ctx.snapshot)
  },
  onSettled: () => {
    utils.inbox.digest.invalidate()
  },
})

async function onClear() {
  markCleared.mutate({ emailId: email.id })
}
```

Replace the Clear button's `onClick` with `onClear` and its `disabled` prop with `markCleared.isPending`.

- [ ] **Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`
Expected: zero errors.

Smoke: click Clear on an unread email. It disappears from the unread list instantly. Refresh → it stays cleared. Open Gmail → the message is no longer bold/unread.

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/email-detail.tsx
git commit -m "feat(inbox): Clear button wired to inbox.markCleared with optimistic update"
```

---

### Task 15: Full verification + merge prep

- [ ] **Step 1: Full suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: all green.

- [ ] **Step 2: Manual end-to-end smoke**

Log in. Open `/inbox`. Walk through each path:

1. **Calendar happy path.** Open an email with a `CALENDAR_EVENT` action. Click Add to Calendar. Open Google Calendar → event is present. Reload the Hub → action card shows ✓.
2. **Tasks happy path.** Same, but for a `TODO`.
3. **Idempotency.** After step 1, click Add to Calendar again (you may need to manually flip the stored status back to EDITING via Firestore console, or repeat the test on a fresh email and look at the Firestore `idempotencyKeys` collection — only one entry per `{emailId}:{actionId}`).
4. **Duplicate detection.** Create a Google Calendar event titled "Zoo" at noon tomorrow. Then trigger the commit for an action with the same title. The duplicate warning dialog appears. Click "Add anyway" → second event is created.
5. **4xx error.** Temporarily break the action: revoke Calendar scope in Google Account → OAuth apps, click Add to Calendar. Observe the FAILED state with inline error + Retry. Re-grant scope, click Retry, action succeeds.
6. **5xx simulation.** (Optional.) Use a network interceptor to return 503 from `/calendars/primary/events`. Observe the toast and that the action stays in EDITING.
7. **Clear flow.** Click Clear on an email with pending PROPOSED actions. The actions flip to `DISMISSED_BY_CLEAR` in Firestore; the Gmail message appears read in Gmail.

Record each ✅/❌ in the final commit message.

- [ ] **Step 3: Commit the verification note**

```bash
git commit --allow-empty -m "chore(phase-4): Google write flow verified end-to-end

Suite: tsc clean, jest green, lint clean.
Manual smoke:
- Calendar commit: ✅
- Tasks commit: ✅
- Idempotency (no duplicate on retry): ✅
- Duplicate detection + force override: ✅
- 4xx → FAILED + Retry → COMMITTED: ✅
- Clear → hubStatus + Gmail unread removed + orphan actions flipped: ✅"
```

- [ ] **Step 4: Open a PR**

Title:

> Phase 4: Google write flow — commit calendar/tasks, mark cleared, idempotency, duplicate detection

Body summary:
- Lists new procedures (`actions.commitCalendar`, `actions.commitTask`, `actions.dismiss`, `actions.retry`, `inbox.markCleared`)
- Lists new server libs (writers, duplicate check, idempotency store, emails store, tz helpers)
- Notes the new Firestore collections (`users/{uid}/emails`, `users/{uid}/idempotencyKeys`) and their security-rules implications (owner-only read/write, same rule as `accounts` and `profiles`)
- Confirms Phase 2 digest behavior is preserved (seed-on-first-read, stored state wins on subsequent reads)

---

## Post-Phase Verification

Before Phase 5 work starts on top of this branch:

1. `npx tsc --noEmit` — clean
2. `npx jest` — full suite green, minimum net new tests:
   - `tz-helpers` (4)
   - `idempotency-store` (4)
   - `emails-store` (4)
   - `calendar-writer` (4)
   - `calendar-duplicate-check` (5)
   - `tasks-writer` (4)
   - `gmail-writer` (2)
   - `action-resolver` (5)
   - `actions` router happy path (5)
   - `actions` idempotency + duplicate (4)
   - `actions` error matrix (7)
   - `inbox.markCleared` (4)
   - `useCommitAction` hook (2)
   - Total: **54+ new tests**
3. `npm run lint` — clean
4. Firestore inspection: after a successful commit, confirm `users/{uid}/emails/{emailId}` has `hubStatus` + per-action `status` + `googleId`, and `users/{uid}/idempotencyKeys/{emailId}:{actionId}` exists with `{ googleId, type, committedAt }`.

## What's Next

- **Phase 5:** PDF extraction — lazy-on-open extraction with Firestore cache. Reuses the `emails-store` module to attach extraction results to the email record.
- **Phase 6:** Reply sending — new `inbox.sendReply` mutation using `gmail.send`. Reuses the same optimistic-update pattern (`snapshot → mutate → rollback → invalidate`).
- **Phase 7:** Home widget — subscribes to `trpc.inbox.digest.useQuery()` and reuses `useCommitAction` for the compact action buttons.
