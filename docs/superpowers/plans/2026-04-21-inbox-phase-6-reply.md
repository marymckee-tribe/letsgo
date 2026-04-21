# Inbox Redesign — Phase 6: AI-Drafted Reply via `gmail.send`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI-drafted reply capability to the inbox. A new `inboxRouter.draftReply` procedure generates a `suggestedDraft` for each `NEEDS_REPLY` action via `generateObject`, and a new `inboxRouter.sendReply` procedure composes an RFC 2822 message with `mimetext` and POSTs it to `gmail.googleapis.com/gmail/v1/users/me/messages/send` including the original `threadId` so the reply threads. The Action-deck reply card wires up to both procedures with an optimistic UI, a scope-denied degradation path, and the Phase 4 idempotency contract.

**Architecture:** Phase 6 is a server + UI slice layered on top of the tRPC baseline and the Phase 2 extraction pipeline. The existing `inboxRouter` gains two mutations (`draftReply`, `sendReply`), a shared `replyCommits` Firestore subcollection keyed by `${emailId}:${actionId}` for idempotency, and a tiny `gmail-sender.ts` server helper that mints an access token for the email's `accountId`, composes MIME with `mimetext`, and calls the Gmail `send` endpoint. AI drafts are stored on the action's `suggestedDraft` field so a page refresh doesn't regenerate. The UI replaces the Phase 3 Reply-card stub with a real editable textarea, a Send button that runs a mutation with optimistic `WRITING` status, and a scope-denied tooltip sourced from `trpc.accounts.list` (each account record carries its granted `scopes[]`). `NEEDS_REPLY` actions traverse the Phase 4 state machine: `PROPOSED → EDITING → WRITING → COMMITTED` (or `FAILED`). `DISMISSED_BY_CLEAR` is handled at the email level by Phase 3's Clear button and is not touched here.

**Tech Stack:** Next.js 16 (App Router), tRPC v11 + `@trpc/react-query`, TanStack Query v5, Firebase Admin SDK (server) + Firestore, `mimetext@^3` (zero-dep RFC 2822 composer), `@ai-sdk/openai` + `ai` (`generateObject`), Zod v4, Jest + ts-jest.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — sections "Reply capability", "Google Write Flow", "Auth & Multi-Account → Scopes", and the `NEEDS_REPLY` rows in the classification / action tables.

**Base branch:** Branch `feature/inbox-phase-6-reply` off the tip of `main` after Phases 1–3 are merged. This plan assumes:
- The tRPC migration plan (`2026-04-21-architecture-trpc-react-query.md`) has landed — `src/server/trpc/{index,context,root}.ts` exist, `inboxRouter` is mounted at `src/server/trpc/routers/inbox.ts`, the client uses `trpc.*.useQuery/useMutation` via `src/lib/trpc/provider.tsx`.
- Phase 2 (`2026-04-21-inbox-phase-2-ai-extraction.md`) has landed — the six-classification schema lives in `src/lib/server/classification-schema.ts`, the `Email`/`EmailAction` types in `src/lib/store.tsx` include `classification`, `senderIdentity`, and the `EmailActionStatus` enum (`PROPOSED | EDITING | WRITING | COMMITTED | DISMISSED | FAILED`).
- Phase 3 (`2026-04-21-inbox-phase-3-ui-redesign.md`) has landed — the Action-deck component already renders a `NEEDS_REPLY` card stub. If Phase 3's Reply card shape differs from what Task 8 expects, adapt Task 8 to edit the real component; do not re-scaffold.
- Phase 4 (`2026-04-21-inbox-phase-4-google-writes.md`) may or may not be merged yet. If it is, reuse the existing `commitKeys` Firestore helper and the `actionStatus` mutation hook from Phase 4; if not, this plan includes the minimal idempotency helper (`src/lib/server/commit-keys.ts`) and the local state-machine pattern. Either way the contract (`${emailId}:${actionId}` → `googleId`) is identical.

---

## Before You Start — Read These

Next.js 16 + tRPC v11 + the Gmail send API all have non-obvious footguns. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — catch-all handlers (still relevant even though tRPC wraps them)
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- `https://trpc.io/docs/server/error-handling` — how to throw `TRPCError` with a user-visible `code` (fetch via Context7 when ready)
- `https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates` — v5 optimistic-update pattern (`onMutate` / `onError` / `onSettled`)
- `https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send` — the raw-message + threadId contract
- `https://www.npmjs.com/package/mimetext` — the builder pattern (`new MIMEText().setSender(...).setRecipient(...).setHeader(...).setSubject(...).setMessage(...).asRaw()`)

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not reach for patterns from memory.

If `mimetext`'s actual API differs from what this plan shows (v3 is stable as of writing, but double-check), follow the package docs and update the plan in Task 5 accordingly — the key invariant is that the final `asRaw()` output must be a valid RFC 2822 message containing `In-Reply-To` and `References` headers pointing at the original email's `Message-ID`.

---

## File Structure

### New files
- `src/lib/server/gmail-sender.ts` — `sendRawReply({ accessToken, raw, threadId })` wraps the Gmail `send` HTTP call; returns `{ id, threadId }` on success, throws `GmailSendError` with parsed status on failure
- `src/lib/server/gmail-thread-headers.ts` — `fetchThreadHeaders(accessToken, messageId)` → `{ messageIdHeader, referencesHeader, subject, fromHeader }`; used by `sendReply` to build `In-Reply-To` / `References`
- `src/lib/server/compose-reply.ts` — `composeReply({ from, to, subject, body, inReplyTo, references })` → base64url-encoded raw MIME string (thin wrapper over `mimetext`)
- `src/lib/server/reply-commits.ts` — Firestore helpers: `getReplyCommit(uid, key)`, `putReplyCommit(uid, key, record)` (see Task 3 for the record shape). If Phase 4 already introduced `src/lib/server/commit-keys.ts`, reuse it instead — surfaced as a prereq check in Task 3 Step 1.
- `src/lib/server/draft-reply.ts` — `generateReplyDraft({ email, action, profiles })` → `{ body: string }`; calls `generateObject` with a Zod `{ body: z.string() }` schema
- `src/components/inbox/reply-card.tsx` — the full editable reply card mounted into the Action deck (replaces the Phase 3 stub)
- `src/lib/inbox/reply-scope.ts` — `hasReplyScope(account)` → boolean; pure function, exported so tests can pin it
- `tests/server/gmail-sender.test.ts`
- `tests/server/gmail-thread-headers.test.ts`
- `tests/server/compose-reply.test.ts`
- `tests/server/reply-commits.test.ts`
- `tests/server/draft-reply.test.ts`
- `tests/server/trpc/routers/inbox-reply.test.ts` — `sendReply` + `draftReply` procedures
- `tests/components/inbox/reply-card.test.tsx`
- `tests/lib/inbox/reply-scope.test.ts`

### Modified files
- `package.json` — add `mimetext` dep
- `src/lib/store.tsx` — extend `EmailAction` type with `suggestedDraft?: string` and extend `Account` type exposed to the client with `scopes: string[]` (if not already)
- `src/lib/server/classification-schema.ts` — extend `SuggestedActionSchema` with optional `suggestedDraft: z.string().optional()` (Phase 2 emits the action; Phase 6's `draftReply` populates `suggestedDraft` on demand)
- `src/server/trpc/routers/inbox.ts` — add `draftReply` + `sendReply` procedures alongside existing `digest` (and whatever Phase 3/4 added)
- `src/app/inbox/page.tsx` — swap the existing `NEEDS_REPLY` card stub for `<ReplyCard email={...} action={...} />`
- `src/components/inbox/action-deck.tsx` (if Phase 3 named it this; otherwise the file that renders the Action deck) — route `NEEDS_REPLY` actions to `<ReplyCard />`
- `firestore.rules` — add read/write rule for `users/{uid}/replyCommits/{key}` subcollection (tighten to owner-only)

### Out of scope for Phase 6
- Attachments on replies (deferred to a later phase)
- Scheduled send (deferred)
- Signature management (deferred)
- Reply-all (v1 replies to `From` only; the `to` override covers the single case the user has mentioned)
- Rewriting / editing an already-committed reply (the send is final; the card locks to the success stub)
- Any changes to the Phase 4 Calendar/Tasks commit flow

---

## Prerequisites (one-time)

- [ ] **P1. Confirm the tRPC baseline.** Run `ls src/server/trpc/routers/inbox.ts` — must exist. If not, stop and execute `2026-04-21-architecture-trpc-react-query.md` first.
- [ ] **P2. Confirm Phase 2 landed.** Run `grep -n "EmailActionStatus" src/lib/store.tsx` — must return a union containing `'PROPOSED' | 'EDITING' | 'WRITING' | 'COMMITTED' | 'DISMISSED' | 'FAILED'`. If it still says `'PENDING' | 'APPROVED' | 'DISMISSED'`, stop and execute Phase 2 first.
- [ ] **P3. Confirm the OAuth scope list already includes `gmail.send` and `gmail.modify`.** Run `grep -n "gmail" src/lib/server/google-oauth.ts`. Expected: both `gmail.send` and `gmail.modify` appear in `SCOPES`. If either is missing, add it here before proceeding — the rest of the plan assumes new accounts are linked with both scopes granted. (At time of writing the `SCOPES` constant in `src/lib/server/google-oauth.ts` already contains `https://www.googleapis.com/auth/gmail.send` and `https://www.googleapis.com/auth/gmail.modify` — Phase 1 landed them — so this is expected to be a no-op verification.)
- [ ] **P4. Firestore rules for the new `replyCommits` subcollection.** If the repo has `firestore.rules`, add a rule like:

  ```
  match /users/{uid}/replyCommits/{key} {
    allow read, write: if request.auth != null && request.auth.uid == uid;
  }
  ```

  Land this in the same PR. If rules are managed out-of-band, flag it to Mary in the PR body.
- [ ] **P5. No new env vars.** `OPENAI_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `FIREBASE_ADMIN_SA_JSON`, and the Google OAuth triplet are all reused.
- [ ] **P6. Create the working branch.** Run `git checkout -b feature/inbox-phase-6-reply`.

---

## Tasks

### Task 1: Install `mimetext` + verify scope prerequisites

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install the dep**

Run:

```bash
npm install mimetext@^3
```

Expected: `package.json` gains a `mimetext` entry under `dependencies`.

- [ ] **Step 2: Verify the scope list**

Run: `grep -n "gmail" src/lib/server/google-oauth.ts`

Expected output contains both:

```
https://www.googleapis.com/auth/gmail.send
https://www.googleapis.com/auth/gmail.modify
```

If either is missing, add it to the `SCOPES` array and commit separately with message `fix(oauth): add gmail.send/gmail.modify scope for Phase 6 reply + Phase 4 mark-as-read`. This causes Google to re-prompt on next sign-in — surface that in the PR description so Mary knows to re-link each account once after merge.

- [ ] **Step 3: Verify account records carry a `scopes` array**

Run: `grep -n "scopes" src/lib/server/accounts.ts`

Expected: the `Account` type includes `scopes: string[]` and `createAccount` persists it. Phase 1 already does this, so this should be a no-op confirmation. If not present, add it now.

- [ ] **Step 4: Sanity check**

Run:

```bash
npx tsc --noEmit
npx jest
```

Expected: zero type errors; all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add mimetext for RFC 2822 reply composition (Phase 6)"
```

---

### Task 2: Extend `EmailAction` with `suggestedDraft`

The Phase 2 action shape has no place to store the AI-generated reply body. Add one optional field. Keep the change additive — existing code paths are untouched.

**Files:**
- Modify: `src/lib/store.tsx`
- Modify: `src/lib/server/classification-schema.ts`

- [ ] **Step 1: Extend the Zod schema**

In `src/lib/server/classification-schema.ts`, inside `SuggestedActionSchema`, add a single optional field just above the `sourceQuote` entry:

```ts
suggestedDraft: z.string().optional(),
```

The full schema should end up looking like:

```ts
export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACTION_TYPE_VALUES),
  title: z.string().min(1),
  date: z.number().nullable().optional(),
  time: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  suggestedDraft: z.string().optional(),
  sourceQuote: z.string().min(1),
  confidence: ConfidenceSchema,
})
```

- [ ] **Step 2: Extend the store type**

In `src/lib/store.tsx`, add `suggestedDraft?: string` to `EmailAction`:

```ts
export type EmailAction = {
  id: string
  type: EmailActionType
  title: string
  date?: number
  time?: string
  context?: string
  suggestedDraft?: string
  sourceQuote: string
  confidence: "low" | "medium" | "high"
  status: EmailActionStatus
  googleId?: string
}
```

- [ ] **Step 3: Extend the Phase 2 schema test**

Open `tests/server/classification-schema.test.ts`. Find the `valid` fixture in the first `describe` block (the one titled `ClassifiedEmailsSchema`). Add a second test that proves `suggestedDraft` is optional and passes through unchanged:

```ts
it('accepts an action with suggestedDraft', () => {
  const withDraft = {
    emails: [{
      ...valid.emails[0],
      suggestedActions: [{
        ...valid.emails[0].suggestedActions[0],
        suggestedDraft: 'Hey Doug — Saturday works. Mary',
      }],
    }],
  }
  const parsed = ClassifiedEmailsSchema.parse(withDraft)
  expect(parsed.emails[0].suggestedActions[0].suggestedDraft).toBe('Hey Doug — Saturday works. Mary')
})
```

- [ ] **Step 4: Run**

Run: `npx jest tests/server/classification-schema.test.ts && npx tsc --noEmit`
Expected: the new test passes; the existing tests still pass; type-check clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx src/lib/server/classification-schema.ts tests/server/classification-schema.test.ts
git commit -m "feat(inbox): extend EmailAction with optional suggestedDraft"
```

---

### Task 3: Idempotency Firestore helper

Mirror Phase 4's pattern so `sendReply` retries are safe. If Phase 4 already merged and introduced `src/lib/server/commit-keys.ts`, delete this whole task and use that module instead (rename the `type` discriminator to `reply` and move on).

**Files:**
- Create: `src/lib/server/reply-commits.ts`
- Create: `tests/server/reply-commits.test.ts`

- [ ] **Step 1: Confirm Phase 4's commit-keys helper is absent**

Run: `ls src/lib/server/commit-keys.ts 2>/dev/null || echo "missing"`

If the file exists and exports `getCommitRecord` / `putCommitRecord`, skip to Task 4 and reuse it — drop in `kind: 'reply'` as a discriminator. Otherwise continue.

- [ ] **Step 2: Write the failing test**

Create `tests/server/reply-commits.test.ts`:

```ts
import { getReplyCommit, putReplyCommit } from '@/lib/server/reply-commits'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

const makeFakeDb = () => {
  const docs = new Map<string, Record<string, unknown>>()
  const mkDoc = (id: string) => ({
    id,
    get: async () => ({ exists: docs.has(id), id, data: () => docs.get(id) }),
    set: async (d: Record<string, unknown>) => { docs.set(id, d) },
  })
  const col = { doc: (id: string) => mkDoc(id) }
  return {
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    docs,
  }
}

describe('reply-commits', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('returns null when no commit exists', async () => {
    const rec = await getReplyCommit('uid-1', 'm1:a1')
    expect(rec).toBeNull()
  })

  it('round-trips a put → get', async () => {
    await putReplyCommit('uid-1', 'm1:a1', {
      googleMessageId: 'sent-abc',
      threadId: 'thread-xyz',
      sentAt: 1_745_000_000_000,
    })
    const rec = await getReplyCommit('uid-1', 'm1:a1')
    expect(rec).toEqual({
      googleMessageId: 'sent-abc',
      threadId: 'thread-xyz',
      sentAt: 1_745_000_000_000,
    })
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npx jest tests/server/reply-commits.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/reply-commits'`.

- [ ] **Step 4: Implement**

Create `src/lib/server/reply-commits.ts`:

```ts
import { getAdminDb } from './firebase-admin'

export interface ReplyCommitRecord {
  googleMessageId: string
  threadId: string
  sentAt: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('replyCommits')
}

export async function getReplyCommit(uid: string, key: string): Promise<ReplyCommitRecord | null> {
  const snap = await col(uid).doc(key).get()
  if (!snap.exists) return null
  return snap.data() as ReplyCommitRecord
}

export async function putReplyCommit(uid: string, key: string, record: ReplyCommitRecord): Promise<void> {
  await col(uid).doc(key).set(record)
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx jest tests/server/reply-commits.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/reply-commits.ts tests/server/reply-commits.test.ts
git commit -m "feat(inbox): Firestore idempotency helper for reply commits"
```

---

### Task 4: Fetch thread headers from Gmail

Gmail's `send` endpoint threads correctly only when the raw message carries `In-Reply-To` and `References` headers referencing the original email's `Message-ID`. The headers are NOT in the Phase 1 `fetchUnreadPrimary` output — we fetch them on demand at send time.

**Files:**
- Create: `src/lib/server/gmail-thread-headers.ts`
- Create: `tests/server/gmail-thread-headers.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/gmail-thread-headers.test.ts`:

```ts
import { fetchThreadHeaders } from '@/lib/server/gmail-thread-headers'

describe('fetchThreadHeaders', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('returns the Message-ID, References, Subject, From', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'm1',
        threadId: 't1',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<orig-123@mail.gmail.com>' },
            { name: 'References', value: '<older-1@x> <older-2@x>' },
            { name: 'Subject', value: 'Dinner Saturday' },
            { name: 'From', value: 'Doug <doug@example.com>' },
          ],
        },
      }),
    }) as unknown as typeof fetch

    const hdrs = await fetchThreadHeaders('at', 'm1')
    expect(hdrs.messageIdHeader).toBe('<orig-123@mail.gmail.com>')
    expect(hdrs.referencesHeader).toBe('<older-1@x> <older-2@x> <orig-123@mail.gmail.com>')
    expect(hdrs.subject).toBe('Dinner Saturday')
    expect(hdrs.fromHeader).toBe('Doug <doug@example.com>')
  })

  it('falls back to just Message-ID when References is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'm1',
        payload: {
          headers: [
            { name: 'Message-ID', value: '<only-one@mail.gmail.com>' },
            { name: 'Subject', value: 'Hi' },
            { name: 'From', value: 'a@b.c' },
          ],
        },
      }),
    }) as unknown as typeof fetch

    const hdrs = await fetchThreadHeaders('at', 'm1')
    expect(hdrs.referencesHeader).toBe('<only-one@mail.gmail.com>')
  })

  it('throws when Message-ID is missing (cannot thread)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'm1', payload: { headers: [{ name: 'Subject', value: 'Hi' }] } }),
    }) as unknown as typeof fetch

    await expect(fetchThreadHeaders('at', 'm1')).rejects.toThrow(/Message-ID/)
  })

  it('throws with the Gmail error message when the API returns 4xx', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: { message: 'Not Found' } }),
    }) as unknown as typeof fetch

    await expect(fetchThreadHeaders('at', 'm-missing')).rejects.toThrow(/Not Found/)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/server/gmail-thread-headers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/gmail-thread-headers.ts`:

```ts
export interface ThreadHeaders {
  messageIdHeader: string   // e.g. "<orig-123@mail.gmail.com>"
  referencesHeader: string  // existing References + Message-ID, space-separated
  subject: string
  fromHeader: string        // raw "Name <email>" value
}

export async function fetchThreadHeaders(accessToken: string, messageId: string): Promise<ThreadHeaders> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=Subject&metadataHeaders=From`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const msg = body?.error?.message ?? `Gmail messages.get failed with ${res.status}`
    throw new Error(msg)
  }
  const data = await res.json()
  const headers: { name: string; value?: string }[] = data?.payload?.headers ?? []
  const get = (name: string) =>
    headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

  const messageIdHeader = get('Message-ID') || get('Message-Id')
  if (!messageIdHeader) throw new Error('Original email has no Message-ID; cannot thread reply')

  const existingReferences = get('References').trim()
  const referencesHeader = existingReferences
    ? `${existingReferences} ${messageIdHeader}`
    : messageIdHeader

  return {
    messageIdHeader,
    referencesHeader,
    subject: get('Subject'),
    fromHeader: get('From'),
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/server/gmail-thread-headers.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/gmail-thread-headers.ts tests/server/gmail-thread-headers.test.ts
git commit -m "feat(inbox): fetch Message-ID/References/Subject/From for reply threading"
```

---

### Task 5: Compose RFC 2822 reply with `mimetext`

Pure, unit-testable function. No network, no Firestore.

**Files:**
- Create: `src/lib/server/compose-reply.ts`
- Create: `tests/server/compose-reply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/compose-reply.test.ts`:

```ts
import { composeReply } from '@/lib/server/compose-reply'

function decodeRaw(rawB64Url: string): string {
  const b64 = rawB64Url.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64').toString('utf8')
}

describe('composeReply', () => {
  const base = {
    from: 'Mary McKee <mary.mckee@tribe.ai>',
    to: 'Doug <doug@example.com>',
    subject: 'Re: Dinner Saturday',
    body: 'Saturday works — 7pm at ours. Mary',
    inReplyTo: '<orig-123@mail.gmail.com>',
    references: '<older-1@x> <orig-123@mail.gmail.com>',
  }

  it('returns a base64url-encoded string', () => {
    const raw = composeReply(base)
    expect(raw).toMatch(/^[A-Za-z0-9_-]+=*$/)
  })

  it('includes the In-Reply-To header exactly once', () => {
    const decoded = decodeRaw(composeReply(base))
    const matches = decoded.match(/^In-Reply-To:\s*<orig-123@mail\.gmail\.com>/gim) ?? []
    expect(matches.length).toBe(1)
  })

  it('includes the References header with both message IDs', () => {
    const decoded = decodeRaw(composeReply(base))
    expect(decoded).toMatch(/^References:\s*<older-1@x>\s+<orig-123@mail\.gmail\.com>/im)
  })

  it('includes the subject, from, to, and body', () => {
    const decoded = decodeRaw(composeReply(base))
    expect(decoded).toMatch(/^Subject:\s*Re: Dinner Saturday/im)
    expect(decoded).toMatch(/^From:.*mary\.mckee@tribe\.ai/im)
    expect(decoded).toMatch(/^To:.*doug@example\.com/im)
    expect(decoded).toContain('Saturday works — 7pm at ours. Mary')
  })

  it('adds "Re: " to a subject that does not already have one', () => {
    const raw = composeReply({ ...base, subject: 'Dinner Saturday' })
    const decoded = decodeRaw(raw)
    expect(decoded).toMatch(/^Subject:\s*Re: Dinner Saturday/im)
  })

  it('does not double-prefix "Re: "', () => {
    const raw = composeReply({ ...base, subject: 'Re: Dinner Saturday' })
    const decoded = decodeRaw(raw)
    expect(decoded).toMatch(/^Subject:\s*Re: Dinner Saturday$/im)
    expect(decoded).not.toMatch(/Subject:\s*Re: Re:/im)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/server/compose-reply.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/compose-reply.ts`:

```ts
import { createMimeMessage } from 'mimetext'

export interface ComposeReplyInput {
  from: string
  to: string
  subject: string
  body: string
  inReplyTo: string   // the original Message-ID header value, including angle brackets
  references: string  // pre-merged References value (existing + original Message-ID)
}

function ensureRePrefix(subject: string): string {
  return /^re:\s/i.test(subject) ? subject : `Re: ${subject}`
}

// Parse "Name <email>" or a bare "email" into the shape mimetext wants.
function parseAddress(raw: string): { name?: string; addr: string } {
  const match = raw.match(/^(?:"?([^"<]*?)"?\s*)?<([^>]+)>$/)
  if (match) return { name: (match[1] ?? '').trim() || undefined, addr: match[2].trim() }
  return { addr: raw.trim() }
}

export function composeReply(input: ComposeReplyInput): string {
  const msg = createMimeMessage()
  const from = parseAddress(input.from)
  const to = parseAddress(input.to)

  msg.setSender(from.name ? { name: from.name, addr: from.addr } : from.addr)
  msg.setRecipient(to.name ? { name: to.name, addr: to.addr } : to.addr)
  msg.setSubject(ensureRePrefix(input.subject))
  msg.setHeader('In-Reply-To', input.inReplyTo)
  msg.setHeader('References', input.references)
  msg.addMessage({ contentType: 'text/plain', data: input.body })

  // `asRaw()` returns a standard RFC 2822 string. Gmail's `send` endpoint wants it
  // base64url-encoded. `asEncoded()` already returns base64url in v3.
  return msg.asEncoded()
}
```

Note: `mimetext` v3 exposes `createMimeMessage()` (functional) and the `MIMEText` class. Either works; the functional form matches the v3 README. If the package you installed has a different surface — e.g. v2's `new MIMEText()` builder pattern — adapt the body of this function. The tests assert the decoded output, not the surface API, so they will catch drift.

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/server/compose-reply.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/compose-reply.ts tests/server/compose-reply.test.ts
git commit -m "feat(inbox): compose RFC 2822 reply via mimetext"
```

---

### Task 6: `gmail-sender.ts` — HTTP wrapper for `messages/send`

Thin module so the tRPC procedure stays readable. Wraps the one HTTP call, parses Gmail's error envelope, and surfaces 401 vs 403-insufficient-scope vs other errors distinctly.

**Files:**
- Create: `src/lib/server/gmail-sender.ts`
- Create: `tests/server/gmail-sender.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/gmail-sender.test.ts`:

```ts
import { sendRawReply, GmailSendError } from '@/lib/server/gmail-sender'

describe('sendRawReply', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('posts the raw body + threadId and returns { id, threadId }', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'sent-abc', threadId: 'thread-xyz' }),
    })
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await sendRawReply({ accessToken: 'at', raw: 'UkZDIEVOQ09ERUQ', threadId: 'thread-xyz' })
    expect(result).toEqual({ id: 'sent-abc', threadId: 'thread-xyz' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer at')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ raw: 'UkZDIEVOQ09ERUQ', threadId: 'thread-xyz' })
  })

  it('throws GmailSendError with code=UNAUTHENTICATED on 401', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid Credentials' } }),
    }) as unknown as typeof fetch

    await expect(sendRawReply({ accessToken: 'at', raw: 'X', threadId: 't' })).rejects.toMatchObject({
      name: 'GmailSendError',
      code: 'UNAUTHENTICATED',
      status: 401,
    })
  })

  it('throws GmailSendError with code=INSUFFICIENT_SCOPE on 403 when message mentions scope', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { message: 'Request had insufficient authentication scopes.' } }),
    }) as unknown as typeof fetch

    await expect(sendRawReply({ accessToken: 'at', raw: 'X', threadId: 't' })).rejects.toMatchObject({
      code: 'INSUFFICIENT_SCOPE',
      status: 403,
    })
  })

  it('throws GmailSendError with code=UNKNOWN on other errors', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Internal Error' } }),
    }) as unknown as typeof fetch

    await expect(sendRawReply({ accessToken: 'at', raw: 'X', threadId: 't' })).rejects.toMatchObject({
      code: 'UNKNOWN',
      status: 500,
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/server/gmail-sender.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/gmail-sender.ts`:

```ts
export type GmailSendErrorCode =
  | 'UNAUTHENTICATED'     // 401 — token expired; caller should refresh and retry
  | 'INSUFFICIENT_SCOPE'  // 403 w/ scope message — user must re-link account
  | 'UNKNOWN'             // everything else

export class GmailSendError extends Error {
  readonly name = 'GmailSendError'
  constructor(
    public readonly code: GmailSendErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export interface SendRawReplyInput {
  accessToken: string
  raw: string        // base64url-encoded RFC 2822 message
  threadId: string   // original thread id so the reply threads in Gmail
}

export interface SendRawReplyResult {
  id: string
  threadId: string
}

export async function sendRawReply(input: SendRawReplyInput): Promise<SendRawReplyResult> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: input.raw, threadId: input.threadId }),
  })

  if (res.ok) {
    const data = await res.json()
    return { id: data.id, threadId: data.threadId }
  }

  const errBody = await res.json().catch(() => ({}))
  const message: string = errBody?.error?.message ?? `Gmail send failed with ${res.status}`
  if (res.status === 401) throw new GmailSendError('UNAUTHENTICATED', 401, message)
  if (res.status === 403 && /scope/i.test(message)) {
    throw new GmailSendError('INSUFFICIENT_SCOPE', 403, message)
  }
  throw new GmailSendError('UNKNOWN', res.status, message)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/server/gmail-sender.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/gmail-sender.ts tests/server/gmail-sender.test.ts
git commit -m "feat(inbox): gmail-sender wrapper with typed error codes"
```

---

### Task 7: `draftReply` AI generator

Pure module: given an email, the action, and the user's Life Graph profiles, call `generateObject` and return `{ body }`. The tRPC procedure (Task 8) stores the result on the action.

**Files:**
- Create: `src/lib/server/draft-reply.ts`
- Create: `tests/server/draft-reply.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/draft-reply.test.ts`:

```ts
import { generateReplyDraft, buildDraftPrompt } from '@/lib/server/draft-reply'
import type { EntityProfile } from '@/lib/store'
import * as aiModule from 'ai'

jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

const emailFixture = {
  id: 'm1',
  subject: 'Dinner Saturday',
  sender: 'Doug <doug@example.com>',
  fullBody: 'Can you confirm dinner on Saturday?',
}

const actionFixture = {
  id: 'a1',
  type: 'NEEDS_REPLY' as const,
  title: 'Re: Dinner Saturday',
  sourceQuote: 'Can you confirm dinner on Saturday?',
}

const profiles: EntityProfile[] = [
  { id: 'doug', name: 'Doug', type: 'Adult', currentContext: '', preferences: ['he prefers brief messages'], routines: [], sizes: {}, medicalNotes: '' },
  { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
]

describe('buildDraftPrompt', () => {
  it('includes the sender profile preferences when the profile is known', () => {
    const prompt = buildDraftPrompt({ email: emailFixture, action: actionFixture, profiles, senderPersonId: 'doug' })
    expect(prompt).toContain('Doug')
    expect(prompt).toContain('he prefers brief messages')
  })

  it('always includes the default tone instruction', () => {
    const prompt = buildDraftPrompt({ email: emailFixture, action: actionFixture, profiles, senderPersonId: null })
    expect(prompt.toLowerCase()).toContain('warm-professional')
  })

  it('includes the user (Mary) as the author identity', () => {
    const prompt = buildDraftPrompt({ email: emailFixture, action: actionFixture, profiles, senderPersonId: 'doug' })
    expect(prompt).toMatch(/writing.*as.*Mary/i)
  })

  it('embeds the full email body so the model has context', () => {
    const prompt = buildDraftPrompt({ email: emailFixture, action: actionFixture, profiles, senderPersonId: 'doug' })
    expect(prompt).toContain('Can you confirm dinner on Saturday?')
  })
})

describe('generateReplyDraft', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { body: 'Saturday works — 7pm at ours. Mary' },
    })
  })

  it('returns the generated body', async () => {
    const { body } = await generateReplyDraft({
      email: emailFixture, action: actionFixture, profiles, senderPersonId: 'doug',
    })
    expect(body).toBe('Saturday works — 7pm at ours. Mary')
  })

  it('passes a Zod schema with body:string to generateObject', async () => {
    await generateReplyDraft({ email: emailFixture, action: actionFixture, profiles, senderPersonId: 'doug' })
    const call = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(call.schema).toBeDefined()
    const parsed = call.schema.safeParse({ body: 'ok' })
    expect(parsed.success).toBe(true)
    const bad = call.schema.safeParse({ body: 123 })
    expect(bad.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/server/draft-reply.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/draft-reply.ts`:

```ts
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import type { EntityProfile, EmailAction } from '@/lib/store'

export interface DraftReplyEmailInput {
  id: string
  subject: string
  sender: string
  fullBody: string
}

export interface BuildDraftPromptArgs {
  email: DraftReplyEmailInput
  action: Pick<EmailAction, 'id' | 'type' | 'title' | 'sourceQuote'>
  profiles: EntityProfile[]
  senderPersonId: string | null
}

const AUTHOR_ID = 'mary'       // hardcoded: the app has exactly one user (Mary)
const AUTHOR_DISPLAY = 'Mary'
const DEFAULT_TONE = 'warm-professional'

export function buildDraftPrompt({ email, action, profiles, senderPersonId }: BuildDraftPromptArgs): string {
  const sender = senderPersonId ? profiles.find(p => p.id === senderPersonId) : null
  const author = profiles.find(p => p.id === AUTHOR_ID)

  const senderBlock = sender
    ? `Recipient Life Graph profile for ${sender.name}:\n${JSON.stringify({
        name: sender.name,
        preferences: sender.preferences,
        currentContext: sender.currentContext,
      }, null, 2)}`
    : 'Recipient is not in the Life Graph — no profile context available.'

  const authorBlock = author
    ? `You are writing as ${AUTHOR_DISPLAY}. Author preferences: ${(author.preferences ?? []).join('; ') || '(none)'}.`
    : `You are writing as ${AUTHOR_DISPLAY}.`

  return [
    `You draft an email reply for ${AUTHOR_DISPLAY}.`,
    `Default tone: ${DEFAULT_TONE}. Keep it concise; no sign-off flourishes beyond a simple "${AUTHOR_DISPLAY}" at the end.`,
    authorBlock,
    senderBlock,
    '',
    'ORIGINAL EMAIL:',
    `Subject: ${email.subject}`,
    `From: ${email.sender}`,
    `Body:\n${email.fullBody}`,
    '',
    `The action being replied to: ${action.title}.`,
    `The sentence that triggered this reply: "${action.sourceQuote}"`,
    '',
    'Return a JSON object { body: string } where body is the plain-text reply message. Do not include a Subject line — only the body.',
  ].join('\n')
}

export async function generateReplyDraft(args: BuildDraftPromptArgs): Promise<{ body: string }> {
  const prompt = buildDraftPrompt(args)
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: z.object({ body: z.string().min(1) }),
    prompt,
  })
  return { body: object.body }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/server/draft-reply.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/draft-reply.ts tests/server/draft-reply.test.ts
git commit -m "feat(inbox): AI reply-draft generator with Life Graph context"
```

---

### Task 8: tRPC `inboxRouter.draftReply` + `inboxRouter.sendReply`

Wire everything together. Both procedures are mutations (side-effectful: either OpenAI spend or an actual send). `draftReply` returns `{ body, stored }` (the stored body, persisted on the email's action). `sendReply` returns `{ googleMessageId, threadId }` and honors the Phase 4 idempotency contract.

**Files:**
- Modify: `src/server/trpc/routers/inbox.ts`
- Create: `src/lib/server/reply-storage.ts` — tiny helper to persist `suggestedDraft` back onto an email record (Firestore-backed; re-reads `digest` will still regenerate the action id list, so `draftReply` also returns the body for the immediate UI update)
- Create: `tests/server/reply-storage.test.ts`
- Create: `tests/server/trpc/routers/inbox-reply.test.ts`

- [ ] **Step 1: Inspect the current `inboxRouter` shape**

Run: `cat src/server/trpc/routers/inbox.ts`

Note whether Phase 2/3/4 added any procedures (`markCleared`, `classify`, etc.) so your new procedures slot in without colliding. If `digest` is the only procedure, that is also fine.

- [ ] **Step 2: Write the `reply-storage` test**

Create `tests/server/reply-storage.test.ts`:

```ts
import { persistSuggestedDraft, readSuggestedDraft } from '@/lib/server/reply-storage'
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
  const col = { doc: (id: string) => mkDoc(id) }
  return {
    db: { collection: () => ({ doc: () => ({ collection: () => col }) }) },
    docs,
  }
}

describe('reply-storage', () => {
  beforeEach(() => {
    const { db } = makeFakeDb()
    ;(getAdminDb as jest.Mock).mockReturnValue(db)
  })

  it('round-trips a suggested draft keyed by emailId:actionId', async () => {
    await persistSuggestedDraft('uid-1', 'm1', 'a1', 'Saturday works — 7pm')
    const body = await readSuggestedDraft('uid-1', 'm1', 'a1')
    expect(body).toBe('Saturday works — 7pm')
  })

  it('returns null when no draft exists', async () => {
    const body = await readSuggestedDraft('uid-1', 'm1', 'a1')
    expect(body).toBeNull()
  })
})
```

- [ ] **Step 3: Implement `reply-storage`**

Create `src/lib/server/reply-storage.ts`:

```ts
import { getAdminDb } from './firebase-admin'

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('replyDrafts')
}

function keyOf(emailId: string, actionId: string): string {
  return `${emailId}:${actionId}`
}

export async function persistSuggestedDraft(
  uid: string, emailId: string, actionId: string, body: string
): Promise<void> {
  await col(uid).doc(keyOf(emailId, actionId)).set({ body, updatedAt: Date.now() }, { merge: true })
}

export async function readSuggestedDraft(
  uid: string, emailId: string, actionId: string
): Promise<string | null> {
  const snap = await col(uid).doc(keyOf(emailId, actionId)).get()
  if (!snap.exists) return null
  return (snap.data()?.body as string) ?? null
}
```

- [ ] **Step 4: Write the router test**

Create `tests/server/trpc/routers/inbox-reply.test.ts`:

```ts
import { TRPCError } from '@trpc/server'
import { inboxRouter } from '@/server/trpc/routers/inbox'
import { listAccounts, getDecryptedRefreshToken, getAccount } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchThreadHeaders } from '@/lib/server/gmail-thread-headers'
import { sendRawReply, GmailSendError } from '@/lib/server/gmail-sender'
import { getReplyCommit, putReplyCommit } from '@/lib/server/reply-commits'
import { generateReplyDraft } from '@/lib/server/draft-reply'
import { listProfiles } from '@/lib/server/profiles'
import { persistSuggestedDraft } from '@/lib/server/reply-storage'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-thread-headers')
jest.mock('@/lib/server/gmail-sender')
jest.mock('@/lib/server/reply-commits')
jest.mock('@/lib/server/draft-reply')
jest.mock('@/lib/server/profiles')
jest.mock('@/lib/server/reply-storage')
jest.mock('@/lib/server/gmail-fetcher')

const maryAccount = {
  id: 'a1', email: 'mary.mckee@tribe.ai', refreshToken: 'enc', scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.modify',
  ], addedAt: 1,
}

const threadHeaders = {
  messageIdHeader: '<orig-123@mail.gmail.com>',
  referencesHeader: '<orig-123@mail.gmail.com>',
  subject: 'Dinner Saturday',
  fromHeader: 'Doug <doug@example.com>',
}

describe('inboxRouter.sendReply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([maryAccount])
    ;(getAccount as jest.Mock).mockResolvedValue(maryAccount)
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchThreadHeaders as jest.Mock).mockResolvedValue(threadHeaders)
    ;(sendRawReply as jest.Mock).mockResolvedValue({ id: 'sent-abc', threadId: 'thread-xyz' })
    ;(getReplyCommit as jest.Mock).mockResolvedValue(null)
    ;(putReplyCommit as jest.Mock).mockResolvedValue(undefined)
  })

  it('sends a reply and persists the commit record', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.sendReply({
      emailId: 'm1',
      accountId: 'a1',
      actionId: 'a1',
      body: 'Saturday works — Mary',
    })
    expect(result).toEqual({ googleMessageId: 'sent-abc', threadId: 'thread-xyz' })
    expect(putReplyCommit).toHaveBeenCalledWith('mary-uid', 'm1:a1', expect.objectContaining({
      googleMessageId: 'sent-abc',
      threadId: 'thread-xyz',
    }))
  })

  it('returns the existing googleMessageId on idempotent retry without re-sending', async () => {
    ;(getReplyCommit as jest.Mock).mockResolvedValue({
      googleMessageId: 'sent-abc',
      threadId: 'thread-xyz',
      sentAt: 1,
    })
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Saturday works — Mary',
    })
    expect(result).toEqual({ googleMessageId: 'sent-abc', threadId: 'thread-xyz' })
    expect(sendRawReply).not.toHaveBeenCalled()
  })

  it('retries once on 401 after refreshing the access token', async () => {
    ;(sendRawReply as jest.Mock)
      .mockRejectedValueOnce(new GmailSendError('UNAUTHENTICATED', 401, 'expired'))
      .mockResolvedValueOnce({ id: 'sent-abc', threadId: 'thread-xyz' })
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Body',
    })
    expect(result.googleMessageId).toBe('sent-abc')
    expect(sendRawReply).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
  })

  it('throws FORBIDDEN with a scope-denied code when Gmail returns INSUFFICIENT_SCOPE', async () => {
    ;(sendRawReply as jest.Mock).mockRejectedValue(
      new GmailSendError('INSUFFICIENT_SCOPE', 403, 'insufficient scope')
    )
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Body',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller({})
    await expect(caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Body',
    })).rejects.toBeInstanceOf(TRPCError)
  })

  it('rejects when the account is missing the gmail.send scope', async () => {
    ;(getAccount as jest.Mock).mockResolvedValue({
      ...maryAccount,
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    })
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Body',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(sendRawReply).not.toHaveBeenCalled()
  })

  it('includes In-Reply-To and References in the composed raw message', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    await caller.sendReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1', body: 'Saturday works',
    })
    const { raw } = (sendRawReply as jest.Mock).mock.calls[0][0]
    const decoded = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toMatch(/^In-Reply-To:\s*<orig-123@mail\.gmail\.com>/im)
    expect(decoded).toMatch(/^References:\s*<orig-123@mail\.gmail\.com>/im)
  })
})

describe('inboxRouter.draftReply', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listProfiles as jest.Mock).mockResolvedValue([
      { id: 'mary', name: 'Mary', type: 'Adult', currentContext: '', preferences: [], routines: [], sizes: {}, medicalNotes: '' },
      { id: 'doug', name: 'Doug', type: 'Adult', currentContext: '', preferences: ['brief'], routines: [], sizes: {}, medicalNotes: '' },
    ])
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Dinner Saturday', sender: 'Doug <doug@example.com>', fullBody: 'Saturday?', snippet: 's', date: 1 },
    ])
    ;(listAccounts as jest.Mock).mockResolvedValue([maryAccount])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(generateReplyDraft as jest.Mock).mockResolvedValue({ body: 'Saturday works — Mary' })
    ;(persistSuggestedDraft as jest.Mock).mockResolvedValue(undefined)
  })

  it('generates a draft and persists it', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.draftReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1',
      action: { id: 'a1', type: 'NEEDS_REPLY', title: 'Re: Dinner', sourceQuote: 'Saturday?' },
      senderPersonId: 'doug',
    })
    expect(result.body).toBe('Saturday works — Mary')
    expect(persistSuggestedDraft).toHaveBeenCalledWith('mary-uid', 'm1', 'a1', 'Saturday works — Mary')
  })

  it('rejects unauthenticated callers', async () => {
    const caller = inboxRouter.createCaller({})
    await expect(caller.draftReply({
      emailId: 'm1', accountId: 'a1', actionId: 'a1',
      action: { id: 'a1', type: 'NEEDS_REPLY', title: 'Re', sourceQuote: 'q' },
      senderPersonId: null,
    })).rejects.toBeInstanceOf(TRPCError)
  })
})
```

- [ ] **Step 5: Run to verify failure**

Run: `npx jest tests/server/trpc/routers/inbox-reply.test.ts`
Expected: FAIL — the procedures don't exist yet.

- [ ] **Step 6: Implement the procedures**

Open `src/server/trpc/routers/inbox.ts` and add the following — keep existing procedures (Phase 1 `digest`, Phase 2 whatever, Phase 4 whatever) intact.

Add at the top of the file:

```ts
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { getAccount, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchThreadHeaders } from '@/lib/server/gmail-thread-headers'
import { composeReply } from '@/lib/server/compose-reply'
import { sendRawReply, GmailSendError } from '@/lib/server/gmail-sender'
import { getReplyCommit, putReplyCommit } from '@/lib/server/reply-commits'
import { generateReplyDraft } from '@/lib/server/draft-reply'
import { listProfiles } from '@/lib/server/profiles'
import { persistSuggestedDraft } from '@/lib/server/reply-storage'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
```

Add these inside the existing `router({ ... })` block alongside `digest`:

```ts
sendReply: protectedProcedure
  .input(z.object({
    emailId: z.string().min(1),
    accountId: z.string().min(1),
    actionId: z.string().min(1),
    body: z.string().min(1),
    subject: z.string().optional(),
    to: z.string().email().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const key = `${input.emailId}:${input.actionId}`

    const existing = await getReplyCommit(ctx.uid, key)
    if (existing) {
      return { googleMessageId: existing.googleMessageId, threadId: existing.threadId }
    }

    const account = await getAccount(ctx.uid, input.accountId)
    if (!account) throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' })
    if (!account.scopes.includes('https://www.googleapis.com/auth/gmail.send')) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'This account is not authorized to send replies. Re-link it to grant gmail.send.',
      })
    }

    const rt = await getDecryptedRefreshToken(ctx.uid, input.accountId)
    if (!rt) throw new TRPCError({ code: 'FAILED_PRECONDITION', message: 'Missing refresh token' })

    const sendOnce = async (): Promise<{ id: string; threadId: string }> => {
      const { accessToken } = await refreshAccessToken(rt)
      const hdrs = await fetchThreadHeaders(accessToken, input.emailId)
      const raw = composeReply({
        from: `${account.email}`,
        to: input.to ?? hdrs.fromHeader,
        subject: input.subject ?? hdrs.subject,
        body: input.body,
        inReplyTo: hdrs.messageIdHeader,
        references: hdrs.referencesHeader,
      })
      // Gmail uses the threadId on the original email; we pass it straight through.
      // We fetch it implicitly through `threadId` on the messages.get call; to keep
      // a single round-trip, ask Gmail via the thread-headers endpoint (payload.threadId).
      // fetchThreadHeaders returns subject/from/message-id/references but not threadId;
      // we'd have to re-query. Cheaper: use the original emailId's threadId directly —
      // the inbox store has it. For now, fetch it here.
      const threadRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${input.emailId}?format=metadata&fields=threadId`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      )
      const threadBody = await threadRes.json()
      if (!threadRes.ok || !threadBody.threadId) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Could not resolve threadId' })
      }
      return sendRawReply({ accessToken, raw, threadId: threadBody.threadId })
    }

    let result: { id: string; threadId: string }
    try {
      result = await sendOnce()
    } catch (err) {
      if (err instanceof GmailSendError && err.code === 'UNAUTHENTICATED') {
        // Token race — refresh and retry once.
        result = await sendOnce()
      } else if (err instanceof GmailSendError && err.code === 'INSUFFICIENT_SCOPE') {
        throw new TRPCError({ code: 'FORBIDDEN', message: err.message })
      } else if (err instanceof GmailSendError) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err.message })
      } else {
        throw err
      }
    }

    await putReplyCommit(ctx.uid, key, {
      googleMessageId: result.id,
      threadId: result.threadId,
      sentAt: Date.now(),
    })
    return { googleMessageId: result.id, threadId: result.threadId }
  }),

draftReply: protectedProcedure
  .input(z.object({
    emailId: z.string().min(1),
    accountId: z.string().min(1),
    actionId: z.string().min(1),
    action: z.object({
      id: z.string().min(1),
      type: z.literal('NEEDS_REPLY'),
      title: z.string().min(1),
      sourceQuote: z.string().min(1),
    }),
    senderPersonId: z.string().nullable(),
  }))
  .mutation(async ({ ctx, input }) => {
    const rt = await getDecryptedRefreshToken(ctx.uid, input.accountId)
    if (!rt) throw new TRPCError({ code: 'FAILED_PRECONDITION', message: 'Missing refresh token' })
    const { accessToken } = await refreshAccessToken(rt)
    const [profiles, raws] = await Promise.all([
      listProfiles(ctx.uid),
      fetchUnreadPrimary(accessToken),
    ])
    const email = raws.find(r => r.id === input.emailId)
    if (!email) throw new TRPCError({ code: 'NOT_FOUND', message: 'Email not found' })

    const { body } = await generateReplyDraft({
      email: { id: email.id, subject: email.subject, sender: email.sender, fullBody: email.fullBody },
      action: input.action,
      profiles,
      senderPersonId: input.senderPersonId,
    })

    await persistSuggestedDraft(ctx.uid, input.emailId, input.actionId, body)
    return { body }
  }),
```

Notes on the `sendOnce` design:
- Calls `refreshAccessToken` inside `sendOnce` so a 401 retry naturally gets a fresh token.
- Fetches `threadId` via a tiny second Gmail call; this avoids expanding the `fetchThreadHeaders` return shape and keeps that function's contract focused.
- Never calls `sendRawReply` more than twice.

- [ ] **Step 7: Run to verify pass**

Run: `npx jest tests/server/reply-storage.test.ts tests/server/trpc/routers/inbox-reply.test.ts`
Expected: PASS (2 tests in reply-storage + 8 tests across sendReply/draftReply = 10 total).

- [ ] **Step 8: Full server suite**

Run: `npx tsc --noEmit && npx jest`
Expected: zero type errors; all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/server/reply-storage.ts src/server/trpc/routers/inbox.ts tests/server/reply-storage.test.ts tests/server/trpc/routers/inbox-reply.test.ts
git commit -m "feat(inbox): tRPC draftReply + sendReply with idempotency and 401 retry"
```

---

### Task 9: Scope-check helper for the UI

Pure function shared between the Reply card (Task 10) and its tests.

**Files:**
- Create: `src/lib/inbox/reply-scope.ts`
- Create: `tests/lib/inbox/reply-scope.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/inbox/reply-scope.test.ts`:

```ts
import { hasReplyScope, SEND_SCOPE, MODIFY_SCOPE } from '@/lib/inbox/reply-scope'

describe('hasReplyScope', () => {
  it('returns true when gmail.send is present', () => {
    expect(hasReplyScope({ scopes: [SEND_SCOPE, MODIFY_SCOPE] })).toBe(true)
  })

  it('returns false when gmail.send is absent', () => {
    expect(hasReplyScope({ scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })).toBe(false)
  })

  it('returns false when account is undefined', () => {
    expect(hasReplyScope(undefined)).toBe(false)
  })

  it('returns false when scopes is undefined', () => {
    expect(hasReplyScope({})).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/lib/inbox/reply-scope.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/inbox/reply-scope.ts`:

```ts
export const SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'
export const MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify'

export function hasReplyScope(account: { scopes?: string[] } | undefined | null): boolean {
  return Boolean(account?.scopes?.includes(SEND_SCOPE))
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/lib/inbox/reply-scope.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox/reply-scope.ts tests/lib/inbox/reply-scope.test.ts
git commit -m "feat(inbox): reply-scope predicate helper"
```

---

### Task 10: `<ReplyCard />` component

Replaces the Phase 3 `NEEDS_REPLY` stub. Owns its textarea state, runs the two mutations, renders the scope-denied degraded state, and surfaces the three terminal UI states (editing, writing, committed, failed).

**Files:**
- Create: `src/components/inbox/reply-card.tsx`
- Create: `tests/components/inbox/reply-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/inbox/reply-card.test.tsx`:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReplyCard } from '@/components/inbox/reply-card'
import { trpc } from '@/lib/trpc/client'

// Stub the trpc hooks. The component only consumes three entry points.
jest.mock('@/lib/trpc/client', () => {
  const sendReplyMutate = jest.fn()
  const draftReplyMutate = jest.fn()
  return {
    trpc: {
      inbox: {
        sendReply: {
          useMutation: () => ({
            mutate: sendReplyMutate,
            mutateAsync: sendReplyMutate,
            isPending: false,
            isError: false,
            isSuccess: false,
            reset: jest.fn(),
            error: null,
            data: null,
          }),
        },
        draftReply: {
          useMutation: () => ({
            mutate: draftReplyMutate,
            mutateAsync: draftReplyMutate,
            isPending: false,
            isError: false,
            isSuccess: false,
            reset: jest.fn(),
            error: null,
            data: null,
          }),
        },
      },
      accounts: {
        list: { useQuery: () => ({ data: { accounts: [{ id: 'a1', email: 'mary@tribe.ai', scopes: ['https://www.googleapis.com/auth/gmail.send'] }] } }) },
      },
    },
    __sendReplyMutate: sendReplyMutate,
    __draftReplyMutate: draftReplyMutate,
  }
})

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient()
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const baseEmail = {
  id: 'm1',
  accountId: 'a1',
  subject: 'Dinner Saturday',
  sender: 'Doug <doug@example.com>',
  senderIdentity: { personId: 'doug', confidence: 'high' as const },
  classification: 'NEEDS_REPLY' as const,
  snippet: 'Saturday?',
  fullBody: 'Saturday?',
  attachments: [],
  suggestedActions: [],
  date: 1,
  hubStatus: 'UNREAD' as const,
}

const baseAction = {
  id: 'a1',
  type: 'NEEDS_REPLY' as const,
  title: 'Re: Dinner Saturday',
  sourceQuote: 'Saturday?',
  confidence: 'high' as const,
  status: 'PROPOSED' as const,
  suggestedDraft: 'Saturday works — Mary',
}

describe('<ReplyCard />', () => {
  it('pre-fills the textarea with suggestedDraft', () => {
    render(<Wrapper><ReplyCard email={baseEmail} action={baseAction} /></Wrapper>)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toBe('Saturday works — Mary')
  })

  it('calls sendReply on Send click with the edited body', async () => {
    const { __sendReplyMutate } = jest.requireMock('@/lib/trpc/client') as { __sendReplyMutate: jest.Mock }
    render(<Wrapper><ReplyCard email={baseEmail} action={baseAction} /></Wrapper>)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Saturday 7pm. Mary' } })
    fireEvent.click(screen.getByRole('button', { name: /Send reply/i }))
    await waitFor(() => {
      expect(__sendReplyMutate).toHaveBeenCalledWith(expect.objectContaining({
        emailId: 'm1',
        accountId: 'a1',
        actionId: 'a1',
        body: 'Saturday 7pm. Mary',
      }))
    })
  })

  it('disables Send and shows a tooltip when the account lacks gmail.send', () => {
    jest.resetModules()
    jest.doMock('@/lib/trpc/client', () => ({
      trpc: {
        inbox: {
          sendReply: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, isSuccess: false, reset: jest.fn(), error: null, data: null }) },
          draftReply: { useMutation: () => ({ mutate: jest.fn(), isPending: false, isError: false, isSuccess: false, reset: jest.fn(), error: null, data: null }) },
        },
        accounts: {
          list: { useQuery: () => ({ data: { accounts: [{ id: 'a1', email: 'mary@tribe.ai', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] }] } }) },
        },
      },
    }))
    const { ReplyCard: ScopelessReplyCard } = require('@/components/inbox/reply-card') as typeof import('@/components/inbox/reply-card')
    render(<Wrapper><ScopelessReplyCard email={baseEmail} action={baseAction} /></Wrapper>)
    const btn = screen.getByRole('button', { name: /Send reply/i })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/Re-link account to enable replies/i))
    expect(screen.getByRole('link', { name: /Re-link/i })).toBeInTheDocument()
  })

  it('triggers Draft again → draftReply mutation', async () => {
    const { __draftReplyMutate } = jest.requireMock('@/lib/trpc/client') as { __draftReplyMutate: jest.Mock }
    render(<Wrapper><ReplyCard email={baseEmail} action={baseAction} /></Wrapper>)
    fireEvent.click(screen.getByRole('button', { name: /Draft again/i }))
    await waitFor(() => {
      expect(__draftReplyMutate).toHaveBeenCalledWith(expect.objectContaining({
        emailId: 'm1',
        accountId: 'a1',
        actionId: 'a1',
        senderPersonId: 'doug',
      }))
    })
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx jest tests/components/inbox/reply-card.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `src/components/inbox/reply-card.tsx`:

```tsx
"use client"

import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { hasReplyScope } from '@/lib/inbox/reply-scope'
import type { Email, EmailAction } from '@/lib/store'

interface Props {
  email: Email
  action: EmailAction
  onCommitted?: (googleMessageId: string) => void
}

type Phase = 'editing' | 'writing' | 'committed' | 'failed'

export function ReplyCard({ email, action, onCommitted }: Props) {
  const [body, setBody] = useState<string>(action.suggestedDraft ?? '')
  const [phase, setPhase] = useState<Phase>(
    action.status === 'COMMITTED' ? 'committed' : 'editing'
  )
  const [committed, setCommitted] = useState<{ googleMessageId: string } | null>(
    action.googleId ? { googleMessageId: action.googleId } : null
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const accountsQ = trpc.accounts.list.useQuery(undefined, { staleTime: 60_000 })
  const account = accountsQ.data?.accounts.find(a => a.id === email.accountId)
  const canSend = hasReplyScope(account)

  const sendReply = trpc.inbox.sendReply.useMutation()
  const draftReply = trpc.inbox.draftReply.useMutation()

  // If the action arrived without a suggestedDraft, kick off a draft on mount.
  useEffect(() => {
    if (!action.suggestedDraft && body === '' && !draftReply.isPending) {
      runDraftAgain()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function runDraftAgain() {
    if (!email.accountId) return
    setErrorMessage(null)
    try {
      const res = await draftReply.mutateAsync({
        emailId: email.id,
        accountId: email.accountId,
        actionId: action.id,
        action: {
          id: action.id,
          type: 'NEEDS_REPLY',
          title: action.title,
          sourceQuote: action.sourceQuote,
        },
        senderPersonId: email.senderIdentity?.personId ?? null,
      })
      setBody(res.body)
    } catch (err: unknown) {
      setErrorMessage((err as Error).message || 'Could not generate draft')
    }
  }

  async function runSend() {
    if (!email.accountId || !canSend) return
    setPhase('writing')
    setErrorMessage(null)
    try {
      const res = await sendReply.mutateAsync({
        emailId: email.id,
        accountId: email.accountId,
        actionId: action.id,
        body,
      })
      setCommitted({ googleMessageId: res.googleMessageId })
      setPhase('committed')
      onCommitted?.(res.googleMessageId)
    } catch (err: unknown) {
      setPhase('failed')
      setErrorMessage((err as Error).message || 'Send failed')
    }
  }

  if (phase === 'committed' && committed) {
    const gmailUrl = `https://mail.google.com/mail/u/0/#sent/${committed.googleMessageId}`
    return (
      <div className="bg-white border border-border/50 p-4 text-xs text-foreground/70">
        <span className="font-bold">✓ Reply sent</span>{' '}
        ·{' '}
        <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="underline">
          open in Gmail ↗
        </a>
      </div>
    )
  }

  return (
    <div className="bg-white border border-foreground p-5 shadow-[4px_4px_0_rgba(0,0,0,0.05)]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block mb-2">
        Reply
      </span>
      <h4 className="font-serif text-base font-bold mb-2">{action.title}</h4>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={phase === 'writing'}
        rows={6}
        className="w-full border border-border p-2 font-serif text-sm resize-vertical"
        aria-label="Reply body"
      />

      {phase === 'writing' && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mt-2">
          Sending…
        </p>
      )}

      {phase === 'failed' && errorMessage && (
        <p className="text-xs text-red-600 mt-2">{errorMessage}</p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={runSend}
          disabled={!canSend || phase === 'writing' || body.trim().length === 0}
          title={
            !canSend
              ? 'Re-link account to enable replies'
              : phase === 'writing'
              ? 'Sending in progress'
              : ''
          }
          className="text-[10px] font-bold uppercase tracking-widest bg-foreground text-background px-3 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {phase === 'failed' ? 'Retry send' : 'Send reply'}
        </button>

        <button
          onClick={runDraftAgain}
          disabled={draftReply.isPending || phase === 'writing'}
          className="text-[10px] font-bold uppercase tracking-widest border border-border px-3 py-2 disabled:opacity-40"
        >
          {draftReply.isPending ? 'Drafting…' : 'Draft again'}
        </button>

        {!canSend && (
          <a
            href="/settings#accounts"
            className="text-[10px] font-bold uppercase tracking-widest underline px-3 py-2"
          >
            Re-link
          </a>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx jest tests/components/inbox/reply-card.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/reply-card.tsx tests/components/inbox/reply-card.test.tsx
git commit -m "feat(inbox): ReplyCard with optimistic send + scope-denied degradation"
```

---

### Task 11: Mount `<ReplyCard />` in the Action deck

Replace the `NEEDS_REPLY` stub that Phase 3 inserted. The exact file location depends on how Phase 3 structured the action deck — check before editing.

**Files:**
- Modify: `src/app/inbox/page.tsx` or `src/components/inbox/action-deck.tsx` (whichever renders `action.type === 'NEEDS_REPLY'`)

- [ ] **Step 1: Locate the current NEEDS_REPLY rendering**

Run:

```bash
grep -rn "NEEDS_REPLY" src/app/inbox src/components/inbox
```

Expected: the Phase 3 action deck has a branch like:

```tsx
action.type === 'NEEDS_REPLY' ? (
  <div>{/* stub */}</div>
) : …
```

Note the file path and exact stub block.

- [ ] **Step 2: Swap in `<ReplyCard />`**

At the top of that file, add:

```tsx
import { ReplyCard } from '@/components/inbox/reply-card'
```

Replace the stub block with:

```tsx
action.type === 'NEEDS_REPLY' ? (
  <ReplyCard email={email} action={action} />
) : …
```

Pass the surrounding `email` object and the `action` exactly as the neighbouring branches do for `CALENDAR_EVENT` / `TODO`. If the existing deck passes via a different prop name, follow the established convention — do not invent a new one.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Manual smoke with a live `NEEDS_REPLY` email**

Run: `npm run dev`

- Log in, navigate to `/inbox`.
- Pick a `NEEDS_REPLY` email. The Action deck should show a Reply card with a pre-filled textarea (suggestedDraft from Phase 2 if populated, or a live draft kicked off by `draftReply` on mount).
- Edit the body. Click Send reply. The card should show "Sending…" then collapse to "✓ Reply sent · open in Gmail ↗".
- Click the link. It should open the sent message in Gmail and the reply should thread under the original conversation.
- Record ✅/❌ in the commit message.

- [ ] **Step 5: Commit**

```bash
git add src/app/inbox/page.tsx src/components/inbox/action-deck.tsx
git commit -m "feat(inbox): wire ReplyCard into Action deck for NEEDS_REPLY"
```

(Stage only the file(s) that actually changed — `git status` will show the truth.)

---

### Task 12: Persist sent replies back into the email record

When `sendReply` succeeds, the returned `googleMessageId` should flow into the `action.googleId` and the action's `status` should become `COMMITTED`. The state lives client-side in the store for now (Phase 3 already routes `action.status` updates through a store setter); this task wires the card's `onCommitted` prop to that setter so refresh-after-send doesn't flicker back to `PROPOSED`.

**Files:**
- Modify: `src/components/inbox/action-deck.tsx` (or wherever `<ReplyCard />` is rendered)

- [ ] **Step 1: Find the store mutation Phase 3 introduced for action status**

Run:

```bash
grep -rn "markActionCommitted\|setActionStatus\|actOnEmailAction" src/lib/store.tsx
```

Expected: a function that accepts `(emailId, actionId, status, extra?)`. If Phase 3 named it differently, substitute that name below.

- [ ] **Step 2: Wire `onCommitted` to the store**

In the file that renders `<ReplyCard />`, update the JSX:

```tsx
const { markActionCommitted } = useHub()   // or whatever Phase 3 exported
…
<ReplyCard
  email={email}
  action={action}
  onCommitted={(googleMessageId) => markActionCommitted(email.id, action.id, googleMessageId)}
/>
```

If the Phase 3 setter expects a different signature (e.g. `(emailId, actionId, { status, googleId })`), use that shape exactly.

- [ ] **Step 3: Invalidate the digest query after success**

Still inside the ReplyCard render site, add:

```tsx
const utils = trpc.useUtils()
…
<ReplyCard
  email={email}
  action={action}
  onCommitted={(googleMessageId) => {
    markActionCommitted(email.id, action.id, googleMessageId)
    utils.inbox.digest.invalidate()
  }}
/>
```

This triggers a fresh digest on the next tick so the right-hand deck shows the committed stub even after a full page refresh. (The server-side commit record lives in `replyCommits` for idempotency, but `digest` doesn't currently stitch it back into the emails — if Phase 3/4 adds that stitching, this invalidate becomes redundant; leave the call in anyway, it's cheap and correct.)

- [ ] **Step 4: Type-check + manual retest**

Run: `npx tsc --noEmit`
Expected: zero errors.

Repeat the Task 11 Step 4 manual smoke. After sending, refresh `/inbox`. The Reply card should render as the committed stub immediately (no brief flash of the editable card).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/action-deck.tsx
git commit -m "feat(inbox): persist sent-reply state + invalidate digest on commit"
```

(Or the exact file(s) touched.)

---

### Task 13: Full verification + prereq re-check

- [ ] **Step 1: Run the whole suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: all green. Fix any stragglers (usually unused imports from refactors).

- [ ] **Step 2: End-to-end manual smoke**

In a dev environment with a real Gmail account linked:

1. Open `/inbox`. Pick a `NEEDS_REPLY` email you received from a known sender.
2. Reply card shows a pre-filled suggestedDraft. Edit it.
3. Click Send reply. Card shows "Sending…" then "✓ Reply sent · open in Gmail ↗".
4. Click the Gmail link. Confirm the reply threads under the original conversation in Gmail.
5. Refresh `/inbox`. Card renders as the committed stub immediately.
6. Click Send reply again on the (still-present) stub if the Retry button shows up — it should not: committed cards have no Retry. If you re-trigger the send via devtools, the server returns the existing googleMessageId without producing a duplicate in the Gmail Sent folder. Confirm in Gmail.
7. Link a second Gmail account with `gmail.send` deliberately de-selected on the consent screen (or revoke the scope manually in Google Account settings). The Reply button should disable and the tooltip should say "Re-link account to enable replies". The Re-link link should lead to `/settings#accounts`.
8. Kill network mid-send. Card shows the error message and a Retry button.

Record each ✅/❌ in the final commit.

- [ ] **Step 3: Commit the verification note**

```bash
git commit --allow-empty -m "chore(inbox): Phase 6 verified end-to-end

Suite: 0 tsc errors, all jest tests passing, zero lint errors.
Manual smoke:
- NEEDS_REPLY suggestedDraft renders: [result]
- Edit + send threads correctly in Gmail: [result]
- Committed stub persists after refresh: [result]
- Idempotent retry returns existing googleMessageId: [result]
- Scope-denied account disables Send + shows re-link CTA: [result]
- Network error shows Retry button: [result]"
```

- [ ] **Step 4: Open the PR**

```bash
gh pr create --title "Inbox Phase 6: AI-drafted reply via gmail.send" --body "$(cat <<'EOF'
## Summary
- Adds `inboxRouter.sendReply` and `inboxRouter.draftReply` tRPC mutations
- Adds `mimetext`-based RFC 2822 composer with `In-Reply-To` / `References` headers so replies thread in Gmail
- Adds editable `<ReplyCard />` mounted into the Phase 3 Action deck for `NEEDS_REPLY` emails
- Handles the scope-denied path gracefully — Send disables and offers a Re-link CTA when the account lacks `gmail.send`
- Idempotency: retries of `${emailId}:${actionId}` return the existing `googleMessageId` instead of double-sending

## Test plan
- [ ] Server unit tests pass (`compose-reply`, `gmail-sender`, `gmail-thread-headers`, `reply-commits`, `reply-storage`, `draft-reply`, `inbox-reply` router)
- [ ] Component tests pass (`<ReplyCard />` render + send + draft + scope-denied)
- [ ] Manual: send a real reply, confirm it threads in Gmail
- [ ] Manual: retry the same send; confirm no duplicate in Sent
- [ ] Manual: unlink + re-link an account without `gmail.send`; confirm UI degrades
EOF
)"
```

---

## Post-Phase Verification

Before handing off to the next phase:

1. `npx tsc --noEmit` — clean.
2. `npx jest` — full suite green, including the new 10+ tests added in Tasks 3–10.
3. `npm run lint` — clean.
4. Manual smoke from Task 13 Step 2 — all ✅.
5. Firestore contains:
   - `users/{uid}/replyCommits/{emailId}:{actionId}` with `googleMessageId`, `threadId`, `sentAt` for each successful send
   - `users/{uid}/replyDrafts/{emailId}:{actionId}` with the last-generated `body` for each draft

## What's Next

- **Phase 7 (home widget redesign):** the Bouncer widget will pick up the committed-reply stubs from the same `digest` data; no new procedures needed.
- **Follow-up — Reply stitching in `digest`:** `inboxRouter.digest` currently doesn't merge `replyCommits` back into the emails payload. A one-task plan can add that so the committed stub survives a page refresh without relying on the client-side invalidate. Low priority — the invalidate works.
- **Follow-up — Attachments on reply:** requires extending `composeReply` to accept a `parts` array and using `MIMEText`'s attachment API. Defer until Mary asks for it.
- **Follow-up — Signature management:** deferred.
