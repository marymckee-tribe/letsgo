# Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the production hygiene that the feature plans (Phase 2–7, calendar v2) deliberately leave out — error tracking, structured logging, CI, E2E test harness, rate limiting, and security headers — so that by the time Mary ships Phase 4 (real Google writes), the app is a production-grade app on a production-grade foundation.

**Architecture:** Sentry (@sentry/nextjs) for error tracking on client + server; `pino` for structured server-side logs; GitHub Actions CI for `tsc` / `jest` / `eslint` on every PR; Playwright for E2E with a Firebase auth helper that signs in programmatically; tRPC middleware for per-uid rate limiting (in-memory token bucket, upgradeable to Redis later); Next.js config hardened with CSP + HSTS + standard security headers.

**Tech Stack:** `@sentry/nextjs` v10, `pino` v9, `pino-pretty` (dev only), `@playwright/test` v1, `@upstash/ratelimit` style API with an in-memory adapter, existing Next.js 16 + tRPC v11.

**Base branch:** Execute after the architecture migration (`architecture/trpc-migration`) merges. Branch this plan as `chore/production-readiness`.

---

## Before You Start — Read These

- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — Next 16 breaking changes, especially around `headers()` and middleware
- Sentry Next.js docs via Context7: `claude.ai_Context7` → `@sentry/nextjs`. The App Router setup differs from Pages Router in blog posts.
- Playwright docs via Context7: `@playwright/test`. Firebase login via REST API is well-documented but not in Playwright examples by default.
- Confirm the architecture migration is merged. Run `git log --oneline -5` — expect recent commits on `src/server/trpc/*`. If the tRPC files don't exist yet, stop and execute the architecture migration first.

---

## File Structure

### New files
- `sentry.client.config.ts` — client-side Sentry init
- `sentry.server.config.ts` — server-side Sentry init
- `sentry.edge.config.ts` — edge runtime init (minimal; we're not using edge for most routes, but Next.js wants this file)
- `instrumentation.ts` — Next.js 16 boot hook that wires Sentry into the server runtime
- `src/lib/server/logger.ts` — pino logger instance + child-logger helpers with request-id binding
- `src/lib/server/rate-limit.ts` — tRPC middleware + in-memory token bucket
- `src/lib/server/security-headers.ts` — strict CSP/HSTS/X-Frame-Options config
- `tests/server/rate-limit.test.ts`
- `tests/server/logger.test.ts`
- `.github/workflows/ci.yml`
- `playwright.config.ts`
- `tests/e2e/auth-fixture.ts` — Playwright fixture that signs a test user in via Firebase REST
- `tests/e2e/smoke.spec.ts` — first E2E (login → home → inbox → settings)

### Modified files
- `next.config.ts` — wrap with `withSentryConfig`, register security headers
- `src/app/api/trpc/[trpc]/route.ts` — bind request id for logger correlation
- `src/server/trpc/index.ts` — add `loggedProcedure` wrapper that injects a child logger into `ctx`
- `src/server/trpc/routers/*.ts` — replace any `console.log` with `ctx.logger.info(...)`
- `package.json` — new deps + new scripts (`test:e2e`, `ci:verify`)
- `.env.local.example` — new env vars

### Explicitly out of scope
- Log shipping (Logtail / Axiom / Datadog). pino writes to stdout; ship later when a provider is picked.
- Distributed tracing (OpenTelemetry). Sentry captures traces for errors; full distributed tracing is a separate initiative.
- Uptime monitoring. Recommend Better Uptime or UptimeRobot for the production URL — one-click setup, no code change.
- Secret scanning / dependency vulnerability alerts. GitHub Dependabot is free and one-click; enable in repo settings post-merge.
- Backup policy for Firestore. Firebase automatically backs up at the project level; formal retention policy is a separate doc, not code.

---

## Prerequisites (one-time, by a human)

- [ ] **P1. Create a Sentry project.** sentry.io → New Project → Next.js. Copy the DSN. Save to `.env.local`:

  ```
  NEXT_PUBLIC_SENTRY_DSN="https://..."
  SENTRY_DSN="https://..."
  SENTRY_AUTH_TOKEN="..."   # for source map upload; scoped to "Project: Release Admin"
  SENTRY_ORG="your-org-slug"
  SENTRY_PROJECT="the-hub"
  ```

- [ ] **P2. Create a Firebase test user for E2E.** Firebase console → Authentication → Add user (e.g. `e2e-test@the-hub.dev` with a strong password). This account will have its own uid and its own Firestore data; do NOT link real Gmail accounts to it. Save credentials:

  ```
  E2E_USER_EMAIL="e2e-test@the-hub.dev"
  E2E_USER_PASSWORD="..."
  FIREBASE_WEB_API_KEY="..."      # from Firebase console → Project Settings → Web API Key
  ```

- [ ] **P3. Confirm architecture migration is merged.** Run `git log --oneline -10` — expect commits touching `src/server/trpc/*`. If missing, stop and execute the architecture migration first.

---

## Tasks

### Task 0: Install deps

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Runtime deps**

```bash
npm install @sentry/nextjs@^10 pino@^9
```

- [ ] **Step 2: Dev deps**

```bash
npm install -D @playwright/test@^1 pino-pretty@^11
```

- [ ] **Step 3: Install Playwright browsers**

```bash
npx playwright install chromium
```

Expected: Chromium downloaded to `~/Library/Caches/ms-playwright/chromium-*`. Firefox and WebKit not needed for Phase 1 smoke tests.

- [ ] **Step 4: Sanity check**

Run: `npx tsc --noEmit && npx jest`
Expected: both clean — we only added deps.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add sentry, pino, playwright"
```

---

### Task 1: Pino logger

**Files:**
- Create: `src/lib/server/logger.ts`
- Create: `tests/server/logger.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/logger.test.ts`:

```ts
import { createLogger, withRequestId } from '@/lib/server/logger'

describe('logger', () => {
  it('createLogger returns an object with info/warn/error/debug', () => {
    const log = createLogger()
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.debug).toBe('function')
  })

  it('withRequestId produces a child logger that includes reqId in emitted records', () => {
    const log = createLogger()
    const child = withRequestId(log, 'abc-123')
    const records: unknown[] = []
    const spy = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      records.push(chunk.toString())
      return true
    })
    child.info({ uid: 'mary-uid' }, 'hello')
    spy.mockRestore()
    const last = records.at(-1) as string
    expect(last).toContain('"reqId":"abc-123"')
    expect(last).toContain('"uid":"mary-uid"')
    expect(last).toContain('"msg":"hello"')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/logger.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/logger.ts`:

```ts
import pino, { type Logger } from 'pino'

const LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export function createLogger(): Logger {
  const transport =
    process.env.NODE_ENV === 'production'
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, singleLine: false } }

  return pino({
    level: LEVEL,
    base: { service: 'the-hub' },
    timestamp: pino.stdTimeFunctions.isoTime,
    transport,
  })
}

export function withRequestId(base: Logger, reqId: string): Logger {
  return base.child({ reqId })
}

export const logger = createLogger()
```

- [ ] **Step 4: Confirm test passes**

Run: `npx jest tests/server/logger.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/logger.ts tests/server/logger.test.ts
git commit -m "feat(logger): pino logger with request-id child helper"
```

---

### Task 2: Wire logger into the tRPC context

**Files:**
- Modify: `src/server/trpc/context.ts`
- Modify: `src/server/trpc/index.ts`
- Modify: `src/app/api/trpc/[trpc]/route.ts`
- Modify: `tests/server/trpc/context.test.ts`

- [ ] **Step 1: Update the context shape**

Edit `src/server/trpc/context.ts`:

```ts
import { getAdminAuth } from '@/lib/server/firebase-admin'
import { logger, withRequestId } from '@/lib/server/logger'
import type { Logger } from 'pino'

export interface TrpcContext {
  uid?: string
  logger: Logger
  reqId: string
}

export async function createContext({ req }: { req: Request }): Promise<TrpcContext> {
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const log = withRequestId(logger, reqId)

  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return { logger: log, reqId }
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return { uid: decoded.uid, logger: log.child({ uid: decoded.uid }), reqId }
  } catch {
    return { logger: log, reqId }
  }
}
```

- [ ] **Step 2: Update the context test**

Edit `tests/server/trpc/context.test.ts` — every existing assertion still holds, but now `ctx.logger` and `ctx.reqId` must exist. Add assertions:

```ts
it('always attaches logger and reqId', async () => {
  const req = new Request('http://x/api/trpc/accounts.list')
  const ctx = await createContext({ req })
  expect(ctx.logger).toBeDefined()
  expect(typeof ctx.reqId).toBe('string')
  expect(ctx.reqId.length).toBeGreaterThan(0)
})
```

- [ ] **Step 3: Run the context test**

Run: `npx jest tests/server/trpc/context.test.ts`
Expected: PASS.

- [ ] **Step 4: Propagate reqId in the response**

Edit `src/app/api/trpc/[trpc]/route.ts`:

```ts
import { fetchRequestHandler } from '@trpc/server/adapters/fetch'
import { appRouter } from '@/server/trpc/root'
import { createContext } from '@/server/trpc/context'

export const maxDuration = 60

const handler = async (req: Request) => {
  const reqId = req.headers.get('x-request-id') ?? crypto.randomUUID()
  const res = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createContext({ req: new Request(req.url, { method: req.method, headers: { ...Object.fromEntries(req.headers), 'x-request-id': reqId }, body: req.body, duplex: 'half' } as RequestInit) }),
  })
  res.headers.set('x-request-id', reqId)
  return res
}

export { handler as GET, handler as POST }
```

Note: the cloning pattern above is needed because `fetchRequestHandler` consumes the request stream. If your Next.js + tRPC v11 setup handles request-id propagation cleanly without cloning, simplify accordingly — the goal is that `ctx.reqId` and the response `x-request-id` header match.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc/context.ts src/server/trpc/index.ts src/app/api/trpc/[trpc]/route.ts tests/server/trpc/context.test.ts
git commit -m "feat(trpc): propagate request-id + pino logger through ctx"
```

---

### Task 3: Replace server console.log with pino

**Files:**
- Modify: any server-side file using `console.log` / `console.warn` / `console.error`

- [ ] **Step 1: Survey**

Run: `grep -rn "console\\.\\(log\\|warn\\|error\\|info\\|debug\\)" src/server src/lib/server src/app/api`
Expected: a list. Each call is a candidate for replacement.

- [ ] **Step 2: Replace inside tRPC procedures**

For every `console.warn(...)` / `console.error(...)` in a procedure body, replace with `ctx.logger.warn({ ... }, 'message')`. Keep the message string short; move data into the object arg.

Example — `src/server/trpc/routers/calendars.ts` current:

```ts
console.warn(`[calendars] skipping account ${acc.id}: ${e.message ?? 'unknown error'}`)
```

becomes:

```ts
ctx.logger.warn({ accountId: acc.id, error: e.message }, 'calendars: skipping account')
```

- [ ] **Step 3: Replace inside standalone server libs**

`src/lib/server/*.ts` can import the module-level logger:

```ts
import { logger } from '@/lib/server/logger'

logger.warn({ context: 'oauth', err: e.message }, 'refresh token failed')
```

- [ ] **Step 4: Confirm type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(server): replace console.log with pino"
```

---

### Task 4: Rate-limit middleware

**Files:**
- Create: `src/lib/server/rate-limit.ts`
- Create: `tests/server/rate-limit.test.ts`
- Modify: `src/server/trpc/index.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/rate-limit.test.ts`:

```ts
import { tokenBucketAllow, createBucketStore } from '@/lib/server/rate-limit'

describe('tokenBucketAllow', () => {
  it('allows first N requests and rejects the N+1th within the window', () => {
    const store = createBucketStore()
    const key = 'uid:abc'
    let allowed = 0
    for (let i = 0; i < 6; i++) {
      if (tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => 1000 })) allowed++
    }
    expect(allowed).toBe(5)
  })

  it('refills tokens after the window passes', () => {
    const store = createBucketStore()
    const key = 'uid:abc'
    let now = 1000
    for (let i = 0; i < 5; i++) tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })
    expect(tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })).toBe(false)
    now += 60_001
    expect(tokenBucketAllow(store, key, { max: 5, windowMs: 60_000, now: () => now })).toBe(true)
  })

  it('tracks separate keys independently', () => {
    const store = createBucketStore()
    for (let i = 0; i < 5; i++) tokenBucketAllow(store, 'uid:a', { max: 5, windowMs: 60_000, now: () => 1000 })
    expect(tokenBucketAllow(store, 'uid:a', { max: 5, windowMs: 60_000, now: () => 1000 })).toBe(false)
    expect(tokenBucketAllow(store, 'uid:b', { max: 5, windowMs: 60_000, now: () => 1000 })).toBe(true)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/rate-limit.ts`:

```ts
import { TRPCError } from '@trpc/server'
import { t } from '@/server/trpc'

export interface BucketStore {
  get(key: string): { remaining: number; resetAt: number } | undefined
  set(key: string, value: { remaining: number; resetAt: number }): void
}

export function createBucketStore(): BucketStore {
  const map = new Map<string, { remaining: number; resetAt: number }>()
  return {
    get: (k) => map.get(k),
    set: (k, v) => { map.set(k, v) },
  }
}

interface Opts {
  max: number
  windowMs: number
  now?: () => number
}

export function tokenBucketAllow(store: BucketStore, key: string, opts: Opts): boolean {
  const now = (opts.now ?? Date.now)()
  const current = store.get(key)
  if (!current || now >= current.resetAt) {
    store.set(key, { remaining: opts.max - 1, resetAt: now + opts.windowMs })
    return true
  }
  if (current.remaining <= 0) return false
  store.set(key, { remaining: current.remaining - 1, resetAt: current.resetAt })
  return true
}

const sharedStore = createBucketStore()

export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  return t.middleware(({ ctx, next }) => {
    const key = `uid:${ctx.uid ?? 'anon'}`
    if (!tokenBucketAllow(sharedStore, key, { max, windowMs })) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded' })
    }
    return next()
  })
}
```

Note: this imports `t` from `@/server/trpc`. That module currently exports `router`, `publicProcedure`, `protectedProcedure`. Add a raw `t` export:

```ts
// src/server/trpc/index.ts
// ...existing setup...
export const t = initTRPC.context<TrpcContext>().create({ ... })  // the existing builder
export const router = t.router
export const publicProcedure = t.procedure
// etc.
```

Only expose `t` from this one module; everywhere else uses the typed helpers.

- [ ] **Step 4: Apply rate limits to expensive procedures**

Wrap the digest and write procedures. Example:

```ts
// src/server/trpc/routers/inbox.ts
import { rateLimit } from '@/lib/server/rate-limit'

export const inboxRouter = router({
  digest: protectedProcedure
    .use(rateLimit({ max: 20, windowMs: 60_000 })) // 20 per minute per uid
    .query(async ({ ctx }) => { /* ... */ }),
})
```

Suggested limits per procedure (adjust after prod data):
- `inbox.digest`: 20/min
- `attachments.extract`: 10/min
- `actions.commitCalendar`, `actions.commitTask`: 30/min
- `inbox.sendReply`: 10/min
- Everything else: default (no explicit limit)

- [ ] **Step 5: Confirm**

Run: `npx jest tests/server/rate-limit.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit && npx jest`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/rate-limit.ts src/server/trpc tests/server/rate-limit.test.ts
git commit -m "feat(trpc): per-uid token-bucket rate limiting"
```

---

### Task 5: Sentry

**Files:**
- Create: `sentry.client.config.ts`
- Create: `sentry.server.config.ts`
- Create: `sentry.edge.config.ts`
- Create: `instrumentation.ts`
- Modify: `next.config.ts`
- Modify: `.env.local.example`

- [ ] **Step 1: Run the Sentry wizard OR manual setup**

Option A (automated — preferred):

```bash
npx @sentry/wizard@latest -i nextjs
```

Choose "App Router". Paste the DSN from P1. The wizard creates `sentry.*.config.ts` and modifies `next.config.ts` for you. Review its diff, accept only changes that make sense (it often adds test routes — skip those).

Option B (manual) — if the wizard misbehaves, create the four files by hand following Sentry's App Router docs. Reference the output of `claude.ai_Context7 → @sentry/nextjs`.

- [ ] **Step 2: Configure sensible defaults**

In each `sentry.*.config.ts`:

```ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  replaysSessionSampleRate: 0.0,   // session replay off for now (privacy)
  replaysOnErrorSampleRate: 0.0,
  environment: process.env.NODE_ENV,
  enabled: process.env.NODE_ENV !== 'test',
})
```

- [ ] **Step 3: Report errors from tRPC**

Edit `src/server/trpc/index.ts` error formatter:

```ts
import * as Sentry from '@sentry/nextjs'

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error, ctx }) {
    // Capture 5xx / unexpected errors to Sentry
    if (!error.code || error.code === 'INTERNAL_SERVER_ERROR') {
      Sentry.captureException(error, { user: ctx?.uid ? { id: ctx.uid } : undefined })
    }
    return shape
  },
})
```

- [ ] **Step 4: Update `.env.local.example`**

```
# Sentry
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
SENTRY_ORG=""
SENTRY_PROJECT="the-hub"
```

- [ ] **Step 5: Verify with a deliberate crash**

Add a temporary debug procedure, run `npm run dev`, trigger it from a browser tab, confirm the error shows up in Sentry's Issues tab within ~30s. Remove the debug procedure before committing.

- [ ] **Step 6: Commit**

```bash
git add sentry.*.config.ts instrumentation.ts next.config.ts .env.local.example src/server/trpc/index.ts
git commit -m "feat(observability): Sentry error tracking for client + server"
```

---

### Task 6: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json` — add `ci:verify` script

- [ ] **Step 1: Add a bundled verification script**

Edit `package.json` `scripts`:

```json
"ci:verify": "npm run lint && tsc --noEmit && jest --ci"
```

Run: `npm run ci:verify`
Expected: all green. If not, fix before continuing — CI will enforce this.

- [ ] **Step 2: Create the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run ci:verify
        env:
          SENTRY_DSN: ''    # Sentry disabled in CI (no DSN)
```

- [ ] **Step 3: Enable branch protection**

In GitHub → repo Settings → Branches → Add rule for `main`:
- Require pull request reviews
- Require status checks to pass → select `verify`
- Require branches to be up to date before merging

This is a GitHub UI setting — document it in the commit message, not in code.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: verify tsc + jest + eslint on every PR"
```

Push and open a PR. Confirm the CI job runs and passes.

---

### Task 7: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/auth-fixture.ts`
- Create: `tests/e2e/smoke.spec.ts`
- Modify: `package.json` (script)
- Modify: `.gitignore` (playwright-report/, test-results/)

- [ ] **Step 1: Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 2: Auth fixture**

Create `tests/e2e/auth-fixture.ts`:

```ts
import { test as base } from '@playwright/test'

interface Creds { email: string; password: string }

async function signIn(page: import('@playwright/test').Page, creds: Creds) {
  const apiKey = process.env.FIREBASE_WEB_API_KEY
  if (!apiKey) throw new Error('FIREBASE_WEB_API_KEY not set')
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: creds.email, password: creds.password, returnSecureToken: true }),
    },
  )
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status}`)
  const data = await res.json()
  await page.addInitScript(([idToken, refreshToken, uid, email]) => {
    // Firebase JS SDK reads the user from IndexedDB under key "firebase:authUser:..."
    // Stub the auth state by writing the user object. Exact key + shape depends on the
    // Firebase version; run once manually and inspect IndexedDB to confirm. For 12.x:
    const stub = { uid, email, stsTokenManager: { accessToken: idToken, refreshToken, expirationTime: Date.now() + 3600_000 } }
    window.localStorage.setItem('firebase:authUser:stub', JSON.stringify(stub))
  }, [data.idToken, data.refreshToken, data.localId, data.email])
}

export const test = base.extend<{ signedInPage: import('@playwright/test').Page }>({
  signedInPage: async ({ page }, use) => {
    const email = process.env.E2E_USER_EMAIL
    const password = process.env.E2E_USER_PASSWORD
    if (!email || !password) throw new Error('E2E_USER_EMAIL / E2E_USER_PASSWORD not set')
    await signIn(page, { email, password })
    await page.goto('/')
    await use(page)
  },
})

export { expect } from '@playwright/test'
```

Note: the exact localStorage / IndexedDB key Firebase writes differs by SDK version. The snippet above uses a placeholder approach; on first run, sign in manually, inspect `Application → Storage → Local Storage` in devtools, copy the real key name, and paste into the `addInitScript` body. Record the exact key in a comment so future devs know.

- [ ] **Step 3: Smoke test**

Create `tests/e2e/smoke.spec.ts`:

```ts
import { test, expect } from './auth-fixture'

test.describe('authenticated smoke', () => {
  test('home page renders', async ({ signedInPage }) => {
    await expect(signedInPage).toHaveURL(/\/$|\/home/)
    await expect(signedInPage.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('inbox renders the triage layout', async ({ signedInPage }) => {
    await signedInPage.goto('/inbox')
    await expect(signedInPage.getByRole('heading', { name: /triage/i })).toBeVisible()
  })

  test('settings lists linked accounts section', async ({ signedInPage }) => {
    await signedInPage.goto('/settings')
    await expect(signedInPage.getByText(/linked google accounts/i)).toBeVisible()
  })
})
```

- [ ] **Step 4: Add script + gitignore**

`package.json` scripts:

```json
"test:e2e": "playwright test"
```

`.gitignore` additions:

```
playwright-report/
test-results/
```

- [ ] **Step 5: Run locally**

Run: `npm run test:e2e`
Expected: 3 passing tests. If sign-in fixture fails, fix the storage key (see note in Step 2).

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e package.json .gitignore
git commit -m "test(e2e): Playwright smoke — home, inbox, settings"
```

- [ ] **Step 7: Extend CI**

Append a second job to `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npm run test:e2e
        env:
          E2E_USER_EMAIL: ${{ secrets.E2E_USER_EMAIL }}
          E2E_USER_PASSWORD: ${{ secrets.E2E_USER_PASSWORD }}
          FIREBASE_WEB_API_KEY: ${{ secrets.FIREBASE_WEB_API_KEY }}
          FIREBASE_ADMIN_SA_JSON: ${{ secrets.FIREBASE_ADMIN_SA_JSON }}
          TOKEN_ENCRYPTION_KEY: ${{ secrets.TOKEN_ENCRYPTION_KEY }}
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

Set each referenced `secrets.*` value in GitHub → repo Settings → Secrets and variables → Actions.

- [ ] **Step 8: Commit + push, confirm green**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run Playwright smoke in a second job"
```

---

### Task 8: Security headers

**Files:**
- Create: `src/lib/server/security-headers.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Define the header set**

Create `src/lib/server/security-headers.ts`:

```ts
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://*.sentry.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://*.gstatic.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self' https://*.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.sentry.io",
  "frame-src 'self' https://accounts.google.com",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
]
```

CSP caveats:
- `unsafe-inline` in `script-src` is required by Next.js App Router's inline boot script. Next plans to remove this in a future version with nonces; revisit then.
- The Google + Firebase + Sentry hosts are all in use by existing features. If you add a new third-party script, update the CSP.

- [ ] **Step 2: Wire headers into Next.js config**

Edit `next.config.ts`:

```ts
import { securityHeaders } from './src/lib/server/security-headers'
// plus the existing withSentryConfig wrapper from Task 5

const baseConfig = {
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
    ]
  },
  // ...existing config
}

export default withSentryConfig(baseConfig, { /* sentry opts */ })
```

- [ ] **Step 3: Smoke**

Run: `npm run dev`, open DevTools → Network → reload `/`. Confirm response headers include `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options: DENY`, etc.

Run: `npm run build` to confirm production build succeeds with the headers in place.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/security-headers.ts next.config.ts
git commit -m "feat(security): CSP + HSTS + standard hardening headers"
```

---

### Task 9: Verification + merge prep

- [ ] **Step 1: Full suite**

```bash
npm run ci:verify
npm run test:e2e
```

Expected: all green, both locally and on CI.

- [ ] **Step 2: Manual sanity check**

- Hit `/` → confirm headers in network tab include the new security set.
- Break something intentionally in a tRPC procedure → confirm error arrives in Sentry within 30s.
- Hammer `/api/trpc/inbox.digest` 25 times in a loop → confirm the 21st returns `TOO_MANY_REQUESTS`.
- Check `docker logs` / `vercel logs` / your stdout consumer → confirm log lines are JSON with `reqId`, `uid`, `service: "the-hub"`.

- [ ] **Step 3: Docs**

Update `README.md` with a short "Deploying" section listing required env vars, Sentry project link, branch-protection status. Keep to ~20 lines.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: production deployment checklist"
```

- [ ] **Step 5: Open PR**

Title: `chore: production readiness — Sentry + pino + CI + Playwright + rate limits + security headers`
Body: enumerate the four new concerns and link the relevant tasks. Reference this plan.

---

## Post-Plan Verification

1. CI green on the PR.
2. Sentry receives a test error within 30s of triggering.
3. `npm run test:e2e` green locally and in CI.
4. Rate limit fires on manual load test.
5. Security headers visible in prod response (once deployed).
6. Production deploy: only set `NODE_ENV=production` and the new env vars; everything else unchanged.

## What's Next

Once this ships, the feature phase plans (2, 3, 4, 5, 6, 7, calendar v2) inherit:
- Every tRPC procedure has `ctx.logger` and `ctx.reqId` available without new wiring.
- Every procedure can opt into rate limiting with one line: `.use(rateLimit({ max, windowMs }))`.
- Every PR runs `tsc` + `jest` + `eslint` + Playwright in CI before merge.
- Every uncaught error during a procedure call arrives in Sentry with the user's uid attached.
- Every production deploy gets strict CSP + HSTS.

Feature plans should ADD their own E2E tests to `tests/e2e/` as they ship, so the smoke surface grows with the product. Phase 3 (UI) in particular should add one E2E per major interaction (select email, clear, restore, action-card edit).
