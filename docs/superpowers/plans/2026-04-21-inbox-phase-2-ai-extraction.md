# Inbox Redesign — Phase 2: AI Extraction + Sender Identity + Life Graph Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 2-action classifier with a richer AI extraction pipeline that emits (a) one of six email-level classifications, (b) zero or more editable actions with `sourceQuote` + `confidence`, and (c) a `senderIdentity` linking the email to a Life Graph person/org. Persist profiles to Firestore and add a learning loop so unknown domains can be remembered after user confirmation.

**Architecture:** Phase 2 is a data-layer + AI-pipeline refactor on top of the tRPC + TanStack Query baseline delivered by the architecture migration. The `inboxRouter.digest` procedure in `src/server/trpc/routers/inbox.ts` is rewritten end-to-end to emit a richer `Email` record (`classification`, `senderIdentity`, `hubStatus`, `suggestedActions` with `sourceQuote` + `confidence`). A new `profilesRouter` (`list`, `upsert`, `learnDomain`) replaces the legacy `/api/profiles` and `/api/profiles/learn-domain` Route Handlers. `EntityProfile` gains `knownDomains` / `knownSenders`, and profiles move from a hardcoded list in `src/lib/store.tsx` into Firestore with a seed on first read. A two-step sender-identity resolver runs server-side — direct lookup first (via `email-addresses` for parsing), then the LLM matches inferentially as part of the classification prompt. Dates flow into the prompt as ISO-local-time strings rendered with `date-fns-tz` — epoch milliseconds go in, human-readable ISO strings come out, DST is handled by the library. A small learning-loop banner in the existing `/inbox` UI lets the user confirm inferred domain matches, which invokes `trpc.profiles.learnDomain.useMutation()`. The client store consumes the new schema via the existing `trpc.inbox.digest.useQuery()` hook (set up in the architecture migration) plus new `trpc.profiles.*` hooks. The existing `/inbox` page keeps rendering via a thin compatibility shim (`src/lib/action-compat.ts`) mapping the new action status enum to the old `PENDING` / `APPROVED` / `DISMISSED` names. Phase 3 replaces the UI and drops the shim.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, `@tanstack/react-query` v5, Firebase Admin SDK (server), Firestore, `@ai-sdk/openai` + `ai` (`generateObject` with a Zod schema), `zod` v4, `date-fns` + `date-fns-tz` (NEW — ISO-local time in prompts), `email-addresses` (NEW — RFC-5322 From-header parsing), Jest + ts-jest.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "Data Model", "AI Extraction Pipeline", and "Sender identity matching" sections.

**Base branch:** Branch `feature/inbox-phase-2` off `main` *after* the `architecture/trpc-migration` branch merges. This plan assumes: (a) Phase 1 multi-account server infra is in place (`src/lib/server/accounts.ts`, `google-oauth.ts`, `gmail-fetcher.ts`, `session.ts`, `firebase-admin.ts`), and (b) the architecture migration is merged — specifically `src/server/trpc/index.ts` (builder + `protectedProcedure`), `src/server/trpc/context.ts`, `src/server/trpc/root.ts`, `src/server/trpc/routers/inbox.ts` (Phase-1-parity digest procedure), `src/app/api/trpc/[trpc]/route.ts`, `src/lib/trpc/client.ts`, `src/lib/trpc/provider.tsx`, and a `store.tsx` that consumes `trpc.*.useQuery()` hooks rather than hand-rolled `fetch` calls. If either (a) or (b) is missing, stop and resolve first.

---

## Before You Start — Read These

Next.js 16 has breaking changes, and tRPC's App Router patterns differ from most blog posts. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler conventions (still relevant for the unchanged `/api/auth/google/callback` + `/api/trpc/[trpc]` catch-all)
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- `docs/superpowers/plans/2026-04-21-architecture-trpc-react-query.md` — confirm the exact export surface of `router`, `protectedProcedure`, `createCaller`, and `trpc.useUtils()` before writing router/test code
- `https://trpc.io/docs/server/routers` (fetch via Context7 or WebFetch when ready) — `createCaller` invocation shape for tests
- Check `package.json` — `next`, `@trpc/server`, `@trpc/react-query`, `@tanstack/react-query` versions are pinned; confirm the docs match

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not assume patterns from memory.

If anything in this plan conflicts with the Next.js 16 docs, the tRPC v11 docs, or the architecture plan, follow the docs and update the plan.

---

## File Structure

### New files
- `src/lib/server/profiles.ts` — Firestore CRUD for `EntityProfile`; seed on first read
- `src/lib/server/sender-identity.ts` — `resolveDirectSenderIdentity(rawFrom, profiles)`; `parseFrom` backed by the `email-addresses` library
- `src/lib/server/classification-schema.ts` — shared Zod schema + TypeScript types for the new `Email` / `EmailAction` / `SenderIdentity` shape
- `src/lib/server/digest-prompt.ts` — prompt builder taking `rawEmails`, `profiles`, `preResolvedIdentities`, and a `now` reference; uses `date-fns-tz` to render ISO-local-time strings
- `src/server/trpc/routers/profiles.ts` — new tRPC router with `list`, `upsert`, `learnDomain` procedures
- `src/components/inbox/learn-domain-banner.tsx` — client component for the "Remember this domain?" prompt
- `src/lib/action-compat.ts` — compatibility shim translating new action status enum ↔ the old UI's `PENDING` / `APPROVED` / `DISMISSED`
- `tests/server/profiles.test.ts`
- `tests/server/sender-identity.test.ts`
- `tests/server/classification-schema.test.ts`
- `tests/server/digest-prompt.test.ts`
- `tests/server/trpc/routers/profiles.test.ts`
- `tests/server/trpc/routers/inbox.test.ts` — REPLACES the Phase-1-parity version from the architecture migration
- `tests/fixtures/emails-by-classification.ts` — fixture data for all 6 classifications
- `tests/fixtures/emails-by-classification.test.ts`
- `tests/lib/action-compat.test.ts`

### Modified files
- `src/lib/store.tsx` — `EntityProfile` gains `knownDomains` + `knownSenders`; `Email` gains `classification` + `senderIdentity` + `hubStatus` + richer `attachments`; `EmailAction` gains `sourceQuote` + `confidence` + new status enum; `initialProfiles` removed; profiles hydrate via `trpc.profiles.list.useQuery()`; `appendKnownDomain` wraps `trpc.profiles.learnDomain.useMutation()`
- `src/server/trpc/routers/inbox.ts` — full rewrite of the `digest` procedure: new Zod schema, sender resolver integration, new prompt, richer output, `hubStatus: 'UNREAD'` stamping
- `src/server/trpc/root.ts` — mount the new `profilesRouter` under `profiles`
- `src/app/inbox/page.tsx` — minimal updates to render via the compatibility shim + mount the learn-domain banner (no redesign; Phase 3 handles that)
- `src/app/page.tsx` — if it renders emails in the Bouncer widget with action-status checks, thread through the shim (verified during Task 14)
- `src/lib/server/gmail-fetcher.ts` — if it doesn't already surface attachment metadata, extend the returned shape
- `package.json` / `package-lock.json` — `date-fns`, `date-fns-tz`, `email-addresses`

### Out of scope for Phase 2
- Three-pane `/inbox` UI redesign (Phase 3)
- Real Google Calendar / Tasks commits (Phase 4)
- PDF extraction (Phase 5)
- Gmail reply sending (Phase 6)
- Home-widget redesign (Phase 7)

---

## Prerequisites (one-time)

These are environment/infrastructure items the implementing agent cannot do alone.

- [ ] **P1. Phase 1 merged.** Confirm `main` includes `src/lib/server/accounts.ts`, `google-oauth.ts`, `gmail-fetcher.ts`, `session.ts`, `firebase-admin.ts`, and encrypted refresh-token storage. Run `git log --oneline -40` and grep for "Merge feature/inbox-phase-1".
- [ ] **P2. Architecture migration merged.** Confirm `main` includes `src/server/trpc/index.ts`, `src/server/trpc/context.ts`, `src/server/trpc/root.ts`, `src/server/trpc/routers/inbox.ts` (Phase-1-parity), `src/server/trpc/routers/accounts.ts`, `src/app/api/trpc/[trpc]/route.ts`, `src/lib/trpc/client.ts`, `src/lib/trpc/provider.tsx`, and a `store.tsx` that imports from `@/lib/trpc/client`. If you do not see these files, stop and unblock the architecture migration first.
- [ ] **P3. Firestore rules for new collection.** The `users/{uid}/profiles/{profileId}` collection needs the same "owner can read/write" rule as accounts. If the project uses Firestore Security Rules, update `firestore.rules` in the same PR. (If rules live elsewhere, note the location and flag to Mary.)
- [ ] **P4. Environment variables.** No new env vars required; Phase 2 reuses `FIREBASE_ADMIN_SA_JSON`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`.
- [ ] **P5. Create the working branch.** Run `git checkout main && git pull && git checkout -b feature/inbox-phase-2`.
- [ ] **P6. Confirm baseline is green.** Run `npx tsc --noEmit && npx jest && npm run lint`. All three must pass before starting.

---

## Tasks

### Task 1: Install `date-fns` / `date-fns-tz` / `email-addresses`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install production deps**

Run:

```bash
npm install date-fns date-fns-tz email-addresses
npm install --save-dev @types/email-addresses
```

Expected: `package.json` gains `date-fns`, `date-fns-tz`, `email-addresses`, and the matching `@types/email-addresses` dev dep. `date-fns` and `date-fns-tz` ship their own types.

- [ ] **Step 2: Sanity check**

Run: `npx tsc --noEmit`
Expected: zero errors (no new code yet).

Run: `npx jest`
Expected: the existing baseline suite still passes.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add date-fns, date-fns-tz, email-addresses for Phase 2"
```

---

### Task 2: Extend shared TypeScript types

Expand `Email`, `EmailAction`, `EntityProfile`, and add `SenderIdentity` / `Attachment` in `src/lib/store.tsx` to match the spec. Keep existing fields so the current UI continues to render through the shim.

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Update `EntityProfile`**

In `src/lib/store.tsx`, replace the existing `EntityProfile` type definition with:

```ts
export type EntityProfile = {
  id: string
  name: string
  type: "Adult" | "Child" | "Pet"
  currentContext: string
  preferences: string[]
  routines: string[]
  sizes: Record<string, string>
  medicalNotes: string
  knownDomains?: string[]
  knownSenders?: string[]
}
```

- [ ] **Step 2: Add `SenderIdentity` and `Attachment` types**

Insert just above the existing `EmailAction` definition:

```ts
export type SenderIdentity = {
  personId?: string
  orgName?: string
  confidence: "low" | "medium" | "high"
}

export type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
}
```

- [ ] **Step 3: Replace `EmailAction` type**

Replace the existing `EmailAction` with:

```ts
export type EmailActionType = "CALENDAR_EVENT" | "TODO" | "NEEDS_REPLY"

export type EmailActionStatus =
  | "PROPOSED"
  | "EDITING"
  | "WRITING"
  | "COMMITTED"
  | "DISMISSED"
  | "FAILED"

export type EmailAction = {
  id: string
  type: EmailActionType
  title: string
  date?: number
  time?: string
  context?: string
  sourceQuote: string
  confidence: "low" | "medium" | "high"
  status: EmailActionStatus
  googleId?: string
}
```

Note: the old union `"CALENDAR_INVITE" | "TODO_ITEM" | "OTHER"` is intentionally removed. The shim in Task 3 handles UI translation.

- [ ] **Step 4: Replace `Email` type**

Replace the existing `Email` with:

```ts
export type EmailClassification =
  | "CALENDAR_EVENT"
  | "TODO"
  | "NEEDS_REPLY"
  | "WAITING_ON"
  | "FYI"
  | "NEWSLETTER"

export type EmailHubStatus = "UNREAD" | "READ" | "CLEARED"

export type Email = {
  id: string
  accountId?: string
  accountEmail?: string
  subject: string
  sender: string
  senderIdentity?: SenderIdentity
  classification: EmailClassification
  snippet: string
  fullBody: string
  attachments: Attachment[]
  suggestedActions: EmailAction[]
  date: number
  hubStatus: EmailHubStatus
}
```

- [ ] **Step 5: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: failures in `src/app/inbox/page.tsx` (old action status names) and possibly `src/lib/store.tsx` (old action type strings inside `actOnEmailAction`) and `src/app/page.tsx` (Bouncer widget). These are addressed in Tasks 3 and 13–14. Do not "fix" them yet.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(types): expand Email/EmailAction/EntityProfile for Phase 2"
```

---

### Task 3: Action-status compatibility shim

Give the existing UI something to render while the new status enum lands. The shim is temporary; Phase 3 deletes it when the UI is redesigned.

**Files:**
- Create: `src/lib/action-compat.ts`
- Create: `tests/lib/action-compat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/action-compat.test.ts`:

```ts
import {
  toLegacyStatus,
  fromLegacyStatus,
  isActionable,
} from '@/lib/action-compat'

describe('action-compat', () => {
  it('maps PROPOSED to PENDING (legacy)', () => {
    expect(toLegacyStatus('PROPOSED')).toBe('PENDING')
  })

  it('maps COMMITTED to APPROVED (legacy)', () => {
    expect(toLegacyStatus('COMMITTED')).toBe('APPROVED')
  })

  it('maps WRITING to PENDING (still actionable from UI perspective)', () => {
    expect(toLegacyStatus('WRITING')).toBe('PENDING')
  })

  it('maps DISMISSED/FAILED/EDITING through to legacy DISMISSED/APPROVED/PENDING', () => {
    expect(toLegacyStatus('DISMISSED')).toBe('DISMISSED')
    expect(toLegacyStatus('FAILED')).toBe('DISMISSED')
    expect(toLegacyStatus('EDITING')).toBe('PENDING')
  })

  it('round-trips legacy PENDING to PROPOSED', () => {
    expect(fromLegacyStatus('PENDING')).toBe('PROPOSED')
  })

  it('flags actionable statuses', () => {
    expect(isActionable('PROPOSED')).toBe(true)
    expect(isActionable('EDITING')).toBe(true)
    expect(isActionable('WRITING')).toBe(false)
    expect(isActionable('COMMITTED')).toBe(false)
    expect(isActionable('DISMISSED')).toBe(false)
    expect(isActionable('FAILED')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lib/action-compat.test.ts`
Expected: FAIL — `Cannot find module '@/lib/action-compat'`.

- [ ] **Step 3: Implement the shim**

Create `src/lib/action-compat.ts`:

```ts
import type { EmailActionStatus } from '@/lib/store'

export type LegacyStatus = 'PENDING' | 'APPROVED' | 'DISMISSED'

export function toLegacyStatus(status: EmailActionStatus): LegacyStatus {
  switch (status) {
    case 'PROPOSED':
    case 'EDITING':
    case 'WRITING':
      return 'PENDING'
    case 'COMMITTED':
      return 'APPROVED'
    case 'DISMISSED':
    case 'FAILED':
      return 'DISMISSED'
  }
}

export function fromLegacyStatus(status: LegacyStatus): EmailActionStatus {
  switch (status) {
    case 'PENDING':
      return 'PROPOSED'
    case 'APPROVED':
      return 'COMMITTED'
    case 'DISMISSED':
      return 'DISMISSED'
  }
}

export function isActionable(status: EmailActionStatus): boolean {
  return status === 'PROPOSED' || status === 'EDITING'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lib/action-compat.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Patch `/inbox` page to use the shim**

In `src/app/inbox/page.tsx`, add near the existing imports:

```ts
import { toLegacyStatus, isActionable } from "@/lib/action-compat"
```

Then replace each status check. Specifically:

- Replace `email.suggestedActions?.some(a => a.status === 'PENDING')` with `email.suggestedActions?.some(a => isActionable(a.status))`.
- Replace `action.status === 'PENDING'` (wherever it appears) with `isActionable(action.status)`.
- Replace any `Status: {action.status}` label with `Status: {toLegacyStatus(action.status)}`.
- If the file contains `action.type.replace('_', ' ')`, upgrade to `action.type.replace(/_/g, ' ')` so the new two-underscore types like `CALENDAR_EVENT` format correctly.

- [ ] **Step 6: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: `src/app/inbox/page.tsx` errors cleared. Remaining errors will be in `src/lib/store.tsx` (the `CALENDAR_INVITE` / `TODO_ITEM` branches inside `actOnEmailAction`) and possibly `src/app/page.tsx`. These are fixed in Tasks 13–14.

- [ ] **Step 7: Commit**

```bash
git add src/lib/action-compat.ts tests/lib/action-compat.test.ts src/app/inbox/page.tsx
git commit -m "feat(inbox): action-status compatibility shim + route existing UI through it"
```

---

### Task 4: Server-side `EntityProfile` Firestore CRUD

Move profiles out of the in-memory `initialProfiles` constant and into Firestore. Seed five starter profiles on first read for a new user.

**Files:**
- Create: `src/lib/server/profiles.ts`
- Create: `tests/server/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/profiles.test.ts`:

```ts
import { listProfiles, upsertProfile, appendKnownDomain } from '@/lib/server/profiles'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

const makeFakeDb = () => {
  const docs = new Map<string, Record<string, unknown>>()
  const mkDoc = (id: string) => ({
    id,
    get: async () => ({
      exists: docs.has(id),
      id,
      data: () => docs.get(id),
    }),
    set: async (d: Record<string, unknown>, opts?: { merge?: boolean }) => {
      docs.set(id, opts?.merge ? { ...(docs.get(id) ?? {}), ...d } : d)
    },
  })
  const col = {
    get: async () => ({ docs: Array.from(docs.entries()).map(([id, data]) => ({ id, data: () => data })) }),
    doc: (id: string) => mkDoc(id),
  }
  return {
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    docs,
  }
}

describe('server/profiles', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('returns empty array when no profiles exist yet (caller seeds)', async () => {
    const profiles = await listProfiles('uid-1')
    expect(profiles).toEqual([])
  })

  it('upserts a new profile', async () => {
    await upsertProfile('uid-1', {
      id: 'ellie',
      name: 'Ellie',
      type: 'Child',
      currentContext: '',
      preferences: [],
      routines: [],
      sizes: {},
      medicalNotes: '',
      knownDomains: ['blessedsacrament.org'],
    })
    const profiles = await listProfiles('uid-1')
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Ellie')
    expect(profiles[0].knownDomains).toEqual(['blessedsacrament.org'])
  })

  it('appends a knownDomain without duplicating', async () => {
    await upsertProfile('uid-1', {
      id: 'annie',
      name: 'Annie',
      type: 'Child',
      currentContext: '',
      preferences: [],
      routines: [],
      sizes: {},
      medicalNotes: '',
      knownDomains: ['audaucy.org'],
    })
    await appendKnownDomain('uid-1', 'annie', 'audaucy.org')
    await appendKnownDomain('uid-1', 'annie', 'audaucy.org')
    await appendKnownDomain('uid-1', 'annie', 'art.audaucy.org')
    const profiles = await listProfiles('uid-1')
    expect(profiles[0].knownDomains).toEqual(['audaucy.org', 'art.audaucy.org'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/profiles.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/profiles'`.

- [ ] **Step 3: Implement**

Create `src/lib/server/profiles.ts`:

```ts
import { getAdminDb } from './firebase-admin'
import type { EntityProfile } from '@/lib/store'

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('profiles')
}

export async function listProfiles(uid: string): Promise<EntityProfile[]> {
  const snap = await col(uid).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<EntityProfile, 'id'>) }))
}

export async function getProfile(uid: string, profileId: string): Promise<EntityProfile | null> {
  const d = await col(uid).doc(profileId).get()
  if (!d.exists) return null
  return { id: d.id, ...(d.data() as Omit<EntityProfile, 'id'>) }
}

export async function upsertProfile(uid: string, profile: EntityProfile): Promise<void> {
  const { id, ...rest } = profile
  await col(uid).doc(id).set(rest, { merge: true })
}

export async function appendKnownDomain(uid: string, profileId: string, domain: string): Promise<void> {
  const existing = await getProfile(uid, profileId)
  if (!existing) return
  const known = new Set(existing.knownDomains ?? [])
  known.add(domain.toLowerCase())
  await upsertProfile(uid, { ...existing, knownDomains: Array.from(known) })
}

export async function appendKnownSender(uid: string, profileId: string, sender: string): Promise<void> {
  const existing = await getProfile(uid, profileId)
  if (!existing) return
  const known = new Set(existing.knownSenders ?? [])
  known.add(sender)
  await upsertProfile(uid, { ...existing, knownSenders: Array.from(known) })
}

export const DEFAULT_SEED_PROFILES: EntityProfile[] = [
  { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'doug', name: 'Doug', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'annie', name: 'Annie', type: 'Child', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'ness', name: 'Ness', type: 'Pet', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

export async function seedProfilesIfEmpty(uid: string): Promise<EntityProfile[]> {
  const existing = await listProfiles(uid)
  if (existing.length > 0) return existing
  for (const p of DEFAULT_SEED_PROFILES) {
    await upsertProfile(uid, p)
  }
  return DEFAULT_SEED_PROFILES
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/profiles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/profiles.ts tests/server/profiles.test.ts
git commit -m "feat(profiles): Firestore CRUD + seed helper for EntityProfile"
```

---

### Task 5: Sender-identity direct resolver (backed by `email-addresses`)

Pure function: given a sender and the user's profile list, pick the Life Graph person/org by `knownDomains` / `knownSenders`. LLM-inferred matching happens in the prompt (Task 7), not here. The From-header parser uses `email-addresses.parseOneAddress()` — no hand-rolled regex.

**Files:**
- Create: `src/lib/server/sender-identity.ts`
- Create: `tests/server/sender-identity.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/sender-identity.test.ts`:

```ts
import { resolveDirectSenderIdentity, parseFrom } from '@/lib/server/sender-identity'
import type { EntityProfile } from '@/lib/store'

const profiles: EntityProfile[] = [
  {
    id: 'ellie', name: 'Ellie', type: 'Child',
    currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    knownDomains: ['blessedsacrament.org'],
    knownSenders: ['Ms. Redd <office@blessedsacrament.org>'],
  },
  {
    id: 'annie', name: 'Annie', type: 'Child',
    currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    knownDomains: ['audaucy.org'],
  },
]

describe('parseFrom', () => {
  it('parses "Name <email>"', () => {
    expect(parseFrom('Ms. Redd <office@blessedsacrament.org>')).toEqual({
      name: 'Ms. Redd',
      email: 'office@blessedsacrament.org',
    })
  })
  it('parses bare email', () => {
    expect(parseFrom('office@blessedsacrament.org')).toEqual({
      name: '',
      email: 'office@blessedsacrament.org',
    })
  })
  it('handles quoted names', () => {
    expect(parseFrom('"Ms. Redd" <office@blessedsacrament.org>')).toEqual({
      name: 'Ms. Redd',
      email: 'office@blessedsacrament.org',
    })
  })
  it('handles names with commas via quoted form', () => {
    expect(parseFrom('"Redd, Ms." <office@blessedsacrament.org>')).toEqual({
      name: 'Redd, Ms.',
      email: 'office@blessedsacrament.org',
    })
  })
  it('returns empty name+email for unparsable input', () => {
    expect(parseFrom('not an address at all')).toEqual({ name: '', email: '' })
  })
})

describe('resolveDirectSenderIdentity', () => {
  it('matches by exact known sender string → high confidence', () => {
    const match = resolveDirectSenderIdentity('Ms. Redd <office@blessedsacrament.org>', profiles)
    expect(match).toEqual({ personId: 'ellie', confidence: 'high' })
  })

  it('matches by domain when sender string is not on the known list → medium confidence', () => {
    const match = resolveDirectSenderIdentity('Principal <principal@blessedsacrament.org>', profiles)
    expect(match).toEqual({ personId: 'ellie', confidence: 'medium' })
  })

  it('matches subdomain against registered parent domain', () => {
    const match = resolveDirectSenderIdentity('<billing@accounts.audaucy.org>', profiles)
    expect(match).toEqual({ personId: 'annie', confidence: 'medium' })
  })

  it('returns null when unknown', () => {
    const match = resolveDirectSenderIdentity('Random <noreply@example.com>', profiles)
    expect(match).toBeNull()
  })

  it('is case-insensitive on email comparison', () => {
    const match = resolveDirectSenderIdentity('OFFICE@BlessedSacrament.ORG', profiles)
    expect(match?.personId).toBe('ellie')
  })

  it('returns null for unparsable From headers', () => {
    const match = resolveDirectSenderIdentity('not an address', profiles)
    expect(match).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/sender-identity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement using `email-addresses`**

Create `src/lib/server/sender-identity.ts`:

```ts
import addrs from 'email-addresses'
import type { EntityProfile, SenderIdentity } from '@/lib/store'

export interface ParsedFrom {
  name: string
  email: string
}

export function parseFrom(raw: string): ParsedFrom {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return { name: '', email: '' }
  const parsed = addrs.parseOneAddress(trimmed)
  if (!parsed || parsed.type !== 'mailbox') return { name: '', email: '' }
  return {
    name: (parsed.name ?? '').trim(),
    email: (parsed.address ?? '').trim(),
  }
}

function normalizeSenderString(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@')
  return at === -1 ? '' : email.slice(at + 1).toLowerCase()
}

function domainMatches(senderDomain: string, known: string): boolean {
  const k = known.toLowerCase()
  return senderDomain === k || senderDomain.endsWith(`.${k}`)
}

export function resolveDirectSenderIdentity(
  rawFrom: string,
  profiles: EntityProfile[]
): SenderIdentity | null {
  const { email } = parseFrom(rawFrom)
  if (!email) return null
  const senderDomain = domainOf(email)
  const senderNormal = normalizeSenderString(rawFrom)

  for (const p of profiles) {
    for (const known of p.knownSenders ?? []) {
      if (normalizeSenderString(known) === senderNormal) {
        return { personId: p.id, confidence: 'high' }
      }
    }
  }

  for (const p of profiles) {
    for (const known of p.knownDomains ?? []) {
      if (domainMatches(senderDomain, known)) {
        return { personId: p.id, confidence: 'medium' }
      }
    }
  }

  return null
}
```

Note: `email-addresses` returns `ParsedMailbox` when `parseOneAddress` succeeds on a single mailbox address. If the input is a group, the discriminant will be `'group'` — we bail to empty in that case. See the [library README](https://github.com/jackbearheart/email-addresses) if you hit an edge.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/sender-identity.test.ts`
Expected: PASS (11 tests — 5 in parseFrom, 6 in resolveDirectSenderIdentity).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/sender-identity.ts tests/server/sender-identity.test.ts
git commit -m "feat(inbox): direct sender-identity resolver backed by email-addresses"
```

---

### Task 6: Classification Zod schema

Shared schema module — consumed by the prompt builder, the `inbox.digest` procedure, and the fixtures. Keep enums as `as const` tuples so call sites can reflect on the value list.

**Files:**
- Create: `src/lib/server/classification-schema.ts`
- Create: `tests/server/classification-schema.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/classification-schema.test.ts`:

```ts
import { ClassifiedEmailsSchema, CLASSIFICATION_VALUES, ACTION_TYPE_VALUES } from '@/lib/server/classification-schema'

describe('ClassifiedEmailsSchema', () => {
  const valid = {
    emails: [
      {
        id: 'm1',
        classification: 'CALENDAR_EVENT',
        snippet: 'Zoo trip Thursday.',
        senderIdentity: { personId: 'ellie', confidence: 'high' },
        suggestedActions: [
          {
            id: 'a1',
            type: 'CALENDAR_EVENT',
            title: 'Zoo trip',
            date: 1_745_000_000_000,
            time: '8:00 AM',
            context: 'FAMILY',
            sourceQuote: 'Zoo trip Thursday 8am.',
            confidence: 'high',
          },
        ],
      },
    ],
  }

  it('accepts a valid payload', () => {
    expect(() => ClassifiedEmailsSchema.parse(valid)).not.toThrow()
  })

  it('rejects an unknown classification', () => {
    const bad = {
      emails: [{ ...valid.emails[0], classification: 'URGENT' }],
    }
    expect(() => ClassifiedEmailsSchema.parse(bad)).toThrow()
  })

  it('rejects an action without sourceQuote', () => {
    const bad = {
      emails: [{
        ...valid.emails[0],
        suggestedActions: [{ ...valid.emails[0].suggestedActions[0], sourceQuote: undefined }],
      }],
    }
    expect(() => ClassifiedEmailsSchema.parse(bad)).toThrow()
  })

  it('accepts NEWSLETTER with zero actions', () => {
    const news = {
      emails: [{
        id: 'm2',
        classification: 'NEWSLETTER',
        snippet: 'Weekly digest.',
        suggestedActions: [],
      }],
    }
    expect(() => ClassifiedEmailsSchema.parse(news)).not.toThrow()
  })

  it('enumerates all 6 classifications', () => {
    expect(CLASSIFICATION_VALUES).toEqual([
      'CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER',
    ])
  })

  it('enumerates all 3 action types', () => {
    expect(ACTION_TYPE_VALUES).toEqual(['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/classification-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/classification-schema.ts`:

```ts
import { z } from 'zod'

export const CLASSIFICATION_VALUES = [
  'CALENDAR_EVENT',
  'TODO',
  'NEEDS_REPLY',
  'WAITING_ON',
  'FYI',
  'NEWSLETTER',
] as const

export const ACTION_TYPE_VALUES = ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY'] as const

export const ConfidenceSchema = z.enum(['low', 'medium', 'high'])

export const SenderIdentitySchema = z.object({
  personId: z.string().optional(),
  orgName: z.string().optional(),
  confidence: ConfidenceSchema,
})

export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACTION_TYPE_VALUES),
  title: z.string().min(1),
  date: z.number().nullable().optional(),
  time: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  sourceQuote: z.string().min(1),
  confidence: ConfidenceSchema,
})

export const ClassifiedEmailSchema = z.object({
  id: z.string().min(1),
  classification: z.enum(CLASSIFICATION_VALUES),
  snippet: z.string(),
  senderIdentity: SenderIdentitySchema.optional(),
  suggestedActions: z.array(SuggestedActionSchema),
})

export const ClassifiedEmailsSchema = z.object({
  emails: z.array(ClassifiedEmailSchema),
})

export type ClassifiedEmail = z.infer<typeof ClassifiedEmailSchema>
export type SuggestedActionShape = z.infer<typeof SuggestedActionSchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/classification-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/classification-schema.ts tests/server/classification-schema.test.ts
git commit -m "feat(inbox): Zod schema for 6 classifications + 3 action types"
```

---

### Task 7: Digest prompt builder with `date-fns-tz`

Pure function that composes the LLM prompt from raw emails + profiles + pre-resolved identities + a reference `now`. Epoch-ms dates are rendered as ISO-local-time strings (`2026-04-21T08:00:00-04:00`) so the LLM never has to interpret raw epoch numbers and DST is handled by the library.

**Files:**
- Create: `src/lib/server/digest-prompt.ts`
- Create: `tests/server/digest-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/digest-prompt.test.ts`:

```ts
import { buildDigestPrompt } from '@/lib/server/digest-prompt'
import type { EntityProfile } from '@/lib/store'

describe('buildDigestPrompt', () => {
  const profiles: EntityProfile[] = [
    {
      id: 'ellie', name: 'Ellie', type: 'Child',
      currentContext: 'Gymnastics Tues/Thurs',
      preferences: [], routines: [], sizes: {},
      medicalNotes: 'Peanut allergy',
      knownDomains: ['blessedsacrament.org'],
    },
  ]

  const rawEmails = [
    {
      id: 'm1',
      subject: 'Zoo trip',
      sender: 'Ms. Redd <office@blessedsacrament.org>',
      snippet: 'Zoo Thu 8am',
      fullBody: 'Zoo trip Thursday 8am. Peanut-free lunches please.',
      date: 1_745_000_000_000,
      accountId: 'a1',
    },
  ]

  const preResolved: Record<string, { personId?: string; orgName?: string; confidence: string } | null> = {
    m1: { personId: 'ellie', confidence: 'medium' },
  }

  const now = new Date('2026-04-21T09:00:00-04:00')

  it('includes all six classification names verbatim', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER']) {
      expect(prompt).toContain(c)
    }
  })

  it('includes the three action type names verbatim', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toMatch(/action types.*CALENDAR_EVENT.*TODO.*NEEDS_REPLY/s)
  })

  it('embeds each Life Graph profile with knownDomains', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toContain('Ellie')
    expect(prompt).toContain('Peanut allergy')
    expect(prompt).toContain('blessedsacrament.org')
  })

  it('injects pre-resolved sender identity hints keyed by email id', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toMatch(/m1.*personId.*ellie/s)
  })

  it('contains the sourceQuote and no-invented-dates instructions', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt.toLowerCase()).toContain('sourcequote')
    expect(prompt.toLowerCase()).toContain('never invent')
  })

  it('renders email date as ISO-local string, not raw epoch ms', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    // 1_745_000_000_000 → 2025-04-18T12:53:20-04:00
    expect(prompt).toContain('2025-04-18T12:53:20-04:00')
    expect(prompt).not.toContain('1745000000000')
  })

  it('emits "now" as an ISO-local string including timezone offset', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt).toContain('2026-04-21T09:00:00-04:00')
    expect(prompt).toContain('America/New_York')
  })

  it('instructs the LLM to emit dates as epoch milliseconds even though the input is ISO', () => {
    const prompt = buildDigestPrompt({ rawEmails, profiles, preResolved, now, timeZone: 'America/New_York' })
    expect(prompt.toLowerCase()).toContain('epoch millisecond')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/digest-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/digest-prompt.ts`:

```ts
import { formatInTimeZone } from 'date-fns-tz'
import type { EntityProfile } from '@/lib/store'

export interface PromptRawEmail {
  id: string
  subject: string
  sender: string
  snippet?: string
  fullBody: string
  date: number
  accountId?: string
}

export interface PreResolvedIdentity {
  personId?: string
  orgName?: string
  confidence: string
}

export interface BuildDigestPromptInput {
  rawEmails: PromptRawEmail[]
  profiles: EntityProfile[]
  preResolved: Record<string, PreResolvedIdentity | null>
  now: Date
  timeZone: string
}

const ISO_LOCAL = "yyyy-MM-dd'T'HH:mm:ssxxx"

const SYSTEM = `You are a Chief of Staff AI. You classify the user's unread emails and extract committable actions.

Emit ONE classification per email from this enum:
- CALENDAR_EVENT — email implies a scheduled event (school trip, meeting, appointment)
- TODO — email implies a concrete to-do the user must act on
- NEEDS_REPLY — email requires a written reply
- WAITING_ON — user is waiting on someone else to respond or act
- FYI — informational, no action required
- NEWSLETTER — subscription content; auto-dimmed by the UI

Emit zero or more suggestedActions per email. Action types are exactly:
- CALENDAR_EVENT — fields: title, date (epoch milliseconds), time (12-hour "h:mm AM/PM"), context
- TODO — fields: title, date (due, epoch milliseconds or null), context
- NEEDS_REPLY — fields: title (the subject of the reply), context

WAITING_ON, FYI, and NEWSLETTER classifications MUST produce zero actions.

Rules:
- Every action MUST carry a sourceQuote — the exact sentence from the email that implied the action. Never paraphrase.
- Every action MUST carry a confidence value: "high", "medium", or "low".
- Never invent dates. If the email does not specify a date and you cannot infer one unambiguously, set date to null and use confidence "low".
- Match the sender to a Life Graph profile (personId) or organization (orgName) when possible. If the user has pre-resolved an identity for an email id (provided below), use it as a strong hint but override if the email content clearly points elsewhere — mark confidence accordingly.
- Dates you EMIT must be epoch milliseconds. Dates in the INPUT are rendered as ISO-8601 local-time strings with timezone offset — resolve relative references ("Thursday at 8am") against the "now" value provided and return the resulting instant as epoch milliseconds.
`

export function buildDigestPrompt(input: BuildDigestPromptInput): string {
  const { rawEmails, profiles, preResolved, now, timeZone } = input

  const profileBlock = profiles.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    currentContext: p.currentContext,
    medicalNotes: p.medicalNotes,
    knownDomains: p.knownDomains ?? [],
    knownSenders: p.knownSenders ?? [],
  }))

  const rawEmailsBlock = rawEmails.map(e => ({
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    snippet: e.snippet ?? '',
    fullBody: e.fullBody,
    sentAt: formatInTimeZone(new Date(e.date), timeZone, ISO_LOCAL),
    accountId: e.accountId,
  }))

  const nowBlock = {
    instant: formatInTimeZone(now, timeZone, ISO_LOCAL),
    timeZone,
  }

  return [
    SYSTEM,
    '',
    'NOW (use for relative-date resolution):',
    JSON.stringify(nowBlock, null, 2),
    '',
    'LIFE GRAPH PROFILES (reference for sender identity + context):',
    JSON.stringify(profileBlock, null, 2),
    '',
    'PRE-RESOLVED SENDER IDENTITIES (strong hints, keyed by email id):',
    JSON.stringify(preResolved, null, 2),
    '',
    'EMAILS TO CLASSIFY:',
    JSON.stringify(rawEmailsBlock, null, 2),
    '',
    'Return a single JSON object matching the schema: { emails: [...] }',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/digest-prompt.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/digest-prompt.ts tests/server/digest-prompt.test.ts
git commit -m "feat(inbox): digest prompt builder with date-fns-tz ISO-local dates"
```

---

### Task 8: Extend `gmail-fetcher` to surface attachments

The Phase 2 `Email` type carries `attachments: Attachment[]`. Confirm the fetcher returns them; extend it if not.

**Files:**
- Modify: `src/lib/server/gmail-fetcher.ts` (only if it doesn't already return attachments)
- Create or modify: `tests/server/gmail-fetcher.test.ts`

- [ ] **Step 1: Check current shape**

Run: `grep -n "attachments" src/lib/server/gmail-fetcher.ts`
Expected: if no match, proceed with Steps 2–5. If attachments are already returned (including `id`, `filename`, `mimeType`, `size`), skip to Step 6 and note it in the commit message.

- [ ] **Step 2: Write the failing test**

Create or extend `tests/server/gmail-fetcher.test.ts`:

```ts
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

const makeMessage = () => ({
  id: 'm1',
  internalDate: '1700000000000',
  snippet: 'Hi',
  payload: {
    headers: [
      { name: 'Subject', value: 'Permission slip' },
      { name: 'From', value: 'Ms. Redd <office@blessedsacrament.org>' },
    ],
    parts: [
      { mimeType: 'text/plain', body: { data: Buffer.from('Please sign').toString('base64') } },
      { mimeType: 'application/pdf', filename: 'permission.pdf', body: { attachmentId: 'at1', size: 1234 } },
    ],
  },
})

describe('fetchUnreadPrimary', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('returns attachment metadata alongside body text', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({ json: async () => ({ messages: [{ id: 'm1' }] }) })
      .mockResolvedValueOnce({ json: async () => makeMessage() }) as unknown as typeof fetch

    const out = await fetchUnreadPrimary('at')
    expect(out[0].attachments).toEqual([
      { id: 'at1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 1234 },
    ])
    expect(out[0].fullBody).toContain('Please sign')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest tests/server/gmail-fetcher.test.ts`
Expected: FAIL — either `out[0].attachments` is undefined or the shape is wrong.

- [ ] **Step 4: Implement**

In `src/lib/server/gmail-fetcher.ts`:

1. Extend the returned type:

```ts
export interface GmailEmail {
  id: string
  subject: string
  sender: string
  snippet: string
  fullBody: string
  date: number
  attachments: { id: string; filename: string; mimeType: string; size: number }[]
}
```

2. Add a recursive attachment extractor above the main parse loop:

```ts
interface GmailPayload {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPayload[]
}

const extractAttachments = (
  payload: GmailPayload | undefined
): { id: string; filename: string; mimeType: string; size: number }[] => {
  if (!payload) return []
  const out: { id: string; filename: string; mimeType: string; size: number }[] = []
  if (payload.body?.attachmentId && payload.filename) {
    out.push({
      id: payload.body.attachmentId,
      filename: payload.filename,
      mimeType: payload.mimeType ?? 'application/octet-stream',
      size: payload.body.size ?? 0,
    })
  }
  if (payload.parts) out.push(...payload.parts.flatMap(extractAttachments))
  return out
}
```

3. In the per-message return, include `attachments: extractAttachments(msgData.payload)`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/server/gmail-fetcher.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/gmail-fetcher.ts tests/server/gmail-fetcher.test.ts
git commit -m "feat(gmail-fetcher): surface attachment metadata for Phase 2"
```

If attachments were already surfaced, commit message: `chore(gmail-fetcher): confirm attachment metadata surfaces (no-op change)` and skip the file adds.

---

### Task 9: `profilesRouter` — tRPC `list`, `upsert`, `learnDomain` procedures

Replace the former `/api/profiles` + `/api/profiles/learn-domain` Route Handlers with a single tRPC router mounted at `appRouter.profiles`. Authorization is provided by `protectedProcedure` (sets `ctx.uid`).

**Files:**
- Create: `src/server/trpc/routers/profiles.ts`
- Create: `tests/server/trpc/routers/profiles.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/trpc/routers/profiles.test.ts`:

```ts
import { profilesRouter } from '@/server/trpc/routers/profiles'
import {
  seedProfilesIfEmpty,
  upsertProfile,
  listProfiles,
  appendKnownDomain,
} from '@/lib/server/profiles'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/profiles')

describe('profiles router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('list seeds + returns profiles for an authenticated caller', async () => {
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    const { profiles } = await caller.list()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].name).toBe('Mary')
    expect(seedProfilesIfEmpty).toHaveBeenCalledWith('mary-uid')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = profilesRouter.createCaller({})
    await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
  })

  it('upsert persists and returns the refreshed list', async () => {
    ;(upsertProfile as jest.Mock).mockResolvedValue(undefined)
    ;(listProfiles as jest.Mock).mockResolvedValue([
      { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.upsert({
      id: 'ellie', name: 'Ellie', type: 'Child',
      currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '',
    })
    expect(upsertProfile).toHaveBeenCalledWith('mary-uid', expect.objectContaining({ id: 'ellie' }))
    expect(result.profiles).toHaveLength(1)
  })

  it('upsert rejects payloads without a valid id', async () => {
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    await expect(
      caller.upsert({
        id: '', name: 'bad', type: 'Child',
        currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '',
      })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('learnDomain appends a new domain', async () => {
    ;(appendKnownDomain as jest.Mock).mockResolvedValue(undefined)
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.learnDomain({ profileId: 'annie', domain: 'art.audaucy.org' })
    expect(appendKnownDomain).toHaveBeenCalledWith('mary-uid', 'annie', 'art.audaucy.org')
    expect(result).toEqual({ ok: true })
  })

  it('learnDomain rejects a bare domain with protocol', async () => {
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    await expect(
      caller.learnDomain({ profileId: 'annie', domain: 'https://audaucy.org' })
    ).rejects.toBeInstanceOf(TRPCError)
  })

  it('learnDomain rejects missing profileId', async () => {
    const caller = profilesRouter.createCaller({ uid: 'mary-uid' })
    await expect(
      caller.learnDomain({ profileId: '', domain: 'audaucy.org' })
    ).rejects.toBeInstanceOf(TRPCError)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/trpc/routers/profiles.test.ts`
Expected: FAIL — `Cannot find module '@/server/trpc/routers/profiles'`.

- [ ] **Step 3: Implement the router**

Create `src/server/trpc/routers/profiles.ts`:

```ts
import { z } from 'zod'
import { router, protectedProcedure } from '../index'
import {
  listProfiles,
  upsertProfile,
  seedProfilesIfEmpty,
  appendKnownDomain,
} from '@/lib/server/profiles'

const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['Adult', 'Child', 'Pet']),
  currentContext: z.string(),
  preferences: z.array(z.string()),
  routines: z.array(z.string()),
  sizes: z.record(z.string(), z.string()),
  medicalNotes: z.string(),
  knownDomains: z.array(z.string()).optional(),
  knownSenders: z.array(z.string()).optional(),
})

const DomainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const LearnDomainInput = z.object({
  profileId: z.string().min(1),
  domain: z.string().regex(DomainRe, 'Expect a bare domain like "example.com"'),
})

export const profilesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profiles = await seedProfilesIfEmpty(ctx.uid)
    return { profiles }
  }),

  upsert: protectedProcedure
    .input(ProfileSchema)
    .mutation(async ({ ctx, input }) => {
      await upsertProfile(ctx.uid, input)
      const profiles = await listProfiles(ctx.uid)
      return { profiles }
    }),

  learnDomain: protectedProcedure
    .input(LearnDomainInput)
    .mutation(async ({ ctx, input }) => {
      await appendKnownDomain(ctx.uid, input.profileId, input.domain.toLowerCase())
      return { ok: true as const }
    }),
})
```

- [ ] **Step 4: Mount on `appRouter`**

Edit `src/server/trpc/root.ts`. Add the import and register the router alongside the existing ones:

```ts
import { profilesRouter } from './routers/profiles'

export const appRouter = router({
  // ... existing routers (accounts, auth, calendar, calendars, gmail, tasks, inbox) ...
  profiles: profilesRouter,
})

export type AppRouter = typeof appRouter
```

Preserve the alphabetical/logical ordering already established by the architecture migration — the only change is inserting `profiles`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/server/trpc/routers/profiles.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Confirm full type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from the router itself. Any remaining errors are pre-existing (addressed in later tasks).

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/profiles.ts src/server/trpc/root.ts tests/server/trpc/routers/profiles.test.ts
git commit -m "feat(trpc): profiles.list + profiles.upsert + profiles.learnDomain"
```

---

### Task 10: Rewrite `inboxRouter.digest` with Phase 2 pipeline

Rewrite the Phase-1-parity `digest` procedure created by the architecture migration. New behavior: fetch per-account → seed profiles → pre-resolve direct sender identities → build the ISO-local-time prompt → call LLM with `ClassifiedEmailsSchema` → merge → stamp `hubStatus: 'UNREAD'` + `status: 'PROPOSED'`.

**Files:**
- Modify: `src/server/trpc/routers/inbox.ts` (full rewrite of the procedure body + schema)
- Modify: `tests/server/trpc/routers/inbox.test.ts` (rewrite to cover the new output shape)

- [ ] **Step 1: Rewrite the router test**

Replace the entire contents of `tests/server/trpc/routers/inbox.test.ts` with:

```ts
import { inboxRouter } from '@/server/trpc/routers/inbox'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import { seedProfilesIfEmpty } from '@/lib/server/profiles'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('@/lib/server/profiles')
jest.mock('ai', () => ({ generateObject: jest.fn() }))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

const baseRaw = {
  id: 'm1',
  subject: 'Zoo trip',
  sender: 'Ms. Redd <office@blessedsacrament.org>',
  snippet: 'Zoo Thursday',
  fullBody: 'Zoo trip Thursday 8am. Peanut-free lunches please.',
  date: 1_745_000_000_000,
  attachments: [] as { id: string; filename: string; mimeType: string; size: number }[],
}

const baseClassified = {
  id: 'm1',
  classification: 'CALENDAR_EVENT',
  snippet: 'Zoo trip with Ellie on Thursday.',
  senderIdentity: { personId: 'ellie', confidence: 'high' },
  suggestedActions: [
    {
      id: 'a1',
      type: 'CALENDAR_EVENT',
      title: 'Zoo trip',
      date: 1_745_000_000_000,
      time: '8:00 AM',
      context: 'FAMILY',
      sourceQuote: 'Zoo trip Thursday 8am.',
      confidence: 'high',
    },
  ],
}

describe('inbox router (Phase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([baseRaw])
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      {
        id: 'ellie', name: 'Ellie', type: 'Child',
        currentContext: '', preferences: [], routines: [], sizes: {},
        medicalNotes: 'Peanut allergy',
        knownDomains: ['blessedsacrament.org'],
      },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({ object: { emails: [baseClassified] } })
  })

  it('returns richer Email records with classification, senderIdentity, hubStatus, sourceQuote', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    const e = emails[0]
    expect(e.id).toBe('m1')
    expect(e.classification).toBe('CALENDAR_EVENT')
    expect(e.senderIdentity).toEqual({ personId: 'ellie', confidence: 'high' })
    expect(e.hubStatus).toBe('UNREAD')
    expect(e.suggestedActions[0].sourceQuote).toBe('Zoo trip Thursday 8am.')
    expect(e.suggestedActions[0].status).toBe('PROPOSED')
    expect(e.accountId).toBe('a1')
    expect(e.accountEmail).toBe('mary@tribe.ai')
  })

  it('returns empty array when no accounts return emails (does not call the LLM)', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([])
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.digest()
    expect(emails).toEqual([])
    expect(aiModule.generateObject).not.toHaveBeenCalled()
  })

  it('pre-resolves sender identity from knownDomains and passes it to the prompt', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await caller.digest()
    const options = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(options.prompt).toMatch(/"personId": "ellie"/)
    expect(options.prompt).toMatch(/"confidence": "medium"/)
  })

  it('renders email send-time as ISO-local string in the prompt (no raw epoch ms)', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await caller.digest()
    const options = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(options.prompt).toMatch(/2025-04-18T/)
    expect(options.prompt).not.toContain('1745000000000')
  })

  it('stamps every email with hubStatus=UNREAD even if the LLM omits senderIdentity', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { emails: [{ ...baseClassified, senderIdentity: undefined }] },
    })
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.digest()
    expect(emails[0].hubStatus).toBe('UNREAD')
    expect(emails[0].senderIdentity).toBeUndefined()
  })

  it('preserves fullBody / attachments / accountEmail from the raw fetch', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { ...baseRaw, attachments: [{ id: 'at1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 1234 }] },
    ])
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.digest()
    expect(emails[0].fullBody).toContain('Zoo trip Thursday')
    expect(emails[0].attachments).toHaveLength(1)
    expect(emails[0].attachments[0].filename).toBe('permission.pdf')
    expect(emails[0].accountEmail).toBe('mary@tribe.ai')
  })

  it('rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller({})
    await expect(caller.digest()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run the failing test**

Run: `npx jest tests/server/trpc/routers/inbox.test.ts`
Expected: FAIL — the Phase-1-parity procedure returns the old schema (no `classification`, no `hubStatus`, no `senderIdentity`).

- [ ] **Step 3: Rewrite the procedure**

Replace `src/server/trpc/routers/inbox.ts` entirely with:

```ts
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import { seedProfilesIfEmpty } from '@/lib/server/profiles'
import { resolveDirectSenderIdentity } from '@/lib/server/sender-identity'
import {
  buildDigestPrompt,
  type PreResolvedIdentity,
  type PromptRawEmail,
} from '@/lib/server/digest-prompt'
import { ClassifiedEmailsSchema } from '@/lib/server/classification-schema'

const DEFAULT_TIMEZONE = process.env.HUB_DEFAULT_TIMEZONE ?? 'America/New_York'

export const inboxRouter = router({
  digest: protectedProcedure.query(async ({ ctx }) => {
    const [accounts, profiles] = await Promise.all([
      listAccounts(ctx.uid),
      seedProfilesIfEmpty(ctx.uid),
    ])

    const perAccount = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
        if (!rt) return []
        const { accessToken } = await refreshAccessToken(rt)
        const raw = await fetchUnreadPrimary(accessToken)
        return raw.map(r => ({ ...r, accountId: acc.id, accountEmail: acc.email }))
      } catch {
        return []
      }
    }))
    const rawEmails = perAccount.flat()
    if (rawEmails.length === 0) return { emails: [] }

    const preResolved: Record<string, PreResolvedIdentity | null> = {}
    for (const e of rawEmails) {
      preResolved[e.id] = resolveDirectSenderIdentity(e.sender, profiles)
    }

    const promptRawEmails: PromptRawEmail[] = rawEmails.map(e => ({
      id: e.id,
      subject: e.subject,
      sender: e.sender,
      snippet: e.snippet,
      fullBody: e.fullBody,
      date: e.date,
      accountId: e.accountId,
    }))

    const prompt = buildDigestPrompt({
      rawEmails: promptRawEmails,
      profiles,
      preResolved,
      now: new Date(),
      timeZone: DEFAULT_TIMEZONE,
    })

    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ClassifiedEmailsSchema,
      prompt,
    })

    const byId = new Map(rawEmails.map(r => [r.id, r]))
    const digested = object.emails.map(ai => {
      const raw = byId.get(ai.id) ?? rawEmails[0]
      return {
        id: ai.id,
        classification: ai.classification,
        snippet: ai.snippet,
        senderIdentity: ai.senderIdentity,
        suggestedActions: ai.suggestedActions.map(a => ({
          id: a.id,
          type: a.type,
          title: a.title,
          date: a.date ?? undefined,
          time: a.time ?? undefined,
          context: a.context ?? undefined,
          sourceQuote: a.sourceQuote,
          confidence: a.confidence,
          status: 'PROPOSED' as const,
        })),
        fullBody: raw.fullBody,
        attachments: raw.attachments ?? [],
        sender: raw.sender,
        subject: raw.subject,
        date: raw.date,
        accountId: raw.accountId,
        accountEmail: raw.accountEmail,
        hubStatus: 'UNREAD' as const,
      }
    })

    return { emails: digested }
  }),
})
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/trpc/routers/inbox.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full type-check**

Run: `npx tsc --noEmit`
Expected: the router compiles. Remaining errors should now only be in `src/lib/store.tsx` (`CALENDAR_INVITE` / `TODO_ITEM` branches) and possibly `src/app/page.tsx` — fixed in Tasks 13–14.

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/inbox.ts tests/server/trpc/routers/inbox.test.ts
git commit -m "feat(trpc): rewrite inbox.digest with 6 classifications + sender identity + ISO-local dates"
```

---

### Task 11: Hydrate profiles in the client store via `trpc.profiles.list.useQuery()`

Move `initialProfiles` out of `src/lib/store.tsx`. Replace the hardcoded array with a `trpc.profiles.list.useQuery()` hook that mirrors how `calendar`, `tasks`, `inbox` are wired by the architecture migration. Add an `appendKnownDomain` helper that calls `trpc.profiles.learnDomain.useMutation()` and invalidates `trpc.profiles.list`.

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Remove `initialProfiles`**

In `src/lib/store.tsx`, delete the `initialProfiles` constant (the 5-entry array currently defined near the top of the module). Keep `initialGroceries`.

- [ ] **Step 2: Import tRPC utilities**

At the top of `src/lib/store.tsx`, add:

```ts
import { trpc } from "@/lib/trpc/client"
```

If there are already tRPC imports from the architecture migration, group them — do not duplicate.

- [ ] **Step 3: Replace `useState<EntityProfile[]>(initialProfiles)`**

Locate:

```tsx
const [profiles, setProfiles] = useState<EntityProfile[]>(initialProfiles)
```

Delete the line entirely. Below the other `trpc.*.useQuery()` hooks introduced by the architecture migration (calendar, tasks, inbox), add:

```tsx
const { data: profilesData, error: profilesError } = trpc.profiles.list.useQuery(undefined, {
  enabled: !!user,
})

useEffect(() => {
  if (profilesError) toast("SYNC ERROR", { description: "Profiles: " + profilesError.message })
}, [profilesError])

const profiles: EntityProfile[] = useMemo(
  () => profilesData?.profiles ?? [],
  [profilesData]
)
```

If `useMemo` and `useEffect` are not already imported in the file, add them to the existing `import React, { ... } from "react"` line.

- [ ] **Step 4: Replace the profile-setter with a mutation + invalidation**

Inside `HubProvider`, add:

```tsx
const utils = trpc.useUtils()
const learnDomainMutation = trpc.profiles.learnDomain.useMutation({
  onSuccess: () => utils.profiles.list.invalidate(),
  onError: (e) => toast("ERROR", { description: e.message }),
})

const appendKnownDomain = async (profileId: string, domain: string) => {
  await learnDomainMutation.mutateAsync({ profileId, domain })
}
```

Remove any `setProfiles` calls elsewhere in the file — profiles are now read-only from the query cache. If a write path exists, it goes through a mutation + `utils.profiles.list.invalidate()` (Phase 2 only needs `learnDomain`; `upsert` is surfaced for Phase 3+ but not exposed on the store yet).

- [ ] **Step 5: Fix the old action-type branches in `actOnEmailAction`**

Inside the existing `actOnEmailAction`, replace:

```tsx
if (act.type === 'CALENDAR_INVITE') {
   addEvent({ id: Math.random().toString(), title: act.title, time: act.time || "12:00", date: act.date || 1, fromEmail: true })
} else if (act.type === 'TODO_ITEM') {
   addTask({ id: Math.random().toString(), title: act.title, context: act.context || "PERSONAL", completed: false })
}
```

with:

```tsx
if (act.type === 'CALENDAR_EVENT') {
   addEvent({ id: Math.random().toString(), title: act.title, time: act.time || "12:00", date: act.date || 1, fromEmail: true })
} else if (act.type === 'TODO') {
   addTask({ id: Math.random().toString(), title: act.title, context: act.context || "PERSONAL", completed: false })
}
// NEEDS_REPLY is handled in Phase 6.
```

Also update the status literal in the same function from `"APPROVED"` to `"COMMITTED"`:

```tsx
if (a.id === actionId) {
   actionItem = a;
   return { ...a, status: "COMMITTED" as const }
}
```

In `dismissEmailAction`, the `"DISMISSED"` literal is already correct; no change needed.

- [ ] **Step 6: Expose `appendKnownDomain` on the context**

Update the `HubState` interface to include:

```ts
appendKnownDomain: (profileId: string, domain: string) => Promise<void>
```

Update the `<HubContext.Provider value={{ ... }}>` to include `appendKnownDomain` in its value object.

- [ ] **Step 7: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: zero errors in `src/lib/store.tsx`. Remaining errors should only be in `src/app/page.tsx` (Bouncer widget) — addressed in Task 14.

- [ ] **Step 8: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(store): hydrate profiles via trpc.profiles.list; add appendKnownDomain mutation wrapper"
```

---

### Task 12: Learn-domain UI banner (tRPC-backed)

Show an inline "Remember this domain?" banner on the selected email when the LLM produced a `senderIdentity` whose `confidence` is `medium` and whose domain is not yet in the matched profile's `knownDomains`. Accepting calls `appendKnownDomain(profileId, domain)` (which fires the tRPC mutation + invalidates the profiles query). Declining stores a localStorage entry so the banner stays dismissed for that domain across sessions.

**Files:**
- Create: `src/components/inbox/learn-domain-banner.tsx`
- Modify: `src/app/inbox/page.tsx`

- [ ] **Step 1: Implement the banner component**

Create `src/components/inbox/learn-domain-banner.tsx`:

```tsx
"use client"

import { useState } from 'react'
import { useHub } from '@/lib/store'
import type { Email } from '@/lib/store'

const LS_KEY = 'hub:learn-domain-dismissed'

function dismissedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_KEY) ?? '[]'))
  } catch {
    return new Set()
  }
}

function recordDismiss(domain: string) {
  const s = dismissedSet()
  s.add(domain)
  localStorage.setItem(LS_KEY, JSON.stringify(Array.from(s)))
}

function domainOf(sender: string): string {
  const at = sender.lastIndexOf('@')
  if (at === -1) return ''
  const closing = sender.indexOf('>', at)
  const end = closing === -1 ? sender.length : closing
  return sender.slice(at + 1, end).toLowerCase()
}

export function LearnDomainBanner({ email }: { email: Email }) {
  const { profiles, appendKnownDomain } = useHub()
  const [hidden, setHidden] = useState(false)

  if (hidden) return null
  if (!email.senderIdentity?.personId) return null
  if (email.senderIdentity.confidence !== 'medium') return null

  const domain = domainOf(email.sender)
  if (!domain) return null
  if (dismissedSet().has(domain)) return null

  const profile = profiles.find(p => p.id === email.senderIdentity!.personId)
  if (!profile) return null
  if ((profile.knownDomains ?? []).some(d => domain === d || domain.endsWith(`.${d}`))) return null

  const onAccept = async () => {
    await appendKnownDomain(profile.id, domain)
    setHidden(true)
  }
  const onDecline = () => {
    recordDismiss(domain)
    setHidden(true)
  }

  return (
    <div className="bg-muted border border-border px-4 py-3 my-4 flex items-center justify-between gap-4">
      <p className="text-xs font-serif text-foreground/80">
        This looks like it might be from <strong>{domain}</strong> (associated with <strong>{profile.name}</strong>). Remember this for next time?
      </p>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onAccept}
          className="text-[10px] font-bold uppercase tracking-widest bg-foreground text-background px-3 py-2 hover:bg-foreground/80 transition-colors"
        >
          Remember
        </button>
        <button
          onClick={onDecline}
          className="text-[10px] font-bold uppercase tracking-widest border border-border px-3 py-2 hover:bg-background transition-colors"
        >
          Not this one
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount the banner in the inbox page**

In `src/app/inbox/page.tsx`, add near the existing imports:

```tsx
import { LearnDomainBanner } from "@/components/inbox/learn-domain-banner"
```

Inside the reader pane, directly below the header block (above the `<div>` that renders the email body), add:

```tsx
{activeEmail && <div className="px-8 lg:px-12 pt-4"><LearnDomainBanner email={activeEmail} /></div>}
```

If the variable name in this file is `selectedEmail` or `openEmail` rather than `activeEmail`, use the local name — the component takes a prop named `email`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors from the new component or its call site.

- [ ] **Step 4: Manual smoke**

Run: `npm run dev`. Log in with at least one Gmail account. Walk through:

- Open `/inbox`. Pick an email whose sender domain is NOT in any profile's `knownDomains` and whose LLM output produced `senderIdentity.confidence === 'medium'` with a `personId`. (You may need to `console.log(useHub().emails)` briefly to find one.)
- Expected: banner appears with the domain and profile name.
- Click **Remember** → banner disappears; refresh; banner stays gone for the same domain; confirm the domain is now in the profile's `knownDomains` by inspecting the cached tRPC query (React Query devtools) or hitting the procedure directly.
- On a new email from the same domain, the LLM should now receive `confidence: 'high'` in the pre-resolved map (no banner).
- On another new-domain email, click **Not this one** → banner disappears; reload; does not reappear for that domain.

Record the results in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/learn-domain-banner.tsx src/app/inbox/page.tsx
git commit -m "feat(inbox): learn-domain banner wired to profiles.learnDomain mutation"
```

---

### Task 13: Classification fixtures + schema coverage

Capture one sample email per classification, run them through the shared schema, and save as reusable fixtures for Phase 3+ tests.

**Files:**
- Create: `tests/fixtures/emails-by-classification.ts`
- Create: `tests/fixtures/emails-by-classification.test.ts`

- [ ] **Step 1: Write the fixture**

Create `tests/fixtures/emails-by-classification.ts`:

```ts
import type { z } from 'zod'
import { ClassifiedEmailsSchema } from '@/lib/server/classification-schema'

type Payload = z.infer<typeof ClassifiedEmailsSchema>

export const FIXTURE: Payload = {
  emails: [
    {
      id: 'calendar-event',
      classification: 'CALENDAR_EVENT',
      snippet: 'Zoo trip Thursday at 8 a.m.; peanut-free lunches.',
      senderIdentity: { personId: 'ellie', confidence: 'high' },
      suggestedActions: [
        {
          id: 'a1',
          type: 'CALENDAR_EVENT',
          title: 'Zoo trip',
          date: 1_745_000_000_000,
          time: '8:00 AM',
          context: 'FAMILY',
          sourceQuote: 'Zoo trip Thursday 8am.',
          confidence: 'high',
        },
      ],
    },
    {
      id: 'todo',
      classification: 'TODO',
      snippet: 'Return the signed permission slip by Friday.',
      senderIdentity: { personId: 'annie', confidence: 'medium' },
      suggestedActions: [
        {
          id: 'a2',
          type: 'TODO',
          title: 'Sign and return permission slip',
          date: 1_745_400_000_000,
          context: 'KID 2',
          sourceQuote: 'Please return the signed slip by Friday.',
          confidence: 'medium',
        },
      ],
    },
    {
      id: 'needs-reply',
      classification: 'NEEDS_REPLY',
      snippet: 'Can you confirm dinner on Saturday?',
      senderIdentity: { personId: 'doug', confidence: 'high' },
      suggestedActions: [
        {
          id: 'a3',
          type: 'NEEDS_REPLY',
          title: 'Re: Dinner Saturday',
          sourceQuote: 'Can you confirm dinner on Saturday?',
          confidence: 'high',
        },
      ],
    },
    {
      id: 'waiting-on',
      classification: 'WAITING_ON',
      snippet: 'Waiting on Doug to send the tax doc.',
      senderIdentity: { personId: 'doug', confidence: 'medium' },
      suggestedActions: [],
    },
    {
      id: 'fyi',
      classification: 'FYI',
      snippet: 'Power outage scheduled Wednesday 2–4 PM.',
      suggestedActions: [],
    },
    {
      id: 'newsletter',
      classification: 'NEWSLETTER',
      snippet: 'The Morning — top headlines.',
      suggestedActions: [],
    },
  ],
}

export function parseFixture() {
  return ClassifiedEmailsSchema.parse(FIXTURE)
}
```

- [ ] **Step 2: Write the fixture test**

Create `tests/fixtures/emails-by-classification.test.ts`:

```ts
import { parseFixture, FIXTURE } from './emails-by-classification'

describe('classification fixtures', () => {
  it('parses cleanly against the shared schema', () => {
    expect(() => parseFixture()).not.toThrow()
  })

  it('covers all 6 classifications exactly once', () => {
    const seen = new Set(FIXTURE.emails.map(e => e.classification))
    expect(seen.size).toBe(6)
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER']) {
      expect(seen.has(c as (typeof FIXTURE.emails)[number]['classification'])).toBe(true)
    }
  })

  it('never produces actions for WAITING_ON / FYI / NEWSLETTER', () => {
    for (const e of FIXTURE.emails) {
      if (['WAITING_ON', 'FYI', 'NEWSLETTER'].includes(e.classification)) {
        expect(e.suggestedActions).toEqual([])
      }
    }
  })
})
```

- [ ] **Step 3: Run**

Run: `npx jest tests/fixtures/emails-by-classification.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/emails-by-classification.ts tests/fixtures/emails-by-classification.test.ts
git commit -m "test(inbox): fixture covering all 6 classifications"
```

---

### Task 14: Home Bouncer widget + full tsc/jest/lint sweep

Reconcile any remaining references to the old `Email` / `EmailAction` shape in `src/app/page.tsx` (the home Bouncer widget) using the compatibility shim. Then sweep the full suite.

**Files:**
- Modify (minimally, if needed): `src/app/page.tsx`

- [ ] **Step 1: Run the full type-check and identify remaining errors**

Run: `npx tsc --noEmit`

If errors surface in `src/app/page.tsx`, they will fall into three buckets:

1. **Old action-type literals** — `CALENDAR_INVITE` / `TODO_ITEM`. Replace with `CALENDAR_EVENT` / `TODO`.
2. **Old status literals** — `action.status === 'PENDING'`. Replace with `isActionable(action.status)` and add `import { isActionable, toLegacyStatus } from '@/lib/action-compat'` to the top of the file.
3. **Missing `classification` / `hubStatus`** — if the Bouncer widget constructs `Email` objects locally or assumes field presence, it won't anymore. The minimal fix: the widget should read `emails` from `useHub()` rather than constructing them, and it should treat `classification` as display-only (badge string). If the code does `email.classification.toLowerCase()` or similar, that's fine; if it compares to old literals, update.

Apply only the minimum fixes needed. Phase 7 redesigns the home widget.

- [ ] **Step 2: Run the full suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: zero errors across all three.

- [ ] **Step 3: Fix any remaining regressions**

Document each fix briefly in the commit message. If a fix requires more than a dozen lines in `page.tsx`, stop and note it as a defect — the Phase 2 surface should not require deep home-widget changes.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "chore: route home Bouncer widget through action-compat shim"
```

If there were no changes required, skip this commit — move on.

---

### Task 15: End-to-end smoke + handoff

Before declaring Phase 2 done, confirm the full pipeline works against real data and update the plan index.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`

- [ ] **Step 2: Manual smoke checklist**

Sign in with at least two linked Gmail accounts (from Phase 1). On the home page (Bouncer widget) and `/inbox`, verify:

- [ ] Emails render with a subject, sender, and snippet.
- [ ] Network tab shows a single `/api/trpc/...` batch call to `inbox.digest` + `profiles.list` (+ the usual `calendar.list`, `tasks.list`, `accounts.list`) — no legacy `/api/inbox/digest`, `/api/profiles`, or `/api/profiles/learn-domain` calls.
- [ ] At least one email shows a `senderIdentity` that maps to a Life Graph profile (console-log `useHub().emails` to inspect if the UI doesn't surface it yet — Phase 3 adds chips).
- [ ] Classifications divide roughly as expected across a sample of 10 unread emails: at least one `NEWSLETTER`, one `FYI`, one with an action.
- [ ] Actions carry `sourceQuote` and `confidence` (console-log to verify).
- [ ] Learn-domain banner appears for a medium-confidence sender with an unknown domain; clicking **Remember** persists via `trpc.profiles.learnDomain.mutate(...)` and `trpc.profiles.list` auto-refetches; the learned domain is visible in the new query cache.
- [ ] A second email from the newly-learned domain comes back with `senderIdentity.confidence === 'high'` from the pre-resolver.
- [ ] Wait one full hour idle; refresh. No 401 re-login prompt (Phase 1 refresh-token plumbing still handling renewal).
- [ ] `/settings` accounts + calendars sections still work (architecture migration unaffected).
- [ ] Calendar + Tasks home widgets still hydrate (`trpc.calendar.list`, `trpc.tasks.list` unaffected).

Record each ✅/❌ in the final commit message.

- [ ] **Step 3: Update the Phase 1 plan's "What's Next" footer**

In `docs/superpowers/plans/2026-04-17-inbox-phase-1-auth-multi-account.md`, find the "What's Next (Phase 2+)" section. Replace the Phase 2 bullet with:

```
- **Phase 2:** Shipped. AI extraction (6 classifications, 3 action types), sender identity matching with email-addresses + date-fns-tz ISO-local prompts, Life Graph learning loop via profilesRouter. Plan: docs/superpowers/plans/2026-04-21-inbox-phase-2-ai-extraction.md.
```

- [ ] **Step 4: Commit the verification note + docs update**

```bash
git add docs/superpowers/plans/2026-04-17-inbox-phase-1-auth-multi-account.md
git commit -m "docs: mark Phase 2 shipped in Phase 1 plan footer"

git commit --allow-empty -m "chore: Phase 2 verified end-to-end

Suite: 0 tsc errors, all jest tests passing, zero lint errors.
Manual smoke (recorded above)."
```

- [ ] **Step 5: Open the PR**

Open a PR from `feature/inbox-phase-2` into `main`. Title:

> Phase 2: AI extraction with 6 classifications, sender identity, Life Graph learning loop

Body summary:
- Rewrote `inboxRouter.digest` with `ClassifiedEmailsSchema` (6 classifications, 3 action types, `sourceQuote`, `confidence`).
- New `profilesRouter` with `list`, `upsert`, `learnDomain` procedures.
- Sender identity pre-resolver (direct) + LLM inferred matching (in prompt).
- ISO-local-time date rendering in prompts via `date-fns-tz` (DST-safe).
- From-header parsing via `email-addresses` (replaces hand-rolled regex).
- Learn-domain banner in existing UI; Phase 3 will redesign.
- Action-compat shim keeps the existing `/inbox` and home Bouncer rendering through Phase 2; Phase 3 deletes it.

---

## Post-Phase-2 Verification

Before handing off:

1. `npx tsc --noEmit` — zero errors.
2. `npx jest` — entire suite green (new tests: profiles CRUD, sender-identity, classification schema, digest prompt, profiles router, inbox router v2, action-compat, gmail-fetcher attachments, classification fixtures).
3. `npm run lint` — zero errors.
4. Smoke checklist from Task 15 Step 2 — every item ✅.
5. Network tab on a logged-in session: no calls to `/api/profiles/*`, `/api/inbox/digest/route.ts`, or any other legacy Route Handler (only `/api/trpc/[trpc]` + `/api/auth/google/callback` + `/api/chat`).
6. New Firestore `users/{uid}/profiles/{profileId}` collection contains seeded records for test users (verify in Firebase console).
7. `src/lib/action-compat.ts` still exists (Phase 3 deletes it).

If any of the above fail, fix and retest before declaring Phase 2 complete.

---

## What's Next (Phase 3+)

- **Phase 3:** UI redesign — three-pane `/inbox`, editable action cards (PROPOSED/EDITING only — no writes yet), Clear + Recently cleared, row treatments per classification. Drops `src/lib/action-compat.ts`. Introduces `trpc.inbox.markCleared.useMutation()` with optimistic cache updates. Plan: `docs/superpowers/plans/2026-04-21-inbox-phase-3-ui-redesign.md`.
- **Phase 4:** Google write flow — new `actionsRouter` with `commitCalendar`, `commitTask`, `markEmailRead`; optimistic mutations with rollback on error; idempotency keys; double-click protection; duplicate detection.
- **Phase 5:** PDF extraction with Life Graph pre-fill — new `attachmentsRouter.extract` procedure with lazy-on-open + Firestore cache.
- **Phase 6:** Reply capability (`gmail.send`) — `inboxRouter.sendReply` mutation.
- **Phase 7:** Home widget redesign — subscribes to the same `trpc.inbox.digest` query as `/inbox`.
