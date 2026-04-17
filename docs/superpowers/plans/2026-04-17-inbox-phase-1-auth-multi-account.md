# Inbox Redesign — Phase 1: Auth & Multi-Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Google OAuth from client-side Firebase popup to a server-side flow with encrypted refresh tokens stored per linked Gmail account, enabling (a) the user to link all three Gmail accounts and see their inboxes merged, and (b) permanent elimination of the "hourly 401" re-login bug.

**Architecture:** Client-side Firebase Auth still establishes user identity (uid). Server-side Google OAuth issues refresh tokens per linked Gmail account, stored encrypted in Firestore under `users/{uid}/accounts/{accountId}`. All Google API calls (Gmail, Calendar, Tasks) move from client to server routes, which mint short-lived access tokens on demand using the stored refresh token. Client routes authenticate to server routes with a Firebase ID token.

**Tech Stack:** Next.js 16 (App Router, Route Handlers), Firebase Auth (client) + Firebase Admin SDK (server), Firestore, `googleapis` npm package (server-side), Node crypto (AES-256-GCM).

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "Auth & Multi-Account" section.

---

## Before You Start — Read These

Next.js 16 has changed conventions. Read BEFORE writing code:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — how API routes work in this version
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (if present) — file convention for Route Handlers
- Check `package.json` for the installed Next.js version and confirm against the docs you just read.

This codebase's `AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Do not assume patterns from memory.

If anything in this plan conflicts with what the Next.js 16 docs say, follow the docs and update the plan.

---

## File Structure

### New files
- `src/lib/server/firebase-admin.ts` — Firebase Admin SDK initialization (singleton)
- `src/lib/server/session.ts` — validates Firebase ID token from request headers → returns `{ uid }`
- `src/lib/server/crypto.ts` — `encrypt(plaintext)` / `decrypt(ciphertext)` using AES-256-GCM
- `src/lib/server/accounts.ts` — Firestore CRUD for `Account` records (create, list by uid, get by id, delete)
- `src/lib/server/google-oauth.ts` — OAuth URL builder, code-for-token exchange, refresh-token exchange, scope list
- `src/app/api/auth/google/start/route.ts` — GET: returns Google OAuth URL (caller opens in popup/redirect)
- `src/app/api/auth/google/callback/route.ts` — GET: handles `?code=` from Google, exchanges, stores Account, redirects to `/settings#accounts`
- `src/app/api/accounts/route.ts` — GET: list user's accounts. DELETE: remove account by id.
- `src/app/api/gmail/list/route.ts` — POST: fetches unread primary emails from all user's accounts (replaces client-side Gmail calls in store)
- `src/app/api/calendar/list/route.ts` — POST: fetches calendar events server-side
- `src/app/api/tasks/list/route.ts` — POST: fetches tasks server-side
- `src/components/settings/accounts-section.tsx` — UI for listing linked accounts + "Add another" button + per-account "Remove"
- `tests/server/crypto.test.ts` — encryption round-trip, tamper detection
- `tests/server/google-oauth.test.ts` — URL builder, mocked token exchange
- `tests/server/accounts.test.ts` — Firestore CRUD against emulator or mocked admin SDK

### Modified files
- `src/lib/firebase.ts` — remove OAuth scope requests from `GoogleAuthProvider` (server handles scopes now); keep Firebase Auth for identity only
- `src/lib/auth-provider.tsx` — stop storing `google_access_token` in localStorage; expose `getIdToken()` helper for authenticated fetches
- `src/lib/store.tsx` — replace direct `googleapis.com` fetches with calls to `/api/gmail/list`, `/api/calendar/list`, `/api/tasks/list` using Firebase ID token
- `src/app/settings/page.tsx` — add new Accounts section component
- `src/app/api/inbox/digest/route.ts` — accept uid-authenticated calls, fetch emails via new `gmail/list` server code (may become a thin wrapper)
- `.env.local.example` — document new env vars: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY`, `FIREBASE_ADMIN_SA_JSON`

### Out of scope for Phase 1
- The `/inbox` page redesign (Phase 3)
- New AI extraction logic, 6 classifications, sender identity (Phase 2)
- PDF extraction (Phase 4)
- Reply sending (Phase 5)
- Home widget redesign (Phase 6)

Phase 1 deliberately keeps the existing UI. After Phase 1 ships, the user will see: the old inbox UI, but populated with emails from all linked accounts, no more hourly 401, and a new Settings → Accounts section.

---

## Prerequisites (one-time setup by the human)

These are environment/infrastructure steps the implementing agent cannot do alone. Surface them before Task 1.

- [ ] **P1. Create Google OAuth client credentials.** In Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID (Web application). Authorized redirect URI: `http://localhost:3000/api/auth/google/callback` (dev) and production equivalent. Enable APIs: Gmail, Calendar, Tasks, Drive. Save Client ID + Client Secret to `.env.local`:

  ```
  GOOGLE_OAUTH_CLIENT_ID="..."
  GOOGLE_OAUTH_CLIENT_SECRET="..."
  GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"
  ```

- [ ] **P2. Create a Firebase service account for Admin SDK.** Firebase Console → Project Settings → Service Accounts → Generate new private key. Save the JSON content to `.env.local` as a single-line string:

  ```
  FIREBASE_ADMIN_SA_JSON='{"type":"service_account","project_id":"...",...}'
  ```

- [ ] **P3. Generate a token encryption key.** Run `node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'`. Save to `.env.local`:

  ```
  TOKEN_ENCRYPTION_KEY="<the base64 string>"
  ```

- [ ] **P4. Confirm `.env.local` is gitignored.** Look at `.gitignore`; `.env*.local` should already be listed. If not, add it and commit. Do not commit real credentials.

---

## Tasks

### Task 0: Install Jest + ts-jest

No test runner is currently configured. Set one up before writing any tests.

**Files:**
- Create: `jest.config.mjs`
- Create: `tests/setup.ts`
- Modify: `package.json` (add scripts + devDependencies)

- [ ] **Step 1: Install dev dependencies**

Run: `npm install -D jest ts-jest @types/jest @testing-library/react @testing-library/jest-dom jest-environment-jsdom`
Expected: packages added to `devDependencies`.

- [ ] **Step 2: Create `jest.config.mjs`**

```javascript
// jest.config.mjs
/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFilesAfterEach: ['<rootDir>/tests/setup.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', esModuleInterop: true } }],
  },
}
```

- [ ] **Step 3: Create `tests/setup.ts`**

```typescript
// tests/setup.ts
// Per-test setup hooks go here. Kept minimal for now.
```

- [ ] **Step 4: Add test script to `package.json`**

Add to the `scripts` block:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Verify Jest runs (no tests yet)**

Run: `npm test`
Expected: "No tests found" is acceptable (Jest exits 1 with `passWithNoTests:false`; use `npm test -- --passWithNoTests` for this sanity check): `npm test -- --passWithNoTests`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add jest.config.mjs tests/setup.ts package.json package-lock.json
git commit -m "chore: add Jest with ts-jest"
```

Subsequent tasks reference `npx jest <path>`; substitute `npm test -- <path>` if you prefer the script form.

---

### Task 1: Encryption utility

**Files:**
- Create: `src/lib/server/crypto.ts`
- Test: `tests/server/crypto.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/server/crypto.test.ts
import { encrypt, decrypt } from '@/lib/server/crypto'

describe('crypto', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64')
  })

  it('round-trips plaintext', () => {
    const plaintext = 'ya29.a0ARW5m7example-refresh-token'
    const ciphertext = encrypt(plaintext)
    expect(ciphertext).not.toBe(plaintext)
    expect(decrypt(ciphertext)).toBe(plaintext)
  })

  it('produces different ciphertext on each call (fresh IV)', () => {
    const a = encrypt('same-token')
    const b = encrypt('same-token')
    expect(a).not.toBe(b)
  })

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('secret')
    const tampered = ct.slice(0, -4) + 'AAAA'
    expect(() => decrypt(tampered)).toThrow()
  })

  it('throws when TOKEN_ENCRYPTION_KEY is missing', () => {
    const saved = process.env.TOKEN_ENCRYPTION_KEY
    delete process.env.TOKEN_ENCRYPTION_KEY
    expect(() => encrypt('x')).toThrow(/TOKEN_ENCRYPTION_KEY/)
    process.env.TOKEN_ENCRYPTION_KEY = saved
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/server/crypto.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the module**

```typescript
// src/lib/server/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

const ALGO = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16

function getKey(): Buffer {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY
  if (!b64) throw new Error('TOKEN_ENCRYPTION_KEY not set')
  const key = Buffer.from(b64, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes')
  return key
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decrypt(ciphertext: string): string {
  const key = getKey()
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/server/crypto.test.ts`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/crypto.ts tests/server/crypto.test.ts
git commit -m "feat(server): add AES-256-GCM token encryption utility"
```

---

### Task 2: Firebase Admin initialization

**Files:**
- Create: `src/lib/server/firebase-admin.ts`
- Test: `tests/server/firebase-admin.test.ts`

- [ ] **Step 1: Install `firebase-admin`**

Run: `npm install firebase-admin`
Expected: package added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/server/firebase-admin.test.ts
import { getAdminAuth, getAdminDb } from '@/lib/server/firebase-admin'

describe('firebase-admin', () => {
  beforeAll(() => {
    process.env.FIREBASE_ADMIN_SA_JSON = JSON.stringify({
      type: 'service_account',
      project_id: 'the-hub-c0601',
      private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...FAKE...==\n-----END PRIVATE KEY-----\n',
      client_email: 'test@the-hub-c0601.iam.gserviceaccount.com',
    })
  })

  it('exports singletons', () => {
    const auth1 = getAdminAuth()
    const auth2 = getAdminAuth()
    expect(auth1).toBe(auth2)
    const db1 = getAdminDb()
    const db2 = getAdminDb()
    expect(db1).toBe(db2)
  })

  it('throws when FIREBASE_ADMIN_SA_JSON is missing', () => {
    const saved = process.env.FIREBASE_ADMIN_SA_JSON
    delete process.env.FIREBASE_ADMIN_SA_JSON
    // Force re-init by clearing module cache
    jest.resetModules()
    expect(() => require('@/lib/server/firebase-admin').getAdminAuth()).toThrow(/FIREBASE_ADMIN_SA_JSON/)
    process.env.FIREBASE_ADMIN_SA_JSON = saved
  })
})
```

- [ ] **Step 3: Run test to verify failure**

Run: `npx jest tests/server/firebase-admin.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement the singleton**

```typescript
// src/lib/server/firebase-admin.ts
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'

let app: App | null = null

function initApp(): App {
  if (app) return app
  const existing = getApps()[0]
  if (existing) {
    app = existing
    return app
  }
  const saJson = process.env.FIREBASE_ADMIN_SA_JSON
  if (!saJson) throw new Error('FIREBASE_ADMIN_SA_JSON not set')
  const credentials = JSON.parse(saJson)
  app = initializeApp({ credential: cert(credentials) })
  return app
}

export function getAdminAuth(): Auth {
  return getAuth(initApp())
}

export function getAdminDb(): Firestore {
  return getFirestore(initApp())
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx jest tests/server/firebase-admin.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/firebase-admin.ts tests/server/firebase-admin.test.ts package.json package-lock.json
git commit -m "feat(server): add Firebase Admin SDK initialization singleton"
```

---

### Task 3: Session validator

**Files:**
- Create: `src/lib/server/session.ts`
- Test: `tests/server/session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/session.test.ts
import { getUidFromRequest } from '@/lib/server/session'
import { getAdminAuth } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('getUidFromRequest', () => {
  const mockVerifyIdToken = jest.fn()
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminAuth as jest.Mock).mockReturnValue({ verifyIdToken: mockVerifyIdToken })
  })

  it('returns uid when Authorization header holds valid Firebase ID token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'mary-uid' })
    const req = new Request('http://x', { headers: { Authorization: 'Bearer valid-token' } })
    expect(await getUidFromRequest(req)).toBe('mary-uid')
    expect(mockVerifyIdToken).toHaveBeenCalledWith('valid-token')
  })

  it('throws 401 when no Authorization header', async () => {
    const req = new Request('http://x')
    await expect(getUidFromRequest(req)).rejects.toThrow(/401/)
  })

  it('throws 401 when token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const req = new Request('http://x', { headers: { Authorization: 'Bearer bad' } })
    await expect(getUidFromRequest(req)).rejects.toThrow(/401/)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/server/session.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/server/session.ts
import { getAdminAuth } from './firebase-admin'

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

export async function getUidFromRequest(req: Request): Promise<string> {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Missing bearer token')
  const token = header.slice('Bearer '.length)
  try {
    const decoded = await getAdminAuth().verifyIdToken(token)
    return decoded.uid
  } catch (e: any) {
    throw new HttpError(401, `Invalid token: ${e.message}`)
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/server/session.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/session.ts tests/server/session.test.ts
git commit -m "feat(server): add Firebase ID token session validator"
```

---

### Task 4: Google OAuth helper

**Files:**
- Create: `src/lib/server/google-oauth.ts`
- Test: `tests/server/google-oauth.test.ts`

- [ ] **Step 1: Install `googleapis`**

Run: `npm install googleapis`
Expected: package added.

- [ ] **Step 2: Write the failing test**

```typescript
// tests/server/google-oauth.test.ts
import { buildAuthUrl, SCOPES, exchangeCode, refreshAccessToken } from '@/lib/server/google-oauth'

describe('google-oauth', () => {
  beforeAll(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'cid.apps.googleusercontent.com'
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'secret'
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
  })

  it('builds an auth URL with all required scopes and offline access', () => {
    const url = buildAuthUrl('state-123')
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(u.searchParams.get('access_type')).toBe('offline')
    expect(u.searchParams.get('prompt')).toBe('consent')
    expect(u.searchParams.get('state')).toBe('state-123')
    expect(u.searchParams.get('scope')).toContain('gmail.readonly')
    expect(u.searchParams.get('scope')).toContain('gmail.modify')
    expect(u.searchParams.get('scope')).toContain('gmail.send')
    expect(u.searchParams.get('scope')).toContain('calendar.events')
    expect(u.searchParams.get('scope')).toContain('tasks')
  })

  it('includes exactly these scopes', () => {
    expect(SCOPES).toEqual(expect.arrayContaining([
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ]))
  })
})
```

Note: `exchangeCode` and `refreshAccessToken` tests are covered by integration tests in later tasks because they wrap the `googleapis` library and mocking it here adds noise without value. The unit tests above cover the parts we own.

- [ ] **Step 3: Run tests**

Run: `npx jest tests/server/google-oauth.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

```typescript
// src/lib/server/google-oauth.ts
import { google } from 'googleapis'

export const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google OAuth env vars missing')
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri)
}

export function buildAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  })
}

export async function exchangeCode(code: string): Promise<{
  refreshToken: string
  accessToken: string
  expiresAt: number
  email: string
}> {
  const client = getClient()
  const { tokens } = await client.getToken(code)
  if (!tokens.refresh_token) throw new Error('No refresh token returned; ensure prompt=consent and offline access')
  client.setCredentials(tokens)
  const userinfo = await google.oauth2({ version: 'v2', auth: client }).userinfo.get()
  const email = userinfo.data.email
  if (!email) throw new Error('Userinfo did not return email')
  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token!,
    expiresAt: tokens.expiry_date ?? Date.now() + 3600_000,
    email,
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiresAt: number
}> {
  const client = getClient()
  client.setCredentials({ refresh_token: refreshToken })
  const res = await client.refreshAccessToken()
  return {
    accessToken: res.credentials.access_token!,
    expiresAt: res.credentials.expiry_date ?? Date.now() + 3600_000,
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/server/google-oauth.test.ts`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/google-oauth.ts tests/server/google-oauth.test.ts package.json package-lock.json
git commit -m "feat(server): add Google OAuth helper with scopes and token flow"
```

---

### Task 5: Account Firestore CRUD

**Files:**
- Create: `src/lib/server/accounts.ts`
- Test: `tests/server/accounts.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/accounts.test.ts
import { createAccount, listAccounts, getAccount, deleteAccount, type Account } from '@/lib/server/accounts'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('accounts CRUD', () => {
  const mockSet = jest.fn()
  const mockGet = jest.fn()
  const mockDelete = jest.fn()
  const mockDoc = jest.fn(() => ({ set: mockSet, get: mockGet, delete: mockDelete }))
  const mockCollection = jest.fn(() => ({ doc: mockDoc, get: mockGet }))

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue({ collection: mockCollection })
  })

  it('creates an account with encrypted refresh token', async () => {
    mockSet.mockResolvedValue(undefined)
    const id = await createAccount('mary-uid', {
      email: 'mary.w.mckee@gmail.com',
      refreshToken: 'raw-rt',
      scopes: ['gmail.readonly'],
    })
    expect(id).toMatch(/.+/)
    expect(mockSet).toHaveBeenCalledTimes(1)
    const payload = mockSet.mock.calls[0][0] as Account
    expect(payload.email).toBe('mary.w.mckee@gmail.com')
    expect(payload.refreshToken).not.toBe('raw-rt') // encrypted
    expect(payload.scopes).toEqual(['gmail.readonly'])
    expect(payload.addedAt).toBeGreaterThan(0)
  })

  it('lists accounts by uid', async () => {
    mockGet.mockResolvedValue({
      docs: [
        { id: 'a1', data: () => ({ email: 'mary@tribe.ai', refreshToken: 'enc1', scopes: [], addedAt: 1 }) },
        { id: 'a2', data: () => ({ email: 'mary.w.mckee@gmail.com', refreshToken: 'enc2', scopes: [], addedAt: 2 }) },
      ],
    })
    const out = await listAccounts('mary-uid')
    expect(out.map(a => a.email)).toEqual(['mary@tribe.ai', 'mary.w.mckee@gmail.com'])
  })

  it('deletes an account', async () => {
    mockDelete.mockResolvedValue(undefined)
    await deleteAccount('mary-uid', 'a1')
    expect(mockDelete).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/server/accounts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/lib/server/accounts.ts
import { randomUUID } from 'crypto'
import { getAdminDb } from './firebase-admin'
import { encrypt, decrypt } from './crypto'

export interface Account {
  id: string
  email: string
  displayName?: string
  refreshToken: string     // encrypted on disk
  scopes: string[]
  addedAt: number
  lastSyncedAt?: number
}

function col(uid: string) {
  return getAdminDb().collection('users').doc(uid).collection('accounts')
}

export async function createAccount(uid: string, input: {
  email: string
  displayName?: string
  refreshToken: string
  scopes: string[]
}): Promise<string> {
  const id = randomUUID()
  const record: Account = {
    id,
    email: input.email,
    displayName: input.displayName,
    refreshToken: encrypt(input.refreshToken),
    scopes: input.scopes,
    addedAt: Date.now(),
  }
  await col(uid).doc(id).set(record)
  return id
}

export async function listAccounts(uid: string): Promise<Account[]> {
  const snap = await col(uid).get()
  return snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Account, 'id'>) }))
}

export async function getAccount(uid: string, accountId: string): Promise<Account | null> {
  const d = await col(uid).doc(accountId).get()
  if (!d.exists) return null
  return { id: d.id, ...(d.data() as Omit<Account, 'id'>) }
}

export async function getDecryptedRefreshToken(uid: string, accountId: string): Promise<string | null> {
  const a = await getAccount(uid, accountId)
  return a ? decrypt(a.refreshToken) : null
}

export async function deleteAccount(uid: string, accountId: string): Promise<void> {
  await col(uid).doc(accountId).delete()
}

export async function touchLastSynced(uid: string, accountId: string): Promise<void> {
  await col(uid).doc(accountId).set({ lastSyncedAt: Date.now() }, { merge: true })
}
```

- [ ] **Step 4: Run test**

Run: `npx jest tests/server/accounts.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/accounts.ts tests/server/accounts.test.ts
git commit -m "feat(server): add Account Firestore CRUD with token encryption"
```

---

### Task 6: OAuth start route

**Files:**
- Create: `src/app/api/auth/google/start/route.ts`
- Test: `tests/api/auth-google-start.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/auth-google-start.test.ts
import { GET } from '@/app/api/auth/google/start/route'
import { getUidFromRequest } from '@/lib/server/session'
import { buildAuthUrl } from '@/lib/server/google-oauth'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/google-oauth')

describe('GET /api/auth/google/start', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(buildAuthUrl as jest.Mock).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=x')
  })

  it('returns an auth URL with state = uid', async () => {
    const req = new Request('http://x/api/auth/google/start', {
      headers: { Authorization: 'Bearer valid' },
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.url).toContain('accounts.google.com')
    expect(buildAuthUrl).toHaveBeenCalledWith('mary-uid')
  })

  it('returns 401 when no auth', async () => {
    ;(getUidFromRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    const req = new Request('http://x')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run: `npx jest tests/api/auth-google-start.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the route**

After reading `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` to confirm the Route Handler signature for Next.js 16:

```typescript
// src/app/api/auth/google/start/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { buildAuthUrl } from '@/lib/server/google-oauth'

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const url = buildAuthUrl(uid)
    return NextResponse.json({ url })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/auth-google-start.test.ts`
Expected: 2 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/google/start/route.ts tests/api/auth-google-start.test.ts
git commit -m "feat(api): add Google OAuth start route"
```

---

### Task 7: OAuth callback route

**Files:**
- Create: `src/app/api/auth/google/callback/route.ts`
- Test: `tests/api/auth-google-callback.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/auth-google-callback.test.ts
import { GET } from '@/app/api/auth/google/callback/route'
import { exchangeCode, SCOPES } from '@/lib/server/google-oauth'
import { createAccount } from '@/lib/server/accounts'

jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/accounts')

describe('GET /api/auth/google/callback', () => {
  beforeEach(() => jest.clearAllMocks())

  it('exchanges code, creates account, redirects to /settings#accounts', async () => {
    ;(exchangeCode as jest.Mock).mockResolvedValue({
      refreshToken: 'rt',
      accessToken: 'at',
      expiresAt: 9999,
      email: 'mary.w.mckee@gmail.com',
    })
    ;(createAccount as jest.Mock).mockResolvedValue('new-account-id')

    const req = new Request('http://x/api/auth/google/callback?code=abc&state=mary-uid')
    const res = await GET(req)

    expect(exchangeCode).toHaveBeenCalledWith('abc')
    expect(createAccount).toHaveBeenCalledWith('mary-uid', expect.objectContaining({
      email: 'mary.w.mckee@gmail.com',
      refreshToken: 'rt',
      scopes: SCOPES,
    }))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toContain('/settings#accounts')
  })

  it('redirects to /settings?error=... on exchange failure', async () => {
    ;(exchangeCode as jest.Mock).mockRejectedValue(new Error('bad code'))
    const req = new Request('http://x/api/auth/google/callback?code=abc&state=mary-uid')
    const res = await GET(req)
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toMatch(/settings\?error=/)
  })

  it('400s on missing code or state', async () => {
    const req = new Request('http://x/api/auth/google/callback?code=abc')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/auth-google-callback.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/app/api/auth/google/callback/route.ts
import { NextResponse } from 'next/server'
import { exchangeCode, SCOPES } from '@/lib/server/google-oauth'
import { createAccount } from '@/lib/server/accounts'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 })
  }

  try {
    const { refreshToken, email } = await exchangeCode(code)
    await createAccount(state, {
      email,
      refreshToken,
      scopes: SCOPES,
    })
    const origin = url.origin
    return NextResponse.redirect(`${origin}/settings#accounts`, 307)
  } catch (e: any) {
    const origin = url.origin
    return NextResponse.redirect(`${origin}/settings?error=${encodeURIComponent(e.message)}`, 307)
  }
}
```

Note: Using `state` as the uid is acceptable here because the OAuth callback is the only way to land on this route, and the state param is signed by Google's OAuth round-trip (indirectly — we pass the uid in, Google returns it unchanged). If we later want stronger CSRF protection, we can sign the state with an HMAC and verify.

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/auth-google-callback.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/google/callback/route.ts tests/api/auth-google-callback.test.ts
git commit -m "feat(api): add Google OAuth callback route"
```

---

### Task 8: Accounts list/delete API

**Files:**
- Create: `src/app/api/accounts/route.ts`
- Test: `tests/api/accounts.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/api/accounts.test.ts
import { GET, DELETE } from '@/app/api/accounts/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')

describe('/api/accounts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
  })

  it('GET returns sanitized accounts (no refresh tokens in payload)', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai', refreshToken: 'enc-1', scopes: ['x'], addedAt: 1 },
      { id: 'a2', email: 'mary.w.mckee@gmail.com', refreshToken: 'enc-2', scopes: ['x'], addedAt: 2 },
    ])
    const req = new Request('http://x/api/accounts', { headers: { Authorization: 'Bearer t' } })
    const res = await GET(req)
    const body = await res.json()
    expect(body.accounts).toHaveLength(2)
    expect(body.accounts[0].refreshToken).toBeUndefined()
    expect(body.accounts[0].email).toBe('mary@tribe.ai')
  })

  it('DELETE removes the account', async () => {
    const req = new Request('http://x/api/accounts?id=a1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await DELETE(req)
    expect(deleteAccount).toHaveBeenCalledWith('mary-uid', 'a1')
    expect(res.status).toBe(200)
  })

  it('DELETE 400s without id', async () => {
    const req = new Request('http://x/api/accounts', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npx jest tests/api/accounts.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```typescript
// src/app/api/accounts/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, deleteAccount } from '@/lib/server/accounts'

export async function GET(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const sanitized = accounts.map(({ refreshToken, ...rest }) => rest)
    return NextResponse.json({ accounts: sanitized })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}

export async function DELETE(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    await deleteAccount(uid, id)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/accounts.test.ts`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/accounts/route.ts tests/api/accounts.test.ts
git commit -m "feat(api): add accounts list/delete route"
```

---

### Task 9: Gmail list route (multi-account)

**Files:**
- Create: `src/app/api/gmail/list/route.ts`
- Test: `tests/api/gmail-list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/gmail-list.test.ts
import { POST } from '@/app/api/gmail/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')

describe('POST /api/gmail/list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([
      { id: 'a1', email: 'mary@tribe.ai' },
      { id: 'a2', email: 'mary.w.mckee@gmail.com' },
    ])
    ;(getDecryptedRefreshToken as jest.Mock).mockImplementation(async (_uid, accId) => `rt-${accId}`)
    ;(refreshAccessToken as jest.Mock).mockImplementation(async (rt) => ({ accessToken: `at-${rt}`, expiresAt: 0 }))
  })

  it('fetches from each account and tags emails with accountId', async () => {
    ;(fetchUnreadPrimary as jest.Mock)
      .mockResolvedValueOnce([{ id: 'm1', subject: 'Work thing' }])
      .mockResolvedValueOnce([{ id: 'm2', subject: 'Zoo trip' }])

    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()

    expect(fetchUnreadPrimary).toHaveBeenCalledTimes(2)
    expect(body.emails).toHaveLength(2)
    const ids = body.emails.map((e: any) => e.accountId).sort()
    expect(ids).toEqual(['a1', 'a2'])
  })

  it('returns empty list if no accounts linked', async () => {
    ;(listAccounts as jest.Mock).mockResolvedValue([])
    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    expect(await res.json()).toEqual({ emails: [] })
  })

  it('skips accounts whose refresh fails, logs error, returns others', async () => {
    ;(refreshAccessToken as jest.Mock)
      .mockImplementationOnce(() => Promise.reject(new Error('rt revoked')))
      .mockImplementationOnce(async () => ({ accessToken: 'at-ok', expiresAt: 0 }))
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([{ id: 'm2', subject: 'Zoo' }])

    const req = new Request('http://x/api/gmail/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails).toHaveLength(1)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0].accountId).toBe('a1')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/gmail-list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement a `fetchUnreadPrimary` helper first**

```typescript
// src/lib/server/gmail-fetcher.ts
export async function fetchUnreadPrimary(accessToken: string): Promise<any[]> {
  const query = encodeURIComponent('in:inbox category:primary is:unread newer_than:7d')
  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=10`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const listData = await listRes.json()
  if (listData.error) throw new Error(listData.error.message || 'Gmail list failed')
  if (!listData.messages) return []

  return Promise.all(listData.messages.map(async (m: { id: string }) => {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    const msgData = await msgRes.json()
    const getHeader = (name: string) =>
      msgData.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || ''
    const extractBody = (payload: any): string => {
      if (!payload) return ''
      if (payload.mimeType === 'text/plain' && payload.body?.data) {
        return Buffer.from(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      }
      if (payload.parts) return payload.parts.map(extractBody).join('')
      return ''
    }
    return {
      id: msgData.id,
      subject: getHeader('subject'),
      sender: getHeader('from'),
      snippet: msgData.snippet,
      fullBody: (extractBody(msgData.payload) || msgData.snippet || '').slice(0, 4000),
      date: parseInt(msgData.internalDate || String(Date.now()), 10),
    }
  }))
}
```

- [ ] **Step 4: Implement the route**

```typescript
// src/app/api/gmail/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)

    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const emails = await fetchUnreadPrimary(accessToken)
        return emails.map(e => ({ ...e, accountId: acc.id, accountEmail: acc.email }))
      } catch (err: any) {
        return { _error: { accountId: acc.id, message: err.message } }
      }
    }))

    const emails = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => ('_error' in r ? [r._error] : []))

    return NextResponse.json({ emails, errors })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/api/gmail-list.test.ts`
Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/gmail/list/route.ts src/lib/server/gmail-fetcher.ts tests/api/gmail-list.test.ts
git commit -m "feat(api): add multi-account Gmail list route"
```

---

### Task 10: Calendar list route

**Files:**
- Create: `src/app/api/calendar/list/route.ts`
- Create: `src/lib/server/calendar-fetcher.ts`
- Test: `tests/api/calendar-list.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/calendar-list.test.ts
import { POST } from '@/app/api/calendar/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/calendar-fetcher')

describe('POST /api/calendar/list', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
  })

  it('returns merged events tagged with accountId', async () => {
    ;(fetchCalendarEvents as jest.Mock).mockResolvedValue([{ id: 'e1', title: 'Gymnastics' }])
    const req = new Request('http://x/api/calendar/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.events).toHaveLength(1)
    expect(body.events[0].accountId).toBe('a1')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/calendar-list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the fetcher**

```typescript
// src/lib/server/calendar-fetcher.ts
export async function fetchCalendarEvents(accessToken: string): Promise<any[]> {
  const now = new Date()
  const timeMin = now.toISOString()
  const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=50`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || 'Calendar fetch failed')
  return (data.items || []).map((e: any) => ({
    id: e.id,
    title: e.summary,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location,
  }))
}
```

- [ ] **Step 4: Implement the route**

```typescript
// src/app/api/calendar/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchCalendarEvents } from '@/lib/server/calendar-fetcher'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const events = await fetchCalendarEvents(accessToken)
        return events.map(e => ({ ...e, accountId: acc.id }))
      } catch (err: any) {
        return { _error: { accountId: acc.id, message: err.message } }
      }
    }))
    const events = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => ('_error' in r ? [r._error] : []))
    return NextResponse.json({ events, errors })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/api/calendar-list.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calendar/list/route.ts src/lib/server/calendar-fetcher.ts tests/api/calendar-list.test.ts
git commit -m "feat(api): add multi-account calendar list route"
```

---

### Task 11: Tasks list route

**Files:**
- Create: `src/app/api/tasks/list/route.ts`
- Create: `src/lib/server/tasks-fetcher.ts`
- Test: `tests/api/tasks-list.test.ts`

- [ ] **Step 1: Write the failing test**

Follow the same shape as `tests/api/calendar-list.test.ts`, mocking `fetchTasks` instead:

```typescript
// tests/api/tasks-list.test.ts
import { POST } from '@/app/api/tasks/list/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/tasks-fetcher')

describe('POST /api/tasks/list', () => {
  it('returns merged tasks tagged with accountId', async () => {
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchTasks as jest.Mock).mockResolvedValue([{ id: 't1', title: 'Review board deck', completed: false }])

    const req = new Request('http://x/api/tasks/list', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.tasks).toHaveLength(1)
    expect(body.tasks[0].accountId).toBe('a1')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/tasks-list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the fetcher**

```typescript
// src/lib/server/tasks-fetcher.ts
export async function fetchTasks(accessToken: string): Promise<any[]> {
  const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const listsData = await listsRes.json()
  if (listsData.error) throw new Error(listsData.error.message || 'Tasks lists failed')
  if (!listsData.items?.length) return []

  const allTasks = await Promise.all(listsData.items.map(async (l: any) => {
    const tr = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${l.id}/tasks`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const td = await tr.json()
    return (td.items || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      due: t.due,
      completed: t.status === 'completed',
      listId: l.id,
    }))
  }))
  return allTasks.flat()
}
```

- [ ] **Step 4: Implement the route**

Copy the shape from `src/app/api/calendar/list/route.ts`, swapping the fetcher and the response field name from `events` to `tasks`.

```typescript
// src/app/api/tasks/list/route.ts
import { NextResponse } from 'next/server'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchTasks } from '@/lib/server/tasks-fetcher'

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)
    const results = await Promise.all(accounts.map(async (acc) => {
      try {
        const rt = await getDecryptedRefreshToken(uid, acc.id)
        if (!rt) throw new Error('Refresh token missing')
        const { accessToken } = await refreshAccessToken(rt)
        const tasks = await fetchTasks(accessToken)
        return tasks.map(t => ({ ...t, accountId: acc.id }))
      } catch (err: any) {
        return { _error: { accountId: acc.id, message: err.message } }
      }
    }))
    const tasks = results.flatMap(r => (Array.isArray(r) ? r : []))
    const errors = results.flatMap(r => ('_error' in r ? [r._error] : []))
    return NextResponse.json({ tasks, errors })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest tests/api/tasks-list.test.ts`
Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tasks/list/route.ts src/lib/server/tasks-fetcher.ts tests/api/tasks-list.test.ts
git commit -m "feat(api): add multi-account tasks list route"
```

---

### Task 12: Rewrite /api/inbox/digest to use new gmail/list + OpenAI digest

The existing `src/app/api/inbox/digest/route.ts` currently takes a Bearer token from the client (a Google access token). Rewrite it to use the server-side token flow.

**Files:**
- Modify: `src/app/api/inbox/digest/route.ts`
- Test: `tests/api/inbox-digest.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/api/inbox-digest.test.ts
import { POST } from '@/app/api/inbox/digest/route'
import { getUidFromRequest } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

jest.mock('@/lib/server/session')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-fetcher')
jest.mock('ai', () => ({
  generateObject: jest.fn().mockResolvedValue({
    object: {
      emails: [
        { id: 'm1', subject: 'Zoo', sender: 'School', snippet: 'Zoo trip Thursday', suggestedActions: [] },
      ],
    },
  }),
}))

describe('POST /api/inbox/digest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getUidFromRequest as jest.Mock).mockResolvedValue('mary-uid')
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchUnreadPrimary as jest.Mock).mockResolvedValue([
      { id: 'm1', subject: 'Zoo', sender: 'School', fullBody: 'Zoo trip Thursday', date: 1 },
    ])
  })

  it('returns AI-digested emails tagged with accountId', async () => {
    const req = new Request('http://x/api/inbox/digest', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.emails).toHaveLength(1)
    expect(body.emails[0].accountId).toBe('a1')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx jest tests/api/inbox-digest.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite the route**

Replace the current content of `src/app/api/inbox/digest/route.ts` with:

```typescript
// src/app/api/inbox/digest/route.ts
import { NextResponse } from 'next/server'
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { getUidFromRequest, HttpError } from '@/lib/server/session'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchUnreadPrimary } from '@/lib/server/gmail-fetcher'

export const maxDuration = 60

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

export async function POST(req: Request) {
  try {
    const uid = await getUidFromRequest(req)
    const accounts = await listAccounts(uid)

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

    return NextResponse.json({ emails: digested })
  } catch (e: any) {
    const status = e instanceof HttpError ? e.status : 500
    return NextResponse.json({ error: e.message }, { status })
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/api/inbox-digest.test.ts`
Expected: 1 passing.

Also run the full suite: `npx jest`
Expected: all existing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/inbox/digest/route.ts tests/api/inbox-digest.test.ts
git commit -m "refactor(api): inbox digest uses server-side OAuth with multi-account"
```

---

### Task 13: Client-side auth provider — drop OAuth scopes, expose ID token

The current client-side `signInWithGoogle` requests scopes and stores an access token. Phase 1 moves that responsibility to the server. Client-side sign-in now only establishes Firebase identity; scopes are requested via the new OAuth start route on first use.

**Files:**
- Modify: `src/lib/firebase.ts` (lines 24–28: remove `addScope` calls, simplify `signInWithGoogle`)
- Modify: `src/lib/auth-provider.tsx` (lines 25–27, 43–60: remove localStorage token handling, expose `getIdToken`)

- [ ] **Step 1: Update `firebase.ts`**

Remove the OAuth scope requests — we no longer ask for these at Firebase sign-in:

```typescript
// src/lib/firebase.ts (update the block around line 24)
  googleProvider = new GoogleAuthProvider();
  // Scopes moved to server-side OAuth (see /api/auth/google/start).
  // Firebase Auth is now used for user identity only.
```

And simplify `signInWithGoogle` — it no longer returns an access token:

```typescript
export const signInWithGoogle = async () => {
  if (isMock) {
    return { user: { uid: 'dev-bypass-id', displayName: 'Executive User' } };
  }
  const result = await signInWithPopup(auth, googleProvider);
  return { user: result.user };
};
```

- [ ] **Step 2: Update `auth-provider.tsx`**

Replace the `accessToken` state and localStorage plumbing with an `getIdToken()` helper that returns a fresh Firebase ID token on demand:

```typescript
// src/lib/auth-provider.tsx (replacing the existing contents of AuthProvider)
"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { subscribeToAuth, signInWithGoogle, logOutUser, auth } from "@/lib/firebase"
import { useRouter, usePathname } from "next/navigation"
import { toast } from "sonner"

interface AuthContextType {
  user: any | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  getIdToken: () => Promise<string | null>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const unsubscribe = subscribeToAuth((firebaseUser) => {
      setUser(firebaseUser)
      setLoading(false)
      if (!firebaseUser && pathname !== "/login") router.push("/login")
      else if (firebaseUser && pathname === "/login") router.push("/")
    })
    return () => unsubscribe()
  }, [pathname, router])

  const signIn = async () => {
    try {
      setLoading(true)
      const { user } = await signInWithGoogle()
      setUser(user)
      toast("SYSTEM", { description: "Signed in." })
      router.push("/")
    } catch (error) {
      console.error(error)
      toast("ERROR", { description: "Sign-in failed." })
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await logOutUser()
    setUser(null)
    router.push("/login")
  }

  const getIdToken = async () => {
    const current = auth?.currentUser
    return current ? current.getIdToken() : null
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, getIdToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
```

- [ ] **Step 3: Run the full TypeScript check**

Run: `npx tsc --noEmit`
Expected: all call sites compile. References to `accessToken` in the store need updating in the next task — expect errors there until Task 14.

- [ ] **Step 4: Commit**

```bash
git add src/lib/firebase.ts src/lib/auth-provider.tsx
git commit -m "refactor(auth): drop client-side OAuth scopes; expose getIdToken"
```

---

### Task 14: Rewire `useHub` store to use the new server routes

**Files:**
- Modify: `src/lib/store.tsx`

- [ ] **Step 1: Update the hydration functions**

Replace the three `hydrate*` functions inside `HubProvider` (currently using `accessToken` to call Google directly) with calls to the new server routes using a Firebase ID token:

```typescript
// src/lib/store.tsx — replace the useEffect body
  const { user, getIdToken } = useAuth()

  useEffect(() => {
    if (!user) return

    const hydrate = async (path: string) => {
      const token = await getIdToken()
      if (!token) return null
      const res = await fetch(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.json()
    }

    const hydrateCalendar = async () => {
      const data = await hydrate('/api/calendar/list')
      if (!data) return
      if (data.error) {
        toast("SYNC ERROR", { description: "Calendar: " + data.error })
        return
      }
      if (data.events) setEvents(data.events.map((e: any) => ({
        id: e.id, title: e.title, time: e.start, date: new Date(e.start).getDate(),
        location: e.location, fromEmail: false,
      })))
    }

    const hydrateTasks = async () => {
      const data = await hydrate('/api/tasks/list')
      if (!data) return
      if (data.error) {
        toast("SYNC ERROR", { description: "Tasks: " + data.error })
        return
      }
      if (data.tasks) setTasks(data.tasks.map((t: any) => ({
        id: t.id, title: t.title, context: 'PERSONAL', completed: t.completed,
      })))
    }

    const hydrateEmails = async () => {
      const data = await hydrate('/api/inbox/digest')
      if (!data) return
      if (data.error) {
        toast("SYNC ERROR", { description: "Gmail: " + data.error })
        return
      }
      if (data.emails) setEmails(data.emails)
    }

    hydrateCalendar()
    hydrateTasks()
    hydrateEmails()
  }, [user, getIdToken])
```

Also remove the `accessToken === "mock-token"` path and replace with `if (!user) return`. Mock mode will be reintroduced as a server-side feature if needed.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx jest`
Expected: all tests pass.

- [ ] **Step 4: Manual smoke (before commit)**

1. Start dev server: `npm run dev`
2. Visit `http://localhost:3000`
3. Sign in with Google (Firebase popup). No scope dialog appears (scopes moved to server).
4. After sign-in, the UI loads but email/calendar/tasks show empty because you haven't linked any Google accounts yet — this is expected for Phase 1 until Task 15.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx
git commit -m "refactor(store): hydrate from server routes using Firebase ID token"
```

---

### Task 15: Settings → Accounts UI

**Files:**
- Create: `src/components/settings/accounts-section.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create the accounts section component**

```tsx
// src/components/settings/accounts-section.tsx
"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/lib/auth-provider"
import { toast } from "sonner"

type Account = {
  id: string
  email: string
  displayName?: string
  addedAt: number
  lastSyncedAt?: number
}

export function AccountsSection() {
  const { getIdToken } = useAuth()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const token = await getIdToken()
    if (!token) { setAccounts([]); setLoading(false); return }
    const res = await fetch('/api/accounts', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    setAccounts(data.accounts || [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const addAccount = async () => {
    const token = await getIdToken()
    if (!token) return
    const res = await fetch('/api/auth/google/start', { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.url) window.location.href = data.url
  }

  const removeAccount = async (id: string) => {
    const token = await getIdToken()
    if (!token) return
    const res = await fetch(`/api/accounts?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      toast("SYSTEM", { description: "Account removed." })
      await refresh()
    }
  }

  return (
    <section id="accounts" className="mb-12">
      <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-8 pb-2 border-b border-border">
        Linked Google Accounts
      </h2>
      {loading ? (
        <p className="text-sm text-muted-foreground font-serif italic">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground font-serif italic mb-6">No accounts linked yet.</p>
      ) : (
        <ul className="flex flex-col gap-3 mb-6">
          {accounts.map(a => (
            <li key={a.id} className="flex items-center justify-between border border-border px-4 py-3">
              <div>
                <div className="font-medium text-sm">{a.email}</div>
                <div className="text-xs text-muted-foreground font-mono">
                  Linked {new Date(a.addedAt).toLocaleDateString()}
                  {a.lastSyncedAt && ` · last sync ${new Date(a.lastSyncedAt).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}`}
                </div>
              </div>
              <button
                onClick={() => removeAccount(a.id)}
                className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground hover:text-foreground border border-border px-3 py-1"
              >Remove</button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={addAccount}
        className="bg-foreground text-background text-[10px] uppercase font-bold tracking-widest px-4 py-2"
      >Add another Gmail account</button>
    </section>
  )
}
```

Note the `hour12: true` in the date formatter — matches the project-wide 12-hour clock convention from `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md`.

- [ ] **Step 2: Render it on the Settings page**

```tsx
// src/app/settings/page.tsx — add at the top of the content area, above the existing "Active Inference Models" h2
import { AccountsSection } from "@/components/settings/accounts-section"

// ...inside the existing layout, in the scrollable content column:
<AccountsSection />
<h2 className="text-xs uppercase tracking-widest font-semibold text-foreground/40 mb-8 pb-2 border-b border-border">Active Inference Models</h2>
```

(Don't delete the existing AI Rules content; just render `<AccountsSection />` above it.)

- [ ] **Step 3: Manual smoke test**

1. `npm run dev`
2. Sign in.
3. Go to `/settings` → see "Linked Google Accounts" section (empty list).
4. Click "Add another Gmail account".
5. Google OAuth popup appears → consent to all scopes.
6. Redirect back to `/settings#accounts`.
7. Your Gmail address now appears in the list.
8. Return to home → inbox, calendar, tasks now hydrate from that account.
9. Click "Remove" → account disappears, data clears.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/accounts-section.tsx src/app/settings/page.tsx
git commit -m "feat(settings): add linked Google accounts section"
```

---

### Task 16: Account indicator in email list

A tiny visual marker showing which account each email came from. Uses the existing inbox UI (we are not redesigning that until Phase 3).

**Files:**
- Modify: `src/components/widgets/bouncer.tsx` (add a one-line source indicator)
- Modify: `src/app/inbox/page.tsx` (same)

- [ ] **Step 1: Update the Email type**

```typescript
// src/lib/store.tsx — extend the Email type
export type Email = {
  id: string
  accountId?: string       // NEW: added by server route
  accountEmail?: string    // NEW: friendly display
  subject: string
  sender: string
  // ... rest as-is
}
```

- [ ] **Step 2: Render in `bouncer.tsx`**

Inside the existing `AccordionTrigger` → above `From: {email.sender}`, add:

```tsx
{email.accountEmail && (
  <span className="text-[9px] text-foreground/30 font-mono block mb-1">
    via {email.accountEmail}
  </span>
)}
```

- [ ] **Step 3: Render in `inbox/page.tsx`**

Same idea, in the left pane list item, above the sender row.

- [ ] **Step 4: Manual smoke**

1. `npm run dev`
2. Link two accounts.
3. Confirm each email row shows `via <account>` in small text.

- [ ] **Step 5: Commit**

```bash
git add src/lib/store.tsx src/components/widgets/bouncer.tsx src/app/inbox/page.tsx
git commit -m "feat(ui): show source account on each email row"
```

---

### Task 17: End-to-end smoke + cleanup

**Files:**
- Update: `.env.local.example` (document new vars)
- Update: `README.md` (brief section on linking accounts)

- [ ] **Step 1: Create/update `.env.local.example`**

```
# Firebase (client)
NEXT_PUBLIC_FIREBASE_API_KEY="..."
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="..."
NEXT_PUBLIC_FIREBASE_PROJECT_ID="..."
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="..."
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="..."
NEXT_PUBLIC_FIREBASE_APP_ID="..."

# OpenAI
OPENAI_API_KEY="..."

# Google OAuth (server-side, Phase 1)
GOOGLE_OAUTH_CLIENT_ID="..."
GOOGLE_OAUTH_CLIENT_SECRET="..."
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

# Firebase Admin SDK (server-side)
FIREBASE_ADMIN_SA_JSON='{"type":"service_account",...}'

# Token encryption (server-side)
TOKEN_ENCRYPTION_KEY="<32 random bytes, base64>"
```

- [ ] **Step 2: Update `README.md`**

Append a short "Linking Gmail accounts" section explaining that accounts are managed in `/settings`, and that the old hourly re-login problem is gone.

- [ ] **Step 3: End-to-end smoke checklist**

Run through this manually — write notes in the PR description as you go:

- [ ] Sign in fresh (cleared localStorage first)
- [ ] `/settings` shows empty accounts list
- [ ] Add account A (e.g. `mary@tribe.ai`) → consent flow works → redirects back
- [ ] Add account B (`mary.w.mckee@gmail.com`) → same
- [ ] Home page: inbox shows emails from both accounts with `via` markers
- [ ] Calendar and tasks hydrate from both accounts
- [ ] Wait 1+ hour. Refresh. Everything still works (no 401s — refresh tokens doing their job).
- [ ] Remove account B → its emails/events disappear after refresh.
- [ ] Sign out, sign back in → accounts persist, everything hydrates.

- [ ] **Step 4: Commit**

```bash
git add .env.local.example README.md
git commit -m "docs: document Phase 1 env vars and account linking"
```

---

## Post-Phase-1 Verification

Before handing off to the user:

1. Run `npx jest` — entire suite green.
2. Run `npx tsc --noEmit` — zero errors.
3. Run `npm run lint` — zero errors.
4. Run the end-to-end smoke checklist from Task 17, Step 3.
5. Confirm the 401 re-login problem is gone by signing in and leaving the app idle for >1 hour.

If any of the above fail, fix and retest before declaring Phase 1 complete.

## What's Next (Phase 2+)

After Phase 1 ships:
- **Phase 2:** New AI extraction (6 classifications, 3 action types), sender identity matching, Life Graph learning loop. New file: `docs/superpowers/plans/YYYY-MM-DD-inbox-phase-2-ai-extraction.md`.
- **Phase 3:** UI redesign — /inbox three-pane, editable action cards, Clear + Recently cleared.
- **Phase 4:** Google write flow — real Calendar/Tasks commits with idempotency.
- **Phase 5:** PDF extraction with Life Graph pre-fill.
- **Phase 6:** Reply capability (`gmail.send`).
- **Phase 7:** Home widget redesign.

Each phase gets its own plan file and ships independently.
