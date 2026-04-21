# Inbox Redesign — Phase 2: AI Extraction + Sender Identity + Life Graph Loop

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current 2-action classifier with a richer AI extraction pipeline that emits (a) one of six email-level classifications, (b) zero or more editable actions with `sourceQuote` + `confidence`, and (c) a `senderIdentity` linking the email to a Life Graph person/org. Persist profiles to Firestore and add a learning loop so unknown domains can be remembered after user confirmation.

**Architecture:** Phase 2 is a data-layer + AI-pipeline refactor. The `/api/inbox/digest` route is rewritten to emit a richer `Email` record (`classification`, `senderIdentity`, `hubStatus`, `suggestedActions` with `sourceQuote` + `confidence`). `EntityProfile` gains `knownDomains` / `knownSenders`, and profiles move from a hardcoded list in `src/lib/store.tsx` into Firestore with a seed on first read. A two-step sender-identity resolver runs server-side — direct lookup first, then the LLM matches inferentially as part of the classification prompt. A small learning-loop banner in the existing `/inbox` UI lets the user confirm inferred domain matches, which writes back to Firestore. The existing `/inbox` page keeps rendering via a thin compatibility shim mapping the new action status enum to the old `PENDING` / `APPROVED` / `DISMISSED` names. Phase 3 replaces the UI and drops the shim.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Firebase Admin SDK (server), Firestore, `@ai-sdk/openai` + `ai` (`generateObject` with a Zod schema), `zod` 4, Jest + ts-jest.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "Data Model", "AI Extraction Pipeline", and "Sender identity matching" sections.

**Base branch:** Branch off `feature/inbox-phase-1` once it merges to `main`, or — if working before Phase 1 merges — branch off `feature/inbox-phase-1` directly and rebase onto `main` after the merge. This plan assumes the Phase 1 server infrastructure (accounts, encrypted refresh tokens, `/api/inbox/digest` skeleton, `listAccounts`, `getDecryptedRefreshToken`, `refreshAccessToken`, `fetchUnreadPrimary`) is in place.

---

## Before You Start — Read These

Next.js 16 has breaking changes. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler conventions
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- Check `package.json` — `next` is pinned; confirm the docs you read match that version.

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not assume patterns from memory.

If anything in this plan conflicts with what the Next.js 16 docs say, follow the docs and update the plan.

---

## File Structure

### New files
- `src/lib/server/profiles.ts` — Firestore CRUD for `EntityProfile`; seed on first read
- `src/lib/server/sender-identity.ts` — `resolveDirectSenderIdentity(senderEmail, senderName, profiles)` returning `SenderIdentity | null`
- `src/lib/server/classification-schema.ts` — the shared Zod schema + TypeScript types for the new `Email` / `EmailAction` / `SenderIdentity` shape
- `src/lib/server/digest-prompt.ts` — prompt builder that takes `rawEmails`, `profiles`, and `preResolvedIdentities` and returns the LLM prompt string
- `src/app/api/profiles/route.ts` — GET list / POST upsert
- `src/app/api/profiles/learn-domain/route.ts` — POST `{ profileId, domain }` → append to `knownDomains`
- `src/components/inbox/learn-domain-banner.tsx` — client component for the "Remember this domain?" prompt
- `src/lib/action-compat.ts` — compatibility shim translating new action status enum ↔ the old UI's `PENDING` / `APPROVED` / `DISMISSED`
- `tests/server/profiles.test.ts`
- `tests/server/sender-identity.test.ts`
- `tests/server/classification-schema.test.ts`
- `tests/server/digest-prompt.test.ts`
- `tests/api/profiles.test.ts`
- `tests/api/profiles-learn-domain.test.ts`
- `tests/api/inbox-digest-v2.test.ts`
- `tests/fixtures/emails-by-classification.ts` — fixture data for all 6 classifications
- `tests/lib/action-compat.test.ts`

### Modified files
- `src/lib/store.tsx` — `EntityProfile` gains `knownDomains` + `knownSenders`; `Email` gains `classification` + `senderIdentity` + `hubStatus`; `EmailAction` gains `sourceQuote` + `confidence` + new status enum; `initialProfiles` removed; profiles hydrate from `/api/profiles`; `appendKnownDomain` added
- `src/app/api/inbox/digest/route.ts` — full rewrite: new Zod schema, sender resolver integration, new prompt, richer output
- `src/app/inbox/page.tsx` — minimal updates to render via compatibility shim (no redesign; Phase 3 handles that)
- `src/app/page.tsx` — if it renders emails in the Bouncer widget, add the same compatibility import (verify during Task 12)
- `tests/api/inbox-digest.test.ts` — rename to `tests/api/inbox-digest-v2.test.ts` (see Task 10) or expand to cover the new schema

### Out of scope for Phase 2
- Three-pane `/inbox` UI redesign (Phase 3)
- Real Google Calendar / Tasks commits (Phase 4)
- PDF extraction (Phase 5)
- Gmail reply sending (Phase 6)
- Home-widget redesign (Phase 7)

---

## Prerequisites (one-time)

These are environment/infrastructure items the implementing agent cannot do alone.

- [ ] **P1. Phase 1 must be merged or at least stable.** Confirm `main` (or your working branch) includes `src/lib/server/accounts.ts`, `src/lib/server/google-oauth.ts`, `src/lib/server/gmail-fetcher.ts`, and `/api/inbox/digest/route.ts` with multi-account fetch. Run `git log --oneline -20` to confirm.
- [ ] **P2. Firestore rules for new collection.** The `users/{uid}/profiles/{profileId}` collection needs the same "owner can read/write" rule as accounts. If project uses Firestore Security Rules, update `firestore.rules` in the same PR. (If rules live elsewhere, note the location and flag to Mary.)
- [ ] **P3. Environment variables.** No new env vars required; Phase 2 reuses `FIREBASE_ADMIN_SA_JSON`, `TOKEN_ENCRYPTION_KEY`, `OPENAI_API_KEY`.

---

## Tasks

### Task 1: Extend shared TypeScript types

Expand `Email`, `EmailAction`, `EntityProfile` in `src/lib/store.tsx` to match the spec. Keep existing fields so the current UI continues to render.

**Files:**
- Modify: `src/lib/store.tsx:34-67`

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

Note: the old union `"CALENDAR_INVITE" | "TODO_ITEM" | "OTHER"` is intentionally removed. The shim in Task 11 handles UI translation.

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
Expected: failures in `src/app/inbox/page.tsx` (old action status names) and `src/lib/store.tsx` (old action type strings). These are addressed in Tasks 11–12. Do not "fix" them yet.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(types): expand Email/EmailAction/EntityProfile for Phase 2"
```

---

### Task 2: Action-status compatibility shim

Give the existing UI something to render while the new status enum lands. The shim is temporary; Phase 3 deletes it.

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

- [ ] **Step 5: Commit**

```bash
git add src/lib/action-compat.ts tests/lib/action-compat.test.ts
git commit -m "feat(inbox): add action-status compatibility shim"
```

---

### Task 3: Patch `/inbox` page to use the shim

Fix the type errors introduced by Task 1 by translating new statuses through the shim. No UI redesign — identical visuals to today.

**Files:**
- Modify: `src/app/inbox/page.tsx:52, 115, 125, 131`

- [ ] **Step 1: Import the shim at the top of the file**

In `src/app/inbox/page.tsx`, add below the existing `import { useHub } ...` line:

```ts
import { toLegacyStatus, isActionable } from "@/lib/action-compat"
```

- [ ] **Step 2: Replace the three status checks**

In `src/app/inbox/page.tsx:52` replace:

```tsx
{email.suggestedActions?.some(a => a.status === 'PENDING') && (
```

with:

```tsx
{email.suggestedActions?.some(a => isActionable(a.status)) && (
```

In `src/app/inbox/page.tsx:115` replace:

```tsx
<div key={action.id} className={`flex flex-col bg-white border ${action.status === 'PENDING' ? 'border-foreground' : 'border-border opacity-50 grayscale'} p-5 shadow-[4px_4px_0_rgba(0,0,0,0.05)] transition-all`}>
```

with:

```tsx
<div key={action.id} className={`flex flex-col bg-white border ${isActionable(action.status) ? 'border-foreground' : 'border-border opacity-50 grayscale'} p-5 shadow-[4px_4px_0_rgba(0,0,0,0.05)] transition-all`}>
```

In `src/app/inbox/page.tsx:118` replace:

```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block mb-2">{action.type.replace('_', ' ')}</span>
```

with:

```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block mb-2">{action.type.replace(/_/g, ' ')}</span>
```

In `src/app/inbox/page.tsx:125` replace:

```tsx
{action.status === 'PENDING' ? (
```

with:

```tsx
{isActionable(action.status) ? (
```

In `src/app/inbox/page.tsx:131` replace:

```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 text-center bg-muted py-2 w-full block border border-border/50">Status: {action.status}</span>
```

with:

```tsx
<span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 text-center bg-muted py-2 w-full block border border-border/50">Status: {toLegacyStatus(action.status)}</span>
```

- [ ] **Step 3: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: `src/app/inbox/page.tsx` errors cleared. Remaining errors will be in `src/lib/store.tsx` around the old `CALENDAR_INVITE` / `TODO_ITEM` action-construction paths (cleaned up in Task 12).

- [ ] **Step 4: Commit**

```bash
git add src/app/inbox/page.tsx
git commit -m "chore(inbox): route existing UI through action-compat shim"
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
  known.add(domain)
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

### Task 5: `/api/profiles` route

Expose list (GET) and upsert (POST) endpoints authenticated by Firebase ID token.

**Files:**
- Create: `src/app/api/profiles/route.ts`
- Create: `tests/api/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/profiles.test.ts`:

```ts
import { GET, POST } from '@/app/api/profiles/route'
import { getUidFromRequest } from '@/lib/server/session'
import { seedProfilesIfEmpty, upsertProfile, listProfiles } from '@/lib/server/profiles'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/profiles')

describe('/api/profiles', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
  })

  it('GET returns seeded profiles on first call', async () => {
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const req = new Request('http://x/api/profiles', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.profiles).toHaveLength(1)
    expect(seedProfilesIfEmpty).toHaveBeenCalledWith('mary-uid')
  })

  it('POST upserts a profile', async () => {
    ;(upsertProfile as jest.Mock).mockResolvedValue(undefined)
    ;(listProfiles as jest.Mock).mockResolvedValue([
      { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
    ])
    const req = new Request('http://x/api/profiles', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ellie', name: 'Ellie', type: 'Child', currentContext: 'Test', preferences: [], routines: [], sizes: {}, medicalNotes: '' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(upsertProfile).toHaveBeenCalledWith('mary-uid', expect.objectContaining({ id: 'ellie' }))
    expect(body.profiles).toHaveLength(1)
  })

  it('POST rejects invalid payload', async () => {
    const req = new Request('http://x/api/profiles', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'missing id' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/api/profiles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/profiles/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import {
  listProfiles,
  upsertProfile,
  seedProfilesIfEmpty,
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

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const profiles = await seedProfilesIfEmpty(uid)
    return NextResponse.json({ profiles })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const body = await req.json().catch(() => null)
    const parsed = ProfileSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid profile', details: parsed.error.issues }, { status: 400 })
    }
    await upsertProfile(uid, parsed.data)
    const profiles = await listProfiles(uid)
    return NextResponse.json({ profiles })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/api/profiles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profiles/route.ts tests/api/profiles.test.ts
git commit -m "feat(profiles): GET/POST /api/profiles"
```

---

### Task 6: `/api/profiles/learn-domain` route

Dedicated endpoint for the learning loop. Always appends, never removes.

**Files:**
- Create: `src/app/api/profiles/learn-domain/route.ts`
- Create: `tests/api/profiles-learn-domain.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/profiles-learn-domain.test.ts`:

```ts
import { POST } from '@/app/api/profiles/learn-domain/route'
import { getUidFromRequest } from '@/lib/server/session'
import { appendKnownDomain, getProfile } from '@/lib/server/profiles'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/profiles')

describe('POST /api/profiles/learn-domain', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(getProfile as jest.Mock).mockResolvedValue({
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
    ;(appendKnownDomain as jest.Mock).mockResolvedValue(undefined)
  })

  it('appends a new domain', async () => {
    const req = new Request('http://x/api/profiles/learn-domain', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'annie', domain: 'art.audaucy.org' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(appendKnownDomain).toHaveBeenCalledWith('mary-uid', 'annie', 'art.audaucy.org')
  })

  it('rejects missing fields', async () => {
    const req = new Request('http://x/api/profiles/learn-domain', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'annie' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('rejects bare domain with protocol', async () => {
    const req = new Request('http://x/api/profiles/learn-domain', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId: 'annie', domain: 'https://audaucy.org' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/api/profiles-learn-domain.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/profiles/learn-domain/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { appendKnownDomain } from '@/lib/server/profiles'

const DomainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const BodySchema = z.object({
  profileId: z.string().min(1),
  domain: z.string().regex(DomainRe, 'Expect a bare domain like "example.com"'),
})

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const body = await req.json().catch(() => null)
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid' }, { status: 400 })
    }
    await appendKnownDomain(uid, parsed.data.profileId, parsed.data.domain.toLowerCase())
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/api/profiles-learn-domain.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/profiles/learn-domain/route.ts tests/api/profiles-learn-domain.test.ts
git commit -m "feat(profiles): POST /api/profiles/learn-domain"
```

---

### Task 7: Sender-identity direct resolver

Pure function: given a sender and the user's profile list, pick the Life Graph person/org by `knownDomains` / `knownSenders`. LLM-inferred matching happens in the prompt (Task 9), not here.

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
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/sender-identity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/sender-identity.ts`:

```ts
import type { EntityProfile, SenderIdentity } from '@/lib/store'

export interface ParsedFrom {
  name: string
  email: string
}

export function parseFrom(raw: string): ParsedFrom {
  const trimmed = raw.trim()
  const match = trimmed.match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/)
  if (match) {
    return { name: (match[1] ?? '').trim(), email: match[2].trim() }
  }
  if (trimmed.includes('@')) {
    return { name: '', email: trimmed }
  }
  return { name: trimmed, email: '' }
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

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/sender-identity.test.ts`
Expected: PASS (8 tests — 3 in parseFrom, 5 in resolveDirectSenderIdentity).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/sender-identity.ts tests/server/sender-identity.test.ts
git commit -m "feat(inbox): direct sender-identity resolver"
```

---

### Task 8: New classification Zod schema

Shared schema module — consumed by the prompt builder, the digest route, and the tests.

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

### Task 9: Digest prompt builder

Pure function that composes the LLM prompt from raw emails + profiles + pre-resolved identities. Keeps prompt-string concerns out of the route handler.

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
    { id: 'ellie', name: 'Ellie', type: 'Child', currentContext: 'Gymnastics Tues/Thurs', preferences: [], routines: [], sizes: {}, medicalNotes: 'Peanut allergy', knownDomains: ['blessedsacrament.org'] },
  ]

  const rawEmails = [
    { id: 'm1', subject: 'Zoo trip', sender: 'Ms. Redd <office@blessedsacrament.org>', snippet: 'Zoo trip Thu 8am', fullBody: 'Zoo trip Thursday 8am. Peanut-free lunches please.', date: 1, accountId: 'a1' },
  ]

  const preResolved: Record<string, { personId?: string; orgName?: string; confidence: string } | null> = {
    m1: { personId: 'ellie', confidence: 'medium' },
  }

  it('includes all six classification names verbatim', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    for (const c of ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY', 'WAITING_ON', 'FYI', 'NEWSLETTER']) {
      expect(prompt).toContain(c)
    }
  })

  it('includes the three action type names verbatim', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    expect(prompt).toMatch(/action types.*CALENDAR_EVENT.*TODO.*NEEDS_REPLY/s)
  })

  it('embeds each Life Graph profile with knownDomains', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    expect(prompt).toContain('Ellie')
    expect(prompt).toContain('Peanut allergy')
    expect(prompt).toContain('blessedsacrament.org')
  })

  it('injects pre-resolved sender identity hints keyed by email id', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    expect(prompt).toMatch(/m1.*personId.*ellie/s)
  })

  it('contains the sourceQuote and no-invented-dates instructions', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    expect(prompt.toLowerCase()).toContain('sourcequote')
    expect(prompt.toLowerCase()).toContain('never invent')
  })

  it('embeds the raw emails as JSON', () => {
    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
    expect(prompt).toContain('"id": "m1"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/server/digest-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/digest-prompt.ts`:

```ts
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

const SYSTEM = `You are a Chief of Staff AI. You classify the user's unread emails and extract committable actions.

Emit ONE classification per email from this enum:
- CALENDAR_EVENT — email implies a scheduled event (school trip, meeting, appointment)
- TODO — email implies a concrete to-do the user must act on
- NEEDS_REPLY — email requires a written reply
- WAITING_ON — user is waiting on someone else to respond or act
- FYI — informational, no action required
- NEWSLETTER — subscription content; auto-dimmed by the UI

Emit zero or more suggestedActions per email. Action types are exactly:
- CALENDAR_EVENT — fields: title, date (epoch ms), time (12-hour "h:mm AM/PM"), context
- TODO — fields: title, date (due, epoch ms or null), context
- NEEDS_REPLY — fields: title (the subject of the reply), context

WAITING_ON, FYI, and NEWSLETTER classifications MUST produce zero actions.

Rules:
- Every action MUST carry a sourceQuote — the exact sentence from the email that implied the action. Never paraphrase.
- Every action MUST carry a confidence value: "high", "medium", or "low".
- Never invent dates. If the email does not specify a date and you cannot infer one unambiguously, set date to null and use confidence "low".
- Match the sender to a Life Graph profile (personId) or organization (orgName) when possible. If the user has pre-resolved an identity for an email id (provided below), use it as a strong hint but override if the email content clearly points elsewhere — mark confidence accordingly.
- Dates MUST be epoch milliseconds in the user's local reference. If a date string says "Thursday at 8am" and "now" is 2026-04-21, resolve to the next Thursday 8am local.
`

export function buildDigestPrompt(
  rawEmails: PromptRawEmail[],
  profiles: EntityProfile[],
  preResolved: Record<string, PreResolvedIdentity | null>
): string {
  const profileBlock = profiles.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    currentContext: p.currentContext,
    medicalNotes: p.medicalNotes,
    knownDomains: p.knownDomains ?? [],
    knownSenders: p.knownSenders ?? [],
  }))

  return [
    SYSTEM,
    '',
    'LIFE GRAPH PROFILES (reference for sender identity + context):',
    JSON.stringify(profileBlock, null, 2),
    '',
    'PRE-RESOLVED SENDER IDENTITIES (strong hints, keyed by email id):',
    JSON.stringify(preResolved, null, 2),
    '',
    'EMAILS TO CLASSIFY:',
    JSON.stringify(rawEmails, null, 2),
    '',
    'Return a single JSON object matching the schema: { emails: [...] }',
  ].join('\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/server/digest-prompt.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/digest-prompt.ts tests/server/digest-prompt.test.ts
git commit -m "feat(inbox): digest prompt builder with 6 classifications + Life Graph"
```

---

### Task 10: Rewrite `/api/inbox/digest`

Replace the Phase 1 route with the Phase 2 pipeline: fetch per-account → pre-resolve identities → call LLM → merge → tag with `hubStatus: 'UNREAD'`.

**Files:**
- Modify: `src/app/api/inbox/digest/route.ts` (full rewrite)
- Create: `tests/api/inbox-digest-v2.test.ts`
- Delete: `tests/api/inbox-digest.test.ts` (superseded)

- [ ] **Step 1: Write the failing tests**

Delete the old test file first:

```bash
git rm tests/api/inbox-digest.test.ts
```

Create `tests/api/inbox-digest-v2.test.ts`:

```ts
import { POST } from '@/app/api/inbox/digest/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import { seedProfilesIfEmpty } from '@/lib/server/profiles'
import * as aiModule from 'ai'

jest.mock('@/lib/server/session')
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
  date: 1,
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

describe('POST /api/inbox/digest (Phase 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([baseRaw])
    ;(seedProfilesIfEmpty as jest.Mock).mockResolvedValue([
      {
        id: 'ellie', name: 'Ellie', type: 'Child',
        currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: 'Peanut allergy',
        knownDomains: ['blessedsacrament.org'],
      },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({ object: { emails: [baseClassified] } })
  })

  it('returns richer Email records with classification, senderIdentity, hubStatus, sourceQuote', async () => {
    const req = new Request('http://x/api/inbox/digest', { method: 'POST', headers: { Authorization: 'Bearer t' } })
    const res = await POST(req)
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.emails).toHaveLength(1)
    const e = body.emails[0]
    expect(e.id).toBe('m1')
    expect(e.classification).toBe('CALENDAR_EVENT')
    expect(e.senderIdentity).toEqual({ personId: 'ellie', confidence: 'high' })
    expect(e.hubStatus).toBe('UNREAD')
    expect(e.suggestedActions[0].sourceQuote).toBe('Zoo trip Thursday 8am.')
    expect(e.suggestedActions[0].status).toBe('PROPOSED')
    expect(e.accountId).toBe('a1')
  })

  it('returns empty array when no accounts return emails', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([])
    const req = new Request('http://x/api/inbox/digest', { method: 'POST', headers: { Authorization: 'Bearer t' } })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails).toEqual([])
    expect(aiModule.generateObject).not.toHaveBeenCalled()
  })

  it('pre-resolves sender identity and passes it to the prompt', async () => {
    await POST(new Request('http://x/api/inbox/digest', { method: 'POST', headers: { Authorization: 'Bearer t' } }))
    const options = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(options.prompt).toMatch(/"personId": "ellie"/)
  })

  it('stamps every raw email with hubStatus=UNREAD even if the LLM omits fields', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { emails: [{ ...baseClassified, senderIdentity: undefined }] },
    })
    const req = new Request('http://x/api/inbox/digest', { method: 'POST', headers: { Authorization: 'Bearer t' } })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails[0].hubStatus).toBe('UNREAD')
    expect(body.emails[0].senderIdentity).toBeUndefined()
  })

  it('preserves fullBody / attachments / accountEmail from the raw fetch', async () => {
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { ...baseRaw, attachments: [{ id: 'at1', filename: 'permission.pdf', mimeType: 'application/pdf', size: 1234 }] },
    ])
    const req = new Request('http://x/api/inbox/digest', { method: 'POST', headers: { Authorization: 'Bearer t' } })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails[0].fullBody).toContain('Zoo trip Thursday')
    expect(body.emails[0].attachments).toHaveLength(1)
    expect(body.emails[0].attachments[0].filename).toBe('permission.pdf')
    expect(body.emails[0].accountEmail).toBe('mary@tribe.ai')
  })
})
```

Note: The test above assumes `fetchUnreadPrimary` will eventually return `attachments`. If it does not today, update `src/lib/server/gmail-fetcher.ts` to surface attachment metadata — see Task 10, Step 2a.

- [ ] **Step 2a: If `fetchUnreadPrimary` does not return attachments, extend it**

Read `src/lib/server/gmail-fetcher.ts`. If `GmailEmail` does not include `attachments`, extend it:

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

And in the message-parsing loop, walk `payload.parts` recursively for any part with `body.attachmentId`:

```ts
interface GmailPayload {
  mimeType?: string
  filename?: string
  body?: { data?: string; attachmentId?: string; size?: number }
  parts?: GmailPayload[]
}

const extractAttachments = (payload: GmailPayload): { id: string; filename: string; mimeType: string; size: number }[] => {
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

Include it in the returned object: `attachments: extractAttachments(msgData.payload)`.

- [ ] **Step 2b: If you extended the fetcher, add a test**

Append to `tests/server/gmail-fetcher.test.ts` (create if missing):

```ts
// If the file does not exist, create it with:
// import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
// (and a global fetch mock per the pattern in other server tests)
```

If creating from scratch:

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

- [ ] **Step 3: Run the failing route test**

Run: `npx jest tests/api/inbox-digest-v2.test.ts`
Expected: FAIL — either `Cannot find module '@/lib/server/profiles'` (if mock not in place) or more likely schema mismatch because the old route still uses the Phase 1 schema.

- [ ] **Step 4: Rewrite the route**

Replace `src/app/api/inbox/digest/route.ts` entirely with:

```ts
import { NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import { seedProfilesIfEmpty } from '@/lib/server/profiles'
import { resolveDirectSenderIdentity } from '@/lib/server/sender-identity'
import { buildDigestPrompt, PreResolvedIdentity } from '@/lib/server/digest-prompt'
import { ClassifiedEmailsSchema } from '@/lib/server/classification-schema'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const [accounts, profiles] = await Promise.all([
      listAccounts(uid),
      seedProfilesIfEmpty(uid),
    ])

    const perAccount = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) return []
        const { accessToken } = await refreshAccessToken(rt)
        const raw = await fetchUnreadPrimary(accessToken)
        return raw.map(r => ({ ...r, accountId: acc.id, accountEmail: acc.email }))
      } catch {
        return []
      }
    }))
    const rawEmails = perAccount.flat()
    if (rawEmails.length === 0) return NextResponse.json({ emails: [] })

    const preResolved: Record<string, PreResolvedIdentity | null> = {}
    for (const e of rawEmails) {
      preResolved[e.id] = resolveDirectSenderIdentity(e.sender, profiles)
    }

    const prompt = buildDigestPrompt(rawEmails, profiles, preResolved)
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

    return NextResponse.json({ emails: digested })
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string }
    const status = e instanceof HttpError ? e.status : (err.status ?? 500)
    return NextResponse.json({ error: err.message ?? 'Unknown error' }, { status })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/api/inbox-digest-v2.test.ts`
Expected: PASS (5 tests).

Also run: `npx jest tests/server/gmail-fetcher.test.ts` if you created it.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/inbox/digest/route.ts tests/api/inbox-digest-v2.test.ts
git rm tests/api/inbox-digest.test.ts 2>/dev/null || true
# If you also touched the fetcher:
git add src/lib/server/gmail-fetcher.ts tests/server/gmail-fetcher.test.ts 2>/dev/null || true
git commit -m "feat(inbox): rewrite digest route with 6 classifications + sender identity"
```

---

### Task 11: Hydrate profiles in the client store

Move `initialProfiles` out of `src/lib/store.tsx` and hydrate from `/api/profiles`. Add `appendKnownDomain` bound to the learning-loop endpoint. Fix the existing action-construction paths that referenced the old `CALENDAR_INVITE` / `TODO_ITEM` type names.

**Files:**
- Modify: `src/lib/store.tsx:91-101, 110-178, 219-245, 258`

- [ ] **Step 1: Remove `initialProfiles` constant**

In `src/lib/store.tsx`, delete lines 95–101 (the `initialProfiles` array). Keep `initialGroceries`.

- [ ] **Step 2: Replace `useState<EntityProfile[]>(initialProfiles)`**

Find line:

```tsx
const [profiles, setProfiles] = useState<EntityProfile[]>(initialProfiles)
```

Replace with:

```tsx
const [profiles, setProfiles] = useState<EntityProfile[]>([])
```

- [ ] **Step 3: Add profile hydration to the existing hydrate effect**

Inside the `useEffect` that already calls `hydrateCalendar`, `hydrateTasks`, `hydrateEmails`, add:

```tsx
const hydrateProfiles = async () => {
  const data = await hydrate('/api/profiles')
  if (!data) return
  if (data.error) {
    toast("SYNC ERROR", { description: "Profiles: " + data.error })
    return
  }
  if (data.profiles) setProfiles(data.profiles)
}
```

And call `hydrateProfiles()` alongside the others.

- [ ] **Step 4: Add `appendKnownDomain` to the store**

Inside `HubProvider`, near the other setters, add:

```tsx
const appendKnownDomain = async (profileId: string, domain: string) => {
  const token = await getIdToken()
  if (!token) return
  const res = await fetch('/api/profiles/learn-domain', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId, domain }),
  })
  if (!res.ok) {
    toast("ERROR", { description: "Could not save domain." })
    return
  }
  setProfiles(prev => prev.map(p => {
    if (p.id !== profileId) return p
    const next = new Set(p.knownDomains ?? [])
    next.add(domain.toLowerCase())
    return { ...p, knownDomains: Array.from(next) }
  }))
}
```

- [ ] **Step 5: Fix the old action-type branches**

In the existing `actOnEmailAction`, replace:

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

Also update the `"APPROVED"` status literal in the same function to `"COMMITTED"`:

```tsx
if (a.id === actionId) {
   actionItem = a;
   return { ...a, status: "COMMITTED" as const }
}
```

And in `dismissEmailAction`, the `"DISMISSED"` literal is already correct; no change.

- [ ] **Step 6: Expose `appendKnownDomain` on the context**

Update the `HubState` interface to include:

```ts
appendKnownDomain: (profileId: string, domain: string) => Promise<void>
```

Update the `<HubContext.Provider value={{ ... }}>` to include `appendKnownDomain`.

- [ ] **Step 7: Run the type-checker**

Run: `npx tsc --noEmit`
Expected: zero errors. If errors remain, they're likely in `src/app/page.tsx` (Bouncer home widget) or elsewhere — trace and fix minimally.

- [ ] **Step 8: Run the full test suite**

Run: `npx jest`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/store.tsx
git commit -m "feat(store): hydrate profiles from Firestore; add appendKnownDomain"
```

---

### Task 12: Learn-domain UI banner

Show an inline "Remember this domain?" banner on the selected email when the LLM produced a `senderIdentity` whose `confidence` is `medium` and whose domain is not yet in the matched profile's `knownDomains`. Accepting POSTs to `/api/profiles/learn-domain`; declining stores a localStorage entry so we don't ask again for that domain.

**Files:**
- Create: `src/components/inbox/learn-domain-banner.tsx`
- Modify: `src/app/inbox/page.tsx` (mount the banner in the reader pane)

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

In `src/app/inbox/page.tsx`, add the import near the top:

```tsx
import { LearnDomainBanner } from "@/components/inbox/learn-domain-banner"
```

Inside the reader pane, just below the header block (around line 81, before the `<div className="p-8 lg:p-12 font-serif ...">` body block), add:

```tsx
{activeEmail && <div className="px-8 lg:px-12 pt-4"><LearnDomainBanner email={activeEmail} /></div>}
```

- [ ] **Step 3: Manual smoke**

Run: `npm run dev`
- Open `/inbox`.
- Pick an email whose sender domain is NOT in any profile's `knownDomains` and whose LLM output produced `senderIdentity.confidence === 'medium'` with a `personId`.
- Expected: banner appears with the domain and profile name.
- Click "Remember" → banner disappears; refresh the page; banner stays gone for the same domain; the learned domain is in the profile (verify with `curl` to `/api/profiles` or check Firestore).
- On a new email from the same domain, the LLM should now produce `confidence: 'high'` (no banner).
- On another new-domain email, click "Not this one" → banner disappears; reload; does not reappear for that domain.

Document the manual result in the PR description.

- [ ] **Step 4: Commit**

```bash
git add src/components/inbox/learn-domain-banner.tsx src/app/inbox/page.tsx
git commit -m "feat(inbox): learn-domain banner"
```

---

### Task 13: Classification fixtures + snapshot coverage

Capture one sample email per classification, run them through the schema, and save as fixtures useable by Phase 3+ tests.

**Files:**
- Create: `tests/fixtures/emails-by-classification.ts`
- Create: `tests/fixtures/emails-by-classification.test.ts`

- [ ] **Step 1: Write the fixture + test**

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

- [ ] **Step 2: Run**

Run: `npx jest tests/fixtures/emails-by-classification.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/emails-by-classification.ts tests/fixtures/emails-by-classification.test.ts
git commit -m "test(inbox): fixture covering all 6 classifications"
```

---

### Task 14: Full suite + type + lint sweep

- [ ] **Step 1: Run everything**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: zero errors in each.

- [ ] **Step 2: Fix any regressions**

If `tsc` surfaces anything in `src/app/page.tsx` (home Bouncer widget), the fix is almost certainly one of:
- A reference to `CALENDAR_INVITE` / `TODO_ITEM` (replace with `CALENDAR_EVENT` / `TODO`)
- A reference to `action.status === 'PENDING'` (replace with `isActionable(action.status)` — import the shim)
- A reference to the old `Email` type shape (missing `classification` or `hubStatus` — add defaults in-place if necessary, or thread the data through from the store)

Make only the minimum changes needed. Phase 7 redesigns the home widget.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: quiet tsc/eslint across Phase 2 surface"
```

---

### Task 15: End-to-end smoke checklist + docs

Before declaring Phase 2 done, confirm the full pipeline works against real data.

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`

- [ ] **Step 2: Manual smoke**

Sign in with at least two linked Gmail accounts (from Phase 1). On the home page (Bouncer) and `/inbox`, verify:

- [ ] Emails render with a subject, sender, and snippet.
- [ ] At least one email shows a `senderIdentity` that maps to a Life Graph profile (console-log `useHub().emails` to inspect if the UI doesn't surface it yet — Phase 3 adds chips).
- [ ] Classifications divide roughly as expected across a sample of 10 unread emails: at least one `NEWSLETTER`, one `FYI`, one with an action.
- [ ] Actions carry `sourceQuote` and `confidence` (console-log to verify).
- [ ] Learn-domain banner appears for a medium-confidence sender with an unknown domain; clicking "Remember" persists to Firestore (confirm via `curl -s -H "Authorization: Bearer $(get-id-token)" http://localhost:3000/api/profiles | jq '.profiles[] | select(.id=="ellie") | .knownDomains'`).
- [ ] `/settings` still works (Phase 1 accounts section unaffected).
- [ ] Calendar and Tasks hydration still work (Phase 1 routes unaffected).

Record results in the PR description.

- [ ] **Step 3: Update `docs/superpowers/plans/2026-04-17-inbox-phase-1-auth-multi-account.md`**

Find the "What's Next (Phase 2+)" section at the end. Replace the Phase 2 stub with:

```
- **Phase 2:** ✅ Shipped. AI extraction (6 classifications, 3 action types), sender identity matching, Life Graph learning loop. Plan: `docs/superpowers/plans/2026-04-21-inbox-phase-2-ai-extraction.md`.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-17-inbox-phase-1-auth-multi-account.md
git commit -m "docs: mark Phase 2 shipped in Phase 1 plan footer"
```

---

## Post-Phase-2 Verification

Before handing off:

1. `npx jest` — entire suite green.
2. `npx tsc --noEmit` — zero errors.
3. `npm run lint` — zero errors.
4. Smoke checklist from Task 15 passes.
5. New Firestore `users/{uid}/profiles/{profileId}` collection contains seeded records for test users (verify in Firebase console).

If any of the above fail, fix and retest before declaring Phase 2 complete.

## What's Next (Phase 3+)

- **Phase 3:** UI redesign — three-pane `/inbox`, editable action cards (PROPOSED/EDITING only — no writes yet), Clear + Recently cleared, row treatments per classification. Plan: `docs/superpowers/plans/2026-04-21-inbox-phase-3-ui-redesign.md`.
- **Phase 4:** Google write flow — real Calendar / Tasks commits with idempotency + double-click protection + duplicate detection + Gmail mark-as-read on Clear.
- **Phase 5:** PDF extraction with Life Graph pre-fill.
- **Phase 6:** Reply capability (`gmail.send`).
- **Phase 7:** Home widget redesign.
