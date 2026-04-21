# Architecture Migration: tRPC + TanStack Query

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every Phase 1 server route from hand-rolled Route Handlers to tRPC v11 procedures, and migrate the client store from `useEffect` + `fetch` to TanStack Query (via tRPC's React bindings). End state: one router tree, end-to-end TypeScript from server to client, compile-time failures on schema drift, and optimistic-update-ready cache semantics in time for Phase 4 (Google writes).

**Architecture:** One root tRPC router mounted at `/api/trpc/[trpc]/route.ts` as a catch-all. A single `createContext` function verifies the Firebase ID token (Bearer header) and attaches `{ uid }` to every request. A `protectedProcedure` middleware gates all user-scoped procedures. Existing server-side libraries (`src/lib/server/*`) stay untouched — we only rewrite the route layer. Client components call `trpc.<router>.<procedure>.useQuery()` / `.useMutation()`; the store becomes a thin wrapper that composes these hooks. Two existing routes remain non-tRPC by design: `/api/auth/google/callback` (Google redirects to it with `?code=` — must stay a raw GET handler), and `/api/chat` (streaming via AI-SDK `streamText` — revisit with tRPC subscriptions later).

**Tech Stack:** Next.js 16 (App Router), tRPC v11, `@tanstack/react-query` v5, `@trpc/client`, `@trpc/server`, `@trpc/react-query`, Zod v4 (already in use), Jest + ts-jest.

**Base branch:** Branch `architecture/trpc-migration` off the current `main` tip (`2a0e445 Merge feature/inbox-phase-1`). Phase 1 is already merged, tree is clean, 42 tests passing.

---

## Before You Start — Read These

Next.js 16 has breaking changes, and tRPC's App Router setup differs from the Pages Router patterns in most blog posts. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — catch-all Route Handlers
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- `https://trpc.io/docs/client/react/server-components` — the App Router integration patterns (fetch this via Context7 or WebFetch when ready)
- `https://tanstack.com/query/v5/docs` — react-query v5 hook signatures (renamed from v4)

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that.

If tRPC's docs conflict with this plan, follow the docs and update the plan. In particular: tRPC v11's `httpBatchLink` requires `fetch` to be available on the edge; for the Node runtime these are automatic, but we are **not** using edge runtime here so no special config should be needed.

---

## File Structure

### New files
- `src/server/trpc/index.ts` — initializes the tRPC builder, exports `router`, `publicProcedure`, `protectedProcedure`
- `src/server/trpc/context.ts` — `createContext({ req })` → `{ uid?: string }` via Firebase ID token verification
- `src/server/trpc/root.ts` — mounts all sub-routers under one app router
- `src/server/trpc/routers/accounts.ts` — `list`, `remove`
- `src/server/trpc/routers/auth.ts` — `google.start` (callback stays as raw Route Handler)
- `src/server/trpc/routers/calendar.ts` — `list`
- `src/server/trpc/routers/calendars.ts` — `list`, `updateMapping`
- `src/server/trpc/routers/gmail.ts` — `list` (internal; still consumed by inbox router)
- `src/server/trpc/routers/tasks.ts` — `list`
- `src/server/trpc/routers/inbox.ts` — `digest` (thin wrapper today; expanded in Phase 2)
- `src/app/api/trpc/[trpc]/route.ts` — catch-all Route Handler that hands requests to tRPC's `fetchRequestHandler`
- `src/lib/trpc/client.ts` — typed tRPC client for React (`createTRPCReact<AppRouter>`)
- `src/lib/trpc/provider.tsx` — `<TRPCProvider>` wrapping the app with `QueryClientProvider` + `trpc.Provider`
- `tests/server/trpc/context.test.ts` — authenticated vs unauthenticated contexts
- `tests/server/trpc/routers/accounts.test.ts`
- `tests/server/trpc/routers/calendars.test.ts`
- `tests/server/trpc/routers/inbox.test.ts`
- `tests/server/trpc/routers/calendar.test.ts`
- `tests/server/trpc/routers/gmail.test.ts`
- `tests/server/trpc/routers/tasks.test.ts`
- `tests/server/trpc/routers/auth.test.ts`

### Modified files
- `src/app/layout.tsx` (or wherever `AuthProvider` is mounted) — wrap children in `<TRPCProvider>` inside `<AuthProvider>`
- `src/lib/store.tsx` — replace the `useEffect` hydration logic with `trpc.*.useQuery()` hooks; expose mutations via `useMutation()` wrappers
- `src/components/settings/accounts-section.tsx` — consume `trpc.accounts.list.useQuery()` + `trpc.accounts.remove.useMutation()`
- `src/components/settings/calendars-section.tsx` — consume `trpc.calendars.list.useQuery()` + `trpc.calendars.updateMapping.useMutation()`
- `package.json` — new deps

### Deleted files (at the end, only after tRPC versions are proven)
- `src/app/api/accounts/route.ts`
- `src/app/api/auth/google/start/route.ts` (callback route stays)
- `src/app/api/calendar/list/route.ts`
- `src/app/api/calendar/digest/route.ts` — orphaned; AI prep-notes feature intentionally dropped (re-plan if desired later)
- `src/app/api/calendars/route.ts`
- `src/app/api/gmail/list/route.ts`
- `src/app/api/inbox/digest/route.ts`
- `src/app/api/tasks/list/route.ts`
- `tests/api/*.test.ts` for each migrated route (each router now has `tests/server/trpc/routers/<name>.test.ts` instead)

### Explicitly NOT touched
- `src/app/api/auth/google/callback/route.ts` — Google posts back here with `?code=`; tRPC isn't the right tool. Stays as a GET Route Handler.
- `src/app/api/chat/route.ts` — streaming with `streamText`. tRPC subscriptions *could* wrap it but the AI-SDK streaming pattern plays better as a plain Route Handler for now. Revisit in a dedicated "chat migration" plan.
- `src/lib/server/*` — all existing server libraries (accounts, crypto, firebase-admin, calendar-fetcher, gmail-fetcher, tasks-fetcher, google-oauth, calendar-mappings, session) stay intact. `session.ts` in particular is reused by `context.ts`.
- `src/app/api/auth/google/callback/route.ts` and its test. No change.

---

## Prerequisites (one-time)

- [ ] **P1. Confirm the base.** Run `git log --oneline -3`. Top commit must be `2a0e445 Merge feature/inbox-phase-1`. If not, rebase.
- [ ] **P2. Confirm the suite is green.** Run `npx tsc --noEmit && npx jest`. Both must pass before starting.
- [ ] **P3. Create the working branch.** Run `git checkout -b architecture/trpc-migration`.

---

## Tasks

### Task 0: Install deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add production deps**

Run:

```bash
npm install @trpc/server@^11 @trpc/client@^11 @trpc/react-query@^11 @tanstack/react-query@^5 superjson@^2
```

Expected: `package.json` gains four tRPC deps, `@tanstack/react-query`, and `superjson` (for Date/BigInt serialization across the wire — this is the tRPC-recommended transformer).

- [ ] **Step 2: Sanity check**

Run: `npx tsc --noEmit`
Expected: zero errors (no new code yet, just new deps).

Run: `npx jest`
Expected: 42 tests still pass.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add tRPC v11 + react-query v5 + superjson"
```

---

### Task 1: tRPC builder + context + middleware

**Files:**
- Create: `src/server/trpc/index.ts`
- Create: `src/server/trpc/context.ts`
- Create: `tests/server/trpc/context.test.ts`

- [ ] **Step 1: Write the failing context test**

Create `tests/server/trpc/context.test.ts`:

```ts
import { createContext } from '@/server/trpc/context'
import { getAdminAuth } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('createContext', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns { uid: undefined } when no Authorization header', async () => {
    const req = new Request('http://x/api/trpc/accounts.list')
    const ctx = await createContext({ req })
    expect(ctx.uid).toBeUndefined()
  })

  it('returns { uid } when Firebase verifies the token', async () => {
    ;(getAdminAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockResolvedValue({ uid: 'mary-uid' }),
    })
    const req = new Request('http://x/api/trpc/accounts.list', {
      headers: { Authorization: 'Bearer validtoken' },
    })
    const ctx = await createContext({ req })
    expect(ctx.uid).toBe('mary-uid')
  })

  it('returns { uid: undefined } when token verification fails', async () => {
    ;(getAdminAuth as jest.Mock).mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('expired')),
    })
    const req = new Request('http://x/api/trpc/accounts.list', {
      headers: { Authorization: 'Bearer expired' },
    })
    const ctx = await createContext({ req })
    expect(ctx.uid).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/context.test.ts`
Expected: FAIL — `Cannot find module '@/server/trpc/context'`.

- [ ] **Step 3: Implement the context**

Create `src/server/trpc/context.ts`:

```ts
import { getAdminAuth } from '@/lib/server/firebase-admin'

export interface TrpcContext {
  uid?: string
}

export async function createContext({ req }: { req: Request }): Promise<TrpcContext> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return {}
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid }
  } catch {
    return {}
  }
}
```

- [ ] **Step 4: Confirm the test passes**

Run: `npx jest tests/server/trpc/context.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the tRPC builder**

Create `src/server/trpc/index.ts`:

```ts
import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import type { TrpcContext } from './context'

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape
  },
})

export const router = t.router
export const publicProcedure = t.procedure

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.uid) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing or invalid Firebase ID token' })
  }
  return next({ ctx: { uid: ctx.uid } })
})
```

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/index.ts src/server/trpc/context.ts tests/server/trpc/context.test.ts
git commit -m "feat(trpc): tRPC builder + auth context + protectedProcedure middleware"
```

---

### Task 2: Root router + catch-all Route Handler + client provider

No procedures yet — this task stands up the plumbing and proves the wire is live.

**Files:**
- Create: `src/server/trpc/root.ts`
- Create: `src/app/api/trpc/[trpc]/route.ts`
- Create: `src/lib/trpc/client.ts`
- Create: `src/lib/trpc/provider.tsx`
- Modify: `src/app/layout.tsx` (or wherever the app's top-level providers live — verify first)

- [ ] **Step 1: Locate the top-level providers**

Run: `grep -rn "AuthProvider" src/app src/lib | head -20`
Expected: a file (usually `src/app/layout.tsx`) that wraps the app in `<AuthProvider>`. Note the path for Step 5.

- [ ] **Step 2: Create the root router (empty for now)**

Create `src/server/trpc/root.ts`:

```ts
import { router } from './index'

export const appRouter = router({})

export type AppRouter = typeof appRouter
```

- [ ] **Step 3: Create the catch-all Route Handler**

Create `src/app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/trpc/root'
import { createContext } from '@/server/trpc/context'

export const maxDuration = 60

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
  })

export { handler as GET, handler as POST }
```

- [ ] **Step 4: Create the typed React client**

Create `src/lib/trpc/client.ts`:

```ts
"use client"

import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '@/server/trpc/root'

export const trpc = createTRPCReact<AppRouter>()
```

- [ ] **Step 5: Create the provider**

Create `src/lib/trpc/provider.tsx`:

```tsx
"use client"

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import superjson from 'superjson'
import { trpc } from './client'
import { useAuth } from '@/lib/auth-provider'

export function TRPCProvider({ children }: { children: ReactNode }) {
  const { getIdToken } = useAuth()

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
  }))

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          async headers() {
            const token = await getIdToken()
            return token ? { Authorization: `Bearer ${token}` } : {}
          },
        }),
      ],
    })
  )

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  )
}
```

- [ ] **Step 6: Wire the provider into the layout**

Edit the file identified in Step 1 (likely `src/app/layout.tsx`). The provider must be a child of `AuthProvider` (so it can call `getIdToken`). Example:

```tsx
import { AuthProvider } from "@/lib/auth-provider"
import { TRPCProvider } from "@/lib/trpc/provider"
// ...
<AuthProvider>
  <TRPCProvider>
    {children}
  </TRPCProvider>
</AuthProvider>
```

- [ ] **Step 7: Confirm type-check and dev server**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run dev` and visit `http://localhost:3000/api/trpc/nonexistent`
Expected: tRPC error JSON (`{"error":{"message":"No procedure found...","code":-32004,"data":{"code":"NOT_FOUND",...}}}`). This proves the wire is live.

Kill the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/server/trpc/root.ts src/app/api/trpc/[trpc]/route.ts src/lib/trpc src/app/layout.tsx
git commit -m "feat(trpc): catch-all Route Handler + TRPCProvider wired to AuthProvider"
```

---

### Task 3: Accounts router

Simple pair — list + remove — perfect template for the rest.

**Files:**
- Create: `src/server/trpc/routers/accounts.ts`
- Create: `tests/server/trpc/routers/accounts.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Write the router test**

Create `tests/server/trpc/routers/accounts.test.ts`:

```ts
import { accountsRouter } from '@/server/trpc/routers/accounts'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/accounts')

describe('accounts router', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('list returns sanitized accounts (no refreshToken)', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai', refreshToken: 'SECRET', scopes: [], addedAt: 1 },
    ])
    const caller = accountsRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.list()
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).not.toHaveProperty('refreshToken')
    expect(result.accounts[0].email).toBe('mary@tribe.ai')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = accountsRouter.createCaller({})
    await expect(caller.list()).rejects.toBeInstanceOf(TRPCError)
  })

  it('remove deletes the account', async () => {
    ;(deleteAccount as jest.Mock).mockResolvedValue(undefined)
    const caller = accountsRouter.createCaller({ uid: 'mary-uid' })
    await caller.remove({ id: 'a1' })
    expect(deleteAccount).toHaveBeenCalledWith('mary-uid', 'a1')
  })

  it('remove rejects blank id', async () => {
    const caller = accountsRouter.createCaller({ uid: 'mary-uid' })
    await expect(caller.remove({ id: '' })).rejects.toBeInstanceOf(TRPCError)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/accounts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the router**

Create `src/server/trpc/routers/accounts.ts`:

```ts
import { z } from 'zod'
import { router, protectedProcedure } from '../index'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

export const accountsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    const sanitized = accounts.map(({ refreshToken: _refreshToken, ...rest }) => rest)
    return { accounts: sanitized }
  }),

  remove: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await deleteAccount(ctx.uid, input.id)
      return { ok: true }
    }),
})
```

- [ ] **Step 4: Mount on the root router**

Edit `src/server/trpc/root.ts`:

```ts
import { router } from './index'
import { accountsRouter } from './routers/accounts'

export const appRouter = router({
  accounts: accountsRouter,
})

export type AppRouter = typeof appRouter
```

- [ ] **Step 5: Confirm tests pass**

Run: `npx jest tests/server/trpc/routers/accounts.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/accounts.ts src/server/trpc/root.ts tests/server/trpc/routers/accounts.test.ts
git commit -m "feat(trpc): accounts.list + accounts.remove"
```

---

### Task 4: Auth router (`google.start` only)

The Google callback stays as a raw Route Handler — it's invoked by Google with `?code=`, not by our app.

**Files:**
- Create: `src/server/trpc/routers/auth.ts`
- Create: `tests/server/trpc/routers/auth.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Understand the existing procedure**

Read: `src/app/api/auth/google/start/route.ts`. Note the exact scopes list, the redirect URI env var name, and whether it returns a URL or a redirect response. Our tRPC version will always return `{ url }` — the client opens the URL in a popup.

- [ ] **Step 2: Write the router test**

Create `tests/server/trpc/routers/auth.test.ts`:

```ts
import { authRouter } from '@/server/trpc/routers/auth'

jest.mock('@/lib/server/google-oauth', () => ({
  buildGoogleOAuthUrl: jest.fn().mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?client_id=...'),
}))

describe('auth router', () => {
  it('google.start returns the OAuth URL', async () => {
    const caller = authRouter.createCaller({ uid: 'mary-uid' })
    const result = await caller.google.start()
    expect(result.url).toMatch(/^https:\/\/accounts\.google\.com/)
  })

  it('google.start rejects unauthenticated callers', async () => {
    const caller = authRouter.createCaller({})
    await expect(caller.google.start()).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/auth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the router**

Create `src/server/trpc/routers/auth.ts`:

```ts
import { router, protectedProcedure } from '../index'
import { buildGoogleOAuthUrl } from '@/lib/server/google-oauth'

export const authRouter = router({
  google: router({
    start: protectedProcedure.query(async ({ ctx }) => {
      const url = buildGoogleOAuthUrl({ state: ctx.uid })
      return { url }
    }),
  }),
})
```

Note: if `buildGoogleOAuthUrl` is not the exact export name, adapt it — but check first before inventing.

- [ ] **Step 5: Verify the export exists**

Run: `grep -n "export " src/lib/server/google-oauth.ts`
Expected: you see `buildGoogleOAuthUrl` (or similar) and `refreshAccessToken`. If the real name differs, update both the import and the mock in the test.

- [ ] **Step 6: Mount on root**

```ts
// src/server/trpc/root.ts
import { authRouter } from './routers/auth'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
})
```

- [ ] **Step 7: Confirm tests pass**

Run: `npx jest tests/server/trpc/routers/auth.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
git add src/server/trpc/routers/auth.ts src/server/trpc/root.ts tests/server/trpc/routers/auth.test.ts
git commit -m "feat(trpc): auth.google.start"
```

---

### Task 5: Calendar router (`list`)

**Files:**
- Create: `src/server/trpc/routers/calendar.ts`
- Create: `tests/server/trpc/routers/calendar.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Read the current route to understand its shape**

Read: `src/app/api/calendar/list/route.ts` (it exists; Phase 1 shipped it). Note the exact return shape so the tRPC version matches byte-for-byte — the store already depends on it.

- [ ] **Step 2: Write the router test**

Create `tests/server/trpc/routers/calendar.test.ts`. Mirror the existing `tests/api/calendar-list.test.ts` but adapted to `createCaller`:

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

describe('calendar router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([
      { id: 'e1', title: 'Zoo', start: '2026-04-23T08:00:00', location: 'SF Zoo' },
    ])
  })

  it('list returns events tagged with profileId=null when no mapping exists', async () => {
    const caller = calendarRouter.createCaller({ uid: 'mary-uid' })
    const { events } = await caller.list()
    expect(events).toHaveLength(1)
    expect(events[0].profileId).toBeNull()
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = calendarRouter.createCaller({})
    await expect(caller.list()).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendar.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement the router**

Create `src/server/trpc/routers/calendar.ts` with the body of `src/app/api/calendar/list/route.ts` ported into a `protectedProcedure.query`. Use the existing `calendar-fetcher.ts` and `calendar-mappings.ts` libraries as-is.

Keep the return type **identical** to the current `POST /api/calendar/list` JSON shape so the store rewrite is a mechanical change in Task 10.

- [ ] **Step 5: Mount on root**

```ts
// src/server/trpc/root.ts
import { calendarRouter } from './routers/calendar'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
})
```

- [ ] **Step 6: Confirm tests pass**

Run: `npx jest tests/server/trpc/routers/calendar.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/calendar.ts src/server/trpc/root.ts tests/server/trpc/routers/calendar.test.ts
git commit -m "feat(trpc): calendar.list"
```

---

### Task 6: Calendars router (`list`, `updateMapping`)

Sibling to `calendar` but handles calendar metadata (list + profile mapping), not events.

**Files:**
- Create: `src/server/trpc/routers/calendars.ts`
- Create: `tests/server/trpc/routers/calendars.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Write the router test**

Create `tests/server/trpc/routers/calendars.test.ts`:

```ts
import { calendarsRouter } from '@/server/trpc/routers/calendars'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-mappings')

describe('calendars router', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listCalendarMappings as jest.Mock).mockResolvedValue([])
    ;(setCalendarMapping as jest.Mock).mockResolvedValue(undefined)
  })

  it('list returns Google calendar metadata per account', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ items: [{ id: 'cal1', summary: 'Mary', selected: true, accessRole: 'owner' }] }),
    }) as unknown as typeof fetch
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    const { calendars } = await caller.list()
    expect(calendars).toHaveLength(1)
    expect(calendars[0].calendarName).toBe('Mary')
    expect(calendars[0].profileId).toBeNull()
  })

  it('updateMapping persists a calendar→profile mapping', async () => {
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    await caller.updateMapping({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'mary',
    })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', {
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: 'mary',
    })
  })

  it('updateMapping accepts profileId: null to clear the mapping', async () => {
    const caller = calendarsRouter.createCaller({ uid: 'mary-uid' })
    await caller.updateMapping({
      calendarId: 'cal1',
      accountId: 'a1',
      calendarName: 'Mary',
      profileId: null,
    })
    expect(setCalendarMapping).toHaveBeenCalledWith('mary-uid', expect.objectContaining({ profileId: null }))
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/calendars.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the router**

Create `src/server/trpc/routers/calendars.ts`:

```ts
import { z } from 'zod'
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { listCalendarMappings, setCalendarMapping } from '@/lib/server/calendar-mappings'

interface GoogleCalendarListEntry {
  id: string
  summary?: string
  selected?: boolean
  accessRole?: string
}

interface GoogleCalendarListResponse {
  error?: { message?: string }
  items?: GoogleCalendarListEntry[]
}

export interface CalendarListItem {
  accountId: string
  accountEmail: string
  calendarId: string
  calendarName: string
  selected: boolean
  profileId: string | null
}

const MappingInput = z.object({
  calendarId: z.string().min(1),
  accountId: z.string().min(1),
  calendarName: z.string(),
  profileId: z.string().nullable(),
})

export const calendarsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    const mappings = await listCalendarMappings(ctx.uid)
    const mappingMap = new Map<string, string | null>(
      mappings.map(m => [m.calendarId, m.profileId]),
    )

    const perAccount = await Promise.all(
      accounts.map(async (acc) => {
        try {
          const rt = await getDecryptedRefreshToken(ctx.uid, acc.id)
          if (!rt) throw new Error('Refresh token missing')
          const { accessToken } = await refreshAccessToken(rt)
          const res = await fetch(
            'https://www.googleapis.com/calendar/v3/users/me/calendarList',
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          const data = (await res.json()) as GoogleCalendarListResponse
          if (data.error) return []
          const items: GoogleCalendarListEntry[] = (data.items || []).filter(
            (c) => c.selected !== false && c.accessRole !== 'freeBusyReader',
          )
          return items.map((c): CalendarListItem => ({
            accountId: acc.id,
            accountEmail: acc.email,
            calendarId: c.id,
            calendarName: c.summary ?? c.id,
            selected: c.selected !== false,
            profileId: mappingMap.has(c.id) ? (mappingMap.get(c.id) ?? null) : null,
          }))
        } catch (err: unknown) {
          const e = err as { message?: string }
          console.warn(`[calendars] skipping account ${acc.id}: ${e.message ?? 'unknown error'}`)
          return []
        }
      }),
    )

    return { calendars: perAccount.flat() }
  }),

  updateMapping: protectedProcedure
    .input(MappingInput)
    .mutation(async ({ ctx, input }) => {
      await setCalendarMapping(ctx.uid, input)
      return { ok: true }
    }),
})
```

- [ ] **Step 4: Mount + test**

Add `calendars: calendarsRouter` to `src/server/trpc/root.ts`.

Run: `npx jest tests/server/trpc/routers/calendars.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/routers/calendars.ts src/server/trpc/root.ts tests/server/trpc/routers/calendars.test.ts
git commit -m "feat(trpc): calendars.list + calendars.updateMapping"
```

---

### Task 7: Gmail + Tasks routers

Both are simple list procedures. One task, two routers to keep commit cadence reasonable.

**Files:**
- Create: `src/server/trpc/routers/gmail.ts`
- Create: `src/server/trpc/routers/tasks.ts`
- Create: `tests/server/trpc/routers/gmail.test.ts`
- Create: `tests/server/trpc/routers/tasks.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Gmail test first**

Create `tests/server/trpc/routers/gmail.test.ts`:

```ts
import { gmailRouter } from '@/server/trpc/routers/gmail'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')

describe('gmail router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Hi', sender: 'a@b.c', snippet: 'hi', fullBody: 'hi', date: 1 },
    ])
  })

  it('list returns unread emails tagged with accountId', async () => {
    const caller = gmailRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.list()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = gmailRouter.createCaller({})
    await expect(caller.list()).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Gmail router**

Create `src/server/trpc/routers/gmail.ts`:

```ts
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

export const gmailRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
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
    return { emails: perAccount.flat() }
  }),
})
```

- [ ] **Step 3: Tasks test**

Create `tests/server/trpc/routers/tasks.test.ts`:

```ts
import { tasksRouter } from '@/server/trpc/routers/tasks'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/tasks-fetcher')

describe('tasks router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchTasks as jest.Mock).mockResolvedValue([{ id: 't1', title: 'Do', completed: false }])
  })

  it('list returns Google Tasks entries', async () => {
    const caller = tasksRouter.createCaller({ uid: 'mary-uid' })
    const { tasks } = await caller.list()
    expect(tasks).toHaveLength(1)
    expect(tasks[0].title).toBe('Do')
  })

  it('list rejects unauthenticated callers', async () => {
    const caller = tasksRouter.createCaller({})
    await expect(caller.list()).rejects.toThrow()
  })
})
```

Note: if `fetchTasks` is not the exact export name from `src/lib/server/tasks-fetcher.ts`, correct it — `grep -n "export" src/lib/server/tasks-fetcher.ts`.

- [ ] **Step 4: Tasks router**

Create `src/server/trpc/routers/tasks.ts`:

```ts
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

export const tasksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
    // Most users have one Google Tasks list; fetch from the first account only.
    const primary = accounts[0]
    if (!primary) return { tasks: [] }
    const rt = await getDecryptedRefreshToken(ctx.uid, primary.id)
    if (!rt) return { tasks: [] }
    const { accessToken } = await refreshAccessToken(rt)
    const tasks = await fetchTasks(accessToken)
    return { tasks }
  }),
})
```

Note: confirm against the existing `src/app/api/tasks/list/route.ts` implementation — the above reflects the simpler single-account model. If Phase 1 fetches from all accounts, match that.

- [ ] **Step 5: Mount both + run tests**

```ts
// src/server/trpc/root.ts
import { gmailRouter } from './routers/gmail'
import { tasksRouter } from './routers/tasks'

export const appRouter = router({
  accounts: accountsRouter,
  auth: authRouter,
  calendar: calendarRouter,
  calendars: calendarsRouter,
  gmail: gmailRouter,
  tasks: tasksRouter,
})
```

Run: `npx jest tests/server/trpc/routers/gmail.test.ts tests/server/trpc/routers/tasks.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 6: Commit**

```bash
git add src/server/trpc/routers/gmail.ts src/server/trpc/routers/tasks.ts src/server/trpc/root.ts tests/server/trpc/routers/gmail.test.ts tests/server/trpc/routers/tasks.test.ts
git commit -m "feat(trpc): gmail.list + tasks.list"
```

---

### Task 8: Inbox router (`digest`)

Thin wrapper today — Phase 2 will expand it with 6 classifications and sender identity, which is cheap on top of the tRPC skeleton.

**Files:**
- Create: `src/server/trpc/routers/inbox.ts`
- Create: `tests/server/trpc/routers/inbox.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Port the Phase 1 `/api/inbox/digest` route verbatim into a procedure**

Create `src/server/trpc/routers/inbox.ts`:

```ts
import { z } from 'zod'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { router, protectedProcedure } from '../index'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

const EmailSchema = z.object({
  emails: z.array(z.object({
    id: z.string(),
    subject: z.string(),
    sender: z.string(),
    snippet: z.string(),
    suggestedActions: z.array(z.object({
      id: z.string(),
      type: z.enum(['CALENDAR_INVITE', 'TODO_ITEM']),
      title: z.string(),
      date: z.number().nullable(),
      time: z.string().nullable(),
      context: z.enum(['WORK', 'PERSONAL', 'FAMILY', 'KID 1', 'KID 2']).nullable(),
    })),
  })),
})

export const inboxRouter = router({
  digest: protectedProcedure.query(async ({ ctx }) => {
    const accounts = await listAccounts(ctx.uid)
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

    const prompt = `You are a Chief of Staff AI. Extract and clean the following emails into high-signal summaries. Strip all noise. Identify embedded instructions requiring physical execution and structure them into the suggestedActions array.\n\nEmails:\n${JSON.stringify(rawEmails, null, 2)}`
    const { object } = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: EmailSchema,
      prompt,
    })

    const digested = object.emails.map(ai => {
      const raw = rawEmails.find(r => r.id === ai.id) || rawEmails[0]
      return {
        ...ai,
        suggestedActions: ai.suggestedActions.map(a => ({ ...a, status: 'PENDING' as const })),
        fullBody: raw.fullBody,
        date: raw.date,
        accountId: raw.accountId,
        accountEmail: raw.accountEmail,
      }
    })

    return { emails: digested }
  }),
})
```

Note: **This is intentionally Phase 1's schema**, not Phase 2's. Phase 2 rewrites this router with the 6-classification schema. The migration is about architecture, not behavior change.

- [ ] **Step 2: Write the router test**

Create `tests/server/trpc/routers/inbox.test.ts` — port `tests/api/inbox-digest.test.ts` to use `createCaller` instead of hitting the Route Handler. The mocks and assertions stay identical.

```ts
import { inboxRouter } from '@/server/trpc/routers/inbox'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'
import * as aiModule from 'ai'

jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('ai', () => ({
  generateObject: jest.fn().mockResolvedValue({
    object: { emails: [{ id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo Thu', suggestedActions: [] }] },
  }),
}))
jest.mock('@ai-sdk/openai', () => ({ openai: jest.fn() }))

describe('inbox router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Zoo', sender: 'School', fullBody: 'Zoo Thu', date: 1 },
    ])
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: { emails: [{ id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo Thu', suggestedActions: [] }] },
    })
  })

  it('digest returns AI-digested emails tagged with accountId', async () => {
    const caller = inboxRouter.createCaller({ uid: 'mary-uid' })
    const { emails } = await caller.digest()
    expect(emails).toHaveLength(1)
    expect(emails[0].accountId).toBe('a1')
  })
})
```

- [ ] **Step 3: Mount + run**

Add `inbox: inboxRouter` to `src/server/trpc/root.ts`.

Run: `npx jest tests/server/trpc/routers/inbox.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc/routers/inbox.ts src/server/trpc/root.ts tests/server/trpc/routers/inbox.test.ts
git commit -m "feat(trpc): inbox.digest (Phase 1 parity — Phase 2 rewrites the schema)"
```

---

### Task 9: Migrate `store.tsx` to tRPC hooks

The store is currently a blob of `useEffect` + `fetch` calls. Replace each with a `trpc.*.useQuery()` hook. The exported shape (`events`, `tasks`, `emails`, `profiles`, `addEvent`, etc.) stays identical so downstream components are untouched.

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Replace the calendar hydration**

Find the `hydrateCalendar` block. Replace with a `trpc.calendar.list.useQuery()` call whose `data` flows into a memoized `events` array via the same transform function (the one that converts ISO strings to `{ id, title, time, date, location, profileId }`).

Sketch:

```tsx
const { data: calendarData, error: calendarError } = trpc.calendar.list.useQuery(undefined, {
  enabled: !!user,
})

useEffect(() => {
  if (calendarError) toast("SYNC ERROR", { description: "Calendar: " + calendarError.message })
}, [calendarError])

const events: CalendarEvent[] = useMemo(() => {
  if (!calendarData?.events) return []
  return calendarData.events.map((e) => {
    // ... existing transform
  })
}, [calendarData])
```

- [ ] **Step 2: Repeat for tasks, emails, profiles (when Phase 2 lands), accounts**

Each hydrate block becomes:
- Tasks → `trpc.tasks.list.useQuery(undefined, { enabled: !!user })`
- Emails → `trpc.inbox.digest.useQuery(undefined, { enabled: !!user })`
- Accounts (in settings) → `trpc.accounts.list.useQuery(undefined, { enabled: !!user })`

Keep the `transform inside useMemo` pattern consistent.

- [ ] **Step 3: Remove the `hydrate()` helper, the `fetch(...)` calls, the `getIdToken()` calls inside the store**

These are now handled by the tRPC provider's `httpBatchLink.headers` function. The store no longer needs direct token access.

- [ ] **Step 4: Confirm type-check**

Run: `npx tsc --noEmit`
Expected: zero errors. If `/inbox/page.tsx` or `/settings/page.tsx` complain about the store shape changing, you changed the wrong thing — the exports must match the pre-migration shape.

- [ ] **Step 5: Manual smoke**

Run: `npm run dev` and log in. Confirm home widget, inbox page, and settings still hydrate. Check the network tab: all data comes from `/api/trpc/...` batch calls, not individual `/api/*/route.ts` calls.

- [ ] **Step 6: Commit**

```bash
git add src/lib/store.tsx
git commit -m "refactor(store): consume tRPC hooks via react-query; drop manual fetch"
```

---

### Task 10: Migrate settings components

Two components directly fetch from the legacy routes. Both move to `useQuery` / `useMutation`.

**Files:**
- Modify: `src/components/settings/accounts-section.tsx`
- Modify: `src/components/settings/calendars-section.tsx`

- [ ] **Step 1: Accounts section**

Find every `fetch('/api/accounts', ...)` in `src/components/settings/accounts-section.tsx`. Replace:
- The list fetch → `trpc.accounts.list.useQuery()`
- The delete call → `trpc.accounts.remove.useMutation({ onSuccess: () => utils.accounts.list.invalidate() })` where `utils = trpc.useUtils()`
- The "Add account" button → `trpc.auth.google.start.useQuery(undefined, { enabled: false })` + a `refetch()`-triggered popup open. Or a `useMutation` wrapper if it feels more natural.

- [ ] **Step 2: Calendars section**

Same pattern:
- List → `trpc.calendars.list.useQuery()`
- Mapping update → `trpc.calendars.updateMapping.useMutation({ onSuccess: () => utils.calendars.list.invalidate() })`

- [ ] **Step 3: Confirm type-check + smoke**

Run: `npx tsc --noEmit`
Expected: zero errors.

Manually verify both settings sections work end-to-end in the dev server. Record the result in the commit message.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/accounts-section.tsx src/components/settings/calendars-section.tsx
git commit -m "refactor(settings): consume tRPC hooks with invalidation on mutation"
```

---

### Task 11: Delete legacy routes + their tests

Every legacy Route Handler now has a tRPC equivalent covered by its own test. Delete them together.

**Files (deleted):**
- `src/app/api/accounts/route.ts`
- `src/app/api/auth/google/start/route.ts`
- `src/app/api/calendar/list/route.ts`
- `src/app/api/calendar/digest/route.ts` — orphaned, not migrated (AI prep-notes feature deferred)
- `src/app/api/calendars/route.ts`
- `src/app/api/gmail/list/route.ts`
- `src/app/api/inbox/digest/route.ts`
- `src/app/api/tasks/list/route.ts`
- `tests/api/accounts.test.ts`
- `tests/api/auth-google-start.test.ts`
- `tests/api/calendar-list.test.ts`
- `tests/api/calendars.test.ts`
- `tests/api/gmail-list.test.ts`
- `tests/api/inbox-digest.test.ts`
- `tests/api/tasks-list.test.ts`

**Files preserved:**
- `src/app/api/auth/google/callback/route.ts` — stays
- `tests/api/auth-google-callback.test.ts` — stays
- `src/app/api/chat/route.ts` — stays (revisit separately)

- [ ] **Step 1: Delete the route files**

```bash
git rm src/app/api/accounts/route.ts
git rm src/app/api/auth/google/start/route.ts
git rm src/app/api/calendar/list/route.ts
git rm src/app/api/calendar/digest/route.ts
git rm src/app/api/calendars/route.ts
git rm src/app/api/gmail/list/route.ts
git rm src/app/api/inbox/digest/route.ts
git rm src/app/api/tasks/list/route.ts
```

- [ ] **Step 2: Delete the now-superseded tests**

```bash
git rm tests/api/accounts.test.ts
git rm tests/api/auth-google-start.test.ts
git rm tests/api/calendar-list.test.ts
git rm tests/api/calendars.test.ts
git rm tests/api/gmail-list.test.ts
git rm tests/api/inbox-digest.test.ts
git rm tests/api/tasks-list.test.ts
```

- [ ] **Step 3: Confirm everything still passes**

Run: `npx tsc --noEmit && npx jest`
Expected: zero type errors, all tests pass (42 + new tRPC router tests, minus the 7 deleted route tests — net change depends on how many new router tests you wrote).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: delete legacy Route Handlers superseded by tRPC procedures

- /api/accounts, /api/auth/google/start, /api/calendar/list, /api/calendars,
  /api/gmail/list, /api/inbox/digest, /api/tasks/list are now tRPC procedures
- /api/auth/google/callback kept as a Route Handler (Google OAuth redirect target)
- /api/chat kept as a Route Handler (streaming via ai-sdk; revisit separately)
- /api/calendar/digest deleted (orphaned; AI prep-notes feature deferred)"
```

---

### Task 12: Full verification + merge prep

- [ ] **Step 1: Full suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: all green. If lint surfaces unused imports from deleted files, clean them up in a follow-up commit.

- [ ] **Step 2: Manual end-to-end smoke**

Log out. Log in. Walk through the full app:
- Home widgets hydrate (calendar, tasks, inbox, groceries).
- `/inbox` renders emails with AI summaries and action chips.
- `/settings` lists linked accounts; removing one refreshes the list without reload.
- `/settings` lists calendars; changing a profile mapping persists and the home calendar updates on next refetch.
- Wait past 60 minutes idle; refresh. No 401 re-login prompt (refresh tokens still working).

Record each ✅/❌ in the final commit message.

- [ ] **Step 3: Commit the verification note**

```bash
git commit --allow-empty -m "chore: tRPC migration verified end-to-end

Suite: 0 tsc errors, all jest tests passing, zero lint errors.
Manual smoke:
- Home hydration: ✅
- /inbox: ✅
- /settings accounts: ✅
- /settings calendars: ✅
- 1-hour-idle refresh: ✅"
```

- [ ] **Step 4: Handoff**

Open a PR from `architecture/trpc-migration` into `main`. Title:

> Architecture: migrate all Phase 1 server routes to tRPC + react-query

Body summary:
- Lists all migrated procedures.
- Notes `/api/auth/google/callback` and `/api/chat` as intentionally not migrated.
- Notes `/api/calendar/digest` deleted as orphaned.
- Confirms 0 behavior change in the UI; only the wire format and cache layer changed.

---

## Post-Migration Verification

Before any Phase 2+ work starts on top of this branch:

1. `npx tsc --noEmit` — clean.
2. `npx jest` — full suite green.
3. `npm run lint` — clean.
4. Manual smoke from Task 12 Step 2 — all ✅.
5. Network-tab check: no legacy `/api/*/route.ts` calls remain (except `/api/auth/google/callback` and `/api/chat`).

## What's Next

Once this merges, every subsequent phase plan assumes tRPC + react-query as baseline:

- **Phase 2 (revised):** Inbox AI extraction rewrites `inboxRouter.digest` and adds `profilesRouter` (list, upsert, learnDomain). Store consumes the expanded schema via the same `trpc.inbox.digest.useQuery()` hook.
- **Phase 3:** UI redesign — mutation-backed `Clear` button uses `trpc.inbox.markCleared.useMutation()` with optimistic cache update.
- **Phase 4:** Google write flow — new `actionsRouter` with `commitCalendar`, `commitTask`, `markEmailRead`; optimistic mutations with rollback on error; idempotency keys.
- **Phase 5:** PDF extraction — `attachmentsRouter.extract` with lazy-on-open + Firestore cache.
- **Phase 6:** Reply via `gmail.send` — `inboxRouter.sendReply` mutation.
- **Phase 7:** Home widget redesign — subscribes to the same queries as `/inbox`.
- **Calendar redesign v2:** Schedule-X integration built on top of `trpc.calendar.list` + a new `trpc.calendar.visibility` mutation for the calendar visibility flags.
