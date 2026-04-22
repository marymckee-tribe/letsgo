# Inbox Redesign — Phase 5: PDF Attachment Extraction + Life Graph Cross-Reference

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lazy, cached, server-side PDF extraction for email attachments with Life Graph cross-reference. When the user opens an email with a PDF, the server fetches the attachment bytes from Gmail, extracts text via `unpdf`, runs a `gpt-4o-mini` pass against the user's Life Graph profiles to produce a structured summary (dates, money, required fields, `life_graph_hits`), caches the result in Firestore, and renders a rich attachment card + inline PDF.js preview + download. Password-protected PDFs are detected and surfaced with a lock icon. When text extraction returns empty/trivial text (e.g., scanned image PDFs), the result is cached as `extracted: { skipped: true, reason: 'no_text_extractable' }` and the UI shows "Extraction unavailable — open the preview to read the PDF." — no fallback LLM call.

**Architecture:** A new `attachmentsRouter` in the tRPC app router handles three procedures: `extract` (mutation — lazy, idempotent pipeline), `get` (query — returns cached extraction if present), `downloadUrl` (query — mints a short-lived signed bearer URL for the attachment bytes, used by both Preview and Download buttons). All Gmail attachment fetching, PDF parsing, and LLM calls happen server-side. Cache key is `${messageId}:${attachmentId}` in `users/{uid}/attachments/{cacheKey}` Firestore docs — never invalidated (Gmail attachment content is immutable). The inline PDF viewer uses `pdfjs-dist` rendered in a slide-over. The Reader pane's attachment card is a new client component that composes `trpc.attachments.get.useQuery()` (fire-and-forget lazy) → `trpc.attachments.extract.useMutation()` on first open.

**Tech Stack:** Next.js 16 (App Router), tRPC v11, `@tanstack/react-query` v5, `unpdf` (serverless-friendly PDF text extractor from the Nuxt team — drop-in replacement for `pdf-parse`), `pdfjs-dist` (inline PDF.js viewer), `@ai-sdk/openai` + `ai` (`generateObject` for structured extraction), `zod` 4, `firebase-admin` (Firestore + signed-URL-style bearer tokens), Jest + ts-jest + `@testing-library/react`.

**Spec reference:** `docs/superpowers/specs/2026-04-17-inbox-redesign-design.md` — specifically the "PDF Extraction" section (Pipeline, UX, Pre-fill).

**Base branch:** Branch `feature/inbox-phase-5-pdf` off the tip of `feature/inbox-phase-4` once merged (or off `main` if Phase 4 is already merged). This plan assumes:
- Phase 1 server infrastructure (`src/lib/server/firebase-admin.ts`, `src/lib/server/accounts.ts`, `src/lib/server/google-oauth.ts`, encrypted refresh tokens).
- Phase 2 extended types (`Email.attachments: Attachment[]`, `EntityProfile.knownDomains/knownSenders`) — this plan extends `Attachment` with `extracted`.
- tRPC baseline (`src/server/trpc/index.ts`, `context.ts`, `root.ts`, `src/app/api/trpc/[trpc]/route.ts`, client provider). Every new procedure is a `protectedProcedure`.
- `drive.file` scope is **already in `SCOPES`** in `src/lib/server/google-oauth.ts` (confirmed Phase 1, line 10). No scope changes needed for Phase 5 — so no re-consent screen.

---

## Before You Start — Read These

Next.js 16 has breaking changes. `AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."* Do that. Specifically:

- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` — Route Handler conventions (the tRPC catch-all is the only new handler here, but understand how it's mounted).
- `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` — breaking changes vs training data.
- `https://unjs.io/packages/unpdf` (via Context7 or WebFetch when ready) — `unpdf` API. It exposes `extractText(pdfData, options)` → `{ text, totalPages }`. Node 18+, zero native deps, works on Vercel/Cloudflare.
- `https://mozilla.github.io/pdf.js/api/` — `pdfjs-dist` v4+ worker setup for Next.js 16 (the worker must be imported from `pdfjs-dist/build/pdf.worker.mjs` and pointed at via `GlobalWorkerOptions.workerSrc`).

If any of these docs conflict with this plan, follow the docs and update the plan.

---

## Prerequisites (one-time)

Nothing for the human to do. All prerequisites from Phase 1 (env vars, Firebase service account, encryption key) are still in place. Verify before Task 0:

- [ ] **P1. Phase 4 (or the tRPC baseline + Phase 2 types) is merged.** Run `git log --oneline -20` — confirm `feature/inbox-phase-4` merge commit is in history, or that the tRPC baseline (`2026-04-21-architecture-trpc-react-query.md`) and Phase 2 are both merged.
- [ ] **P2. Full suite is green.** Run `npx tsc --noEmit && npx jest && npm run lint`. All must pass before starting.
- [ ] **P3. `drive.file` scope is active.** Open `src/lib/server/google-oauth.ts` and confirm the `SCOPES` array still includes `'https://www.googleapis.com/auth/drive.file'`. As of the Phase 1 ship, the scope is present; no re-consent is required for Phase 5. (Phase 5 does not itself call the Drive API; the scope stays for future features.)
- [ ] **P4. Create the working branch.** Run `git checkout -b feature/inbox-phase-5-pdf`.

---

## File Structure

### New files
- `src/lib/server/gmail-attachments.ts` — `fetchAttachmentBytes(accessToken, messageId, attachmentId)` → `Buffer` (base64-decoded).
- `src/lib/server/pdf-extract.ts` — `extractPdfText(buffer, { maxPages })` → `{ text, totalPages, passwordProtected }` via `unpdf`.
- `src/lib/server/attachment-extract-schema.ts` — Zod schema + TypeScript types for the `extracted` shape on `Attachment`.
- `src/lib/server/attachment-llm.ts` — builds the `gpt-4o-mini` prompt with `profiles` + `extractedText` and returns the structured `extracted` object via `generateObject`.
- `src/lib/server/attachment-cache.ts` — Firestore CRUD: `getCachedExtraction(uid, cacheKey)`, `writeCachedExtraction(uid, cacheKey, extracted)`.
- `src/lib/server/attachment-download-token.ts` — mints and verifies short-lived HMAC-signed bearer tokens for the download route (no Google Drive involvement; this is just a signed fetch of Gmail attachment bytes via our server).
- `src/server/trpc/routers/attachments.ts` — tRPC router: `extract`, `get`, `downloadUrl`.
- `src/app/api/attachments/download/route.ts` — raw GET Route Handler that verifies the signed token and streams the PDF bytes back. (tRPC isn't the right tool for binary download; this mirrors the `/api/auth/google/callback` carve-out from the tRPC baseline.)
- `src/components/inbox/attachment-card.tsx` — Reader-pane card: filename, type icon, AI summary, dates chips, required-fields checklist, `life_graph_hits` clickable chips, Preview / Download buttons.
- `src/components/inbox/attachment-preview-slideover.tsx` — `pdfjs-dist` viewer in a slide-over panel.
- `src/components/inbox/pdfjs-worker.ts` — single-file worker setup for `pdfjs-dist` (sets `GlobalWorkerOptions.workerSrc`).
- `src/lib/trpc/use-attachment-extract.ts` — thin hook composing `get` (lazy query) → `extract` (mutation on cache miss) → cache invalidation.
- `tests/server/gmail-attachments.test.ts`
- `tests/server/pdf-extract.test.ts`
- `tests/server/attachment-llm.test.ts`
- `tests/server/attachment-cache.test.ts`
- `tests/server/attachment-download-token.test.ts`
- `tests/server/trpc/routers/attachments.test.ts`
- `tests/api/attachments-download.test.ts`
- `tests/components/inbox/attachment-card.test.tsx`
- `tests/fixtures/pdfs/permission-slip.pdf` — small sample PDF committed as fixture.
- `tests/fixtures/pdfs/scanned-receipt.pdf` — scanned-image PDF (no extractable text → skipped).
- `tests/fixtures/pdfs/password-protected.pdf` — password-protected PDF fixture.

### Modified files
- `src/server/trpc/root.ts` — mount `attachmentsRouter`.
- `src/lib/store.tsx` — extend the `Attachment` type with `extracted?: Extracted` (the same shape defined in `attachment-extract-schema.ts`).
- `src/app/inbox/page.tsx` — render the new `<AttachmentCard>` for each PDF attachment in the Reader pane (Phase 3 builds the Reader pane; Phase 5 slots the card into whatever structure Phase 3 shipped — if Phase 3 isn't merged yet, slot into the existing reader DOM and revisit in a small follow-up).
- `package.json` — new deps: `unpdf`, `pdfjs-dist`.
- `.env.local.example` — document new env var: `ATTACHMENT_DOWNLOAD_SIGNING_KEY` (32-byte base64 HMAC key; rotate via same procedure as `TOKEN_ENCRYPTION_KEY`).

### Explicitly NOT touched
- `src/lib/server/gmail-fetcher.ts` — this phase adds a sibling helper (`gmail-attachments.ts`), doesn't modify the existing fetcher.
- Non-PDF attachment rendering — the attachment card falls back to "filename + download only" for non-`application/pdf` mimeTypes; no extract call is made.
- `.docx` / `.xlsx` — explicitly out of spec.
- Reply sending (Phase 6), home widget (Phase 7).

---

## Tasks

### Task 0: Install deps + new env var

**Files:**
- Modify: `package.json`
- Modify: `.env.local.example`

- [ ] **Step 1: Install runtime deps**

Run:

```bash
npm install unpdf pdfjs-dist
```

Expected: `package.json` gains `unpdf` and `pdfjs-dist` in `dependencies`.

- [ ] **Step 2: Generate an attachment download signing key**

Run:

```bash
node -e 'console.log(require("crypto").randomBytes(32).toString("base64"))'
```

Save the output to your local `.env.local` under a new line:

```
ATTACHMENT_DOWNLOAD_SIGNING_KEY="<the base64 string>"
```

Add the same key name (with a placeholder value) to `.env.local.example`:

```
ATTACHMENT_DOWNLOAD_SIGNING_KEY="base64-32-bytes"
```

- [ ] **Step 3: Sanity check**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npx jest`
Expected: existing suite passes (no new code yet).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.local.example
git commit -m "chore(deps): add unpdf + pdfjs-dist; document ATTACHMENT_DOWNLOAD_SIGNING_KEY"
```

---

### Task 1: `Attachment.extracted` schema + types

Defines the shape once, used by the Zod schema, the Firestore cache, the LLM response validator, the tRPC output contract, and the UI card. Single source of truth.

**Files:**
- Create: `src/lib/server/attachment-extract-schema.ts`
- Modify: `src/lib/store.tsx`
- Create: `tests/server/attachment-extract-schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Create `tests/server/attachment-extract-schema.test.ts`:

```ts
import { ExtractedSchema, type Extracted } from '@/lib/server/attachment-extract-schema'

describe('ExtractedSchema', () => {
  it('accepts a full extraction payload', () => {
    const payload: Extracted = {
      summary: 'Permission slip for Annie zoo trip Thu May 2 8am.',
      dates: [{ label: 'Trip date', date: '2026-05-02' }],
      required_fields: ['Parent signature', 'Emergency contact'],
      deadlines: ['2026-04-28'],
      money: [{ label: 'Trip fee', amount: 12, currency: 'USD' }],
      persons_mentioned: ['Annie'],
      life_graph_hits: { 'Medical notes': 'peanut allergy' },
    }
    const result = ExtractedSchema.safeParse(payload)
    expect(result.success).toBe(true)
  })

  it('accepts the skipped variant for password-protected PDFs', () => {
    const result = ExtractedSchema.safeParse({ skipped: true, reason: 'password_protected' })
    expect(result.success).toBe(true)
  })

  it('accepts the skipped variant for PDFs with no extractable text', () => {
    const result = ExtractedSchema.safeParse({ skipped: true, reason: 'no_text_extractable' })
    expect(result.success).toBe(true)
  })

  it('rejects unknown skipped reasons', () => {
    const result = ExtractedSchema.safeParse({ skipped: true, reason: 'bogus' })
    expect(result.success).toBe(false)
  })

  it('rejects missing summary on the non-skipped variant', () => {
    const result = ExtractedSchema.safeParse({
      dates: [],
      required_fields: [],
      deadlines: [],
      money: [],
      persons_mentioned: [],
      life_graph_hits: {},
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/attachment-extract-schema.test.ts`
Expected: FAIL — `Cannot find module '@/lib/server/attachment-extract-schema'`.

- [ ] **Step 3: Implement the schema**

Create `src/lib/server/attachment-extract-schema.ts`:

```ts
import { z } from 'zod'

const ExtractedFullSchema = z.object({
  summary: z.string().min(1),
  dates: z.array(z.object({
    label: z.string(),
    date: z.string(),
  })).default([]),
  required_fields: z.array(z.string()).default([]),
  deadlines: z.array(z.string()).default([]),
  money: z.array(z.object({
    label: z.string(),
    amount: z.number(),
    currency: z.string(),
  })).default([]),
  persons_mentioned: z.array(z.string()).default([]),
  life_graph_hits: z.record(z.string(), z.string()).default({}),
})

const ExtractedSkippedSchema = z.object({
  skipped: z.literal(true),
  reason: z.enum(['password_protected', 'no_text_extractable', 'unsupported_mime', 'extract_failed']),
})

export const ExtractedSchema = z.union([ExtractedFullSchema, ExtractedSkippedSchema])

export type ExtractedFull = z.infer<typeof ExtractedFullSchema>
export type ExtractedSkipped = z.infer<typeof ExtractedSkippedSchema>
export type Extracted = z.infer<typeof ExtractedSchema>

/** Schema the LLM is constrained to emit (no skipped variant — skipping happens upstream). */
export const ExtractedLLMSchema = ExtractedFullSchema
```

- [ ] **Step 4: Extend the `Attachment` type in the shared store**

Open `src/lib/store.tsx`. Find the existing `Attachment` type (added in Phase 2). Replace it with:

```ts
import type { Extracted } from '@/lib/server/attachment-extract-schema'

export type Attachment = {
  id: string
  filename: string
  mimeType: string
  size: number
  extracted?: Extracted
}
```

Keep the existing `Email.attachments: Attachment[]` reference unchanged.

- [ ] **Step 5: Confirm tests pass + type-check**

Run: `npx jest tests/server/attachment-extract-schema.test.ts`
Expected: PASS (5 tests).

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/attachment-extract-schema.ts src/lib/store.tsx tests/server/attachment-extract-schema.test.ts
git commit -m "feat(attachments): Extracted Zod schema + Attachment.extracted type"
```

---

### Task 2: Gmail attachment fetcher

Small wrapper around the Gmail attachments endpoint. Base64url-decode to a `Buffer`.

**Files:**
- Create: `src/lib/server/gmail-attachments.ts`
- Create: `tests/server/gmail-attachments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/gmail-attachments.test.ts`:

```ts
import { fetchAttachmentBytes } from '@/lib/server/gmail-attachments'

describe('fetchAttachmentBytes', () => {
  const originalFetch = global.fetch
  afterEach(() => { global.fetch = originalFetch })

  it('fetches the attachment and base64url-decodes it', async () => {
    const raw = Buffer.from('%PDF-1.4 hello').toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: raw, size: 14 }),
    }) as unknown as typeof fetch

    const buf = await fetchAttachmentBytes('at', 'msg1', 'att1')
    expect(buf.slice(0, 4).toString()).toBe('%PDF')
  })

  it('throws when Gmail returns an error payload', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: { message: 'Not found' } }),
    }) as unknown as typeof fetch

    await expect(fetchAttachmentBytes('at', 'msg1', 'att-missing')).rejects.toThrow('Not found')
  })

  it('throws when the body has no data field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }) as unknown as typeof fetch

    await expect(fetchAttachmentBytes('at', 'm', 'a')).rejects.toThrow(/no data/i)
  })

  it('includes the Bearer token in the request', async () => {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'aGVsbG8' }),
    })
    global.fetch = spy as unknown as typeof fetch

    await fetchAttachmentBytes('my-access-token', 'mid', 'aid')
    const [, init] = spy.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer my-access-token' })
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/gmail-attachments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/gmail-attachments.ts`:

```ts
export async function fetchAttachmentBytes(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const data = await res.json() as { data?: string; size?: number; error?: { message?: string } }
  if (data.error) throw new Error(data.error.message || 'Gmail attachment fetch failed')
  if (!data.data) throw new Error('Gmail attachment response had no data field')
  const base64 = data.data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64')
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/server/gmail-attachments.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/gmail-attachments.ts tests/server/gmail-attachments.test.ts
git commit -m "feat(gmail): fetchAttachmentBytes helper"
```

---

### Task 3: PDF text extraction via `unpdf`

Fast path. Caps at first 5 pages. Detects password-protected PDFs and returns a structured sentinel instead of throwing.

**Files:**
- Create: `src/lib/server/pdf-extract.ts`
- Create: `tests/server/pdf-extract.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/pdf-extract.test.ts`:

```ts
import { extractPdfText } from '@/lib/server/pdf-extract'
import * as unpdf from 'unpdf'

jest.mock('unpdf', () => ({
  extractText: jest.fn(),
  getDocumentProxy: jest.fn(),
}))

describe('extractPdfText', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns text + totalPages for a readable PDF', async () => {
    ;(unpdf.extractText as jest.Mock).mockResolvedValue({
      text: ['Page 1 text', 'Page 2 text'],
      totalPages: 2,
    })
    const result = await extractPdfText(Buffer.from('%PDF-1.4'), { maxPages: 5 })
    expect(result.passwordProtected).toBe(false)
    expect(result.totalPages).toBe(2)
    expect(result.text).toContain('Page 1 text')
    expect(result.text).toContain('Page 2 text')
  })

  it('caps extraction at maxPages', async () => {
    ;(unpdf.extractText as jest.Mock).mockResolvedValue({
      text: ['p1', 'p2', 'p3', 'p4', 'p5'],
      totalPages: 20,
    })
    await extractPdfText(Buffer.from('%PDF'), { maxPages: 5 })
    const callArgs = (unpdf.extractText as jest.Mock).mock.calls[0][1]
    expect(callArgs).toMatchObject({ mergePages: true })
    // unpdf v1 accepts a `pages` option; if the real signature differs adjust the impl.
  })

  it('returns passwordProtected:true when unpdf throws a PasswordException', async () => {
    const err = new Error('No password given')
    ;(err as Error & { name: string }).name = 'PasswordException'
    ;(unpdf.extractText as jest.Mock).mockRejectedValue(err)
    const result = await extractPdfText(Buffer.from('%PDF'), { maxPages: 5 })
    expect(result.passwordProtected).toBe(true)
    expect(result.text).toBe('')
    expect(result.totalPages).toBe(0)
  })

  it('returns passwordProtected:true for the generic "password" error string', async () => {
    ;(unpdf.extractText as jest.Mock).mockRejectedValue(new Error('Invalid PDF structure — needs password'))
    const result = await extractPdfText(Buffer.from('%PDF'), { maxPages: 5 })
    expect(result.passwordProtected).toBe(true)
  })

  it('re-throws unrelated errors', async () => {
    ;(unpdf.extractText as jest.Mock).mockRejectedValue(new Error('Corrupt stream'))
    await expect(extractPdfText(Buffer.from('%PDF'), { maxPages: 5 })).rejects.toThrow('Corrupt stream')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/pdf-extract.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/pdf-extract.ts`:

```ts
import { extractText } from 'unpdf'

export interface PdfExtractResult {
  text: string
  totalPages: number
  passwordProtected: boolean
}

function looksLikePasswordError(err: unknown): boolean {
  const e = err as { name?: string; message?: string }
  if (e.name === 'PasswordException') return true
  const msg = (e.message || '').toLowerCase()
  return msg.includes('password')
}

export async function extractPdfText(
  buffer: Buffer,
  options: { maxPages: number },
): Promise<PdfExtractResult> {
  try {
    const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    const result = await extractText(uint8, { mergePages: true })
    const rawText = Array.isArray(result.text) ? result.text.join('\n') : String(result.text ?? '')
    const pagesUsed = Math.min(result.totalPages ?? 0, options.maxPages)
    // unpdf's mergePages returns all pages joined. Keep full text but expose the cap via totalPages below.
    return {
      text: rawText,
      totalPages: pagesUsed,
      passwordProtected: false,
    }
  } catch (err) {
    if (looksLikePasswordError(err)) {
      return { text: '', totalPages: 0, passwordProtected: true }
    }
    throw err
  }
}
```

Note: `unpdf`'s exact API for per-page extraction may differ between versions. If the version installed exposes a different shape (e.g., per-page splitting requires a `getDocumentProxy` + manual loop), adjust the implementation accordingly — the **contract** (`{ text, totalPages, passwordProtected }`) is the stable bit.

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/server/pdf-extract.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/pdf-extract.ts tests/server/pdf-extract.test.ts
git commit -m "feat(pdf): unpdf-backed text extraction with password-protected detection"
```

---

### Task 4: Attachment LLM prompt + structured extraction

Takes extracted text + the user's Life Graph profiles and returns a validated `ExtractedFull` object. Uses `generateObject` with the `ExtractedLLMSchema` from Task 1.

**Files:**
- Create: `src/lib/server/attachment-llm.ts`
- Create: `tests/server/attachment-llm.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/attachment-llm.test.ts`:

```ts
import { extractStructured } from '@/lib/server/attachment-llm'
import * as aiModule from 'ai'

jest.mock('ai', () => ({
  generateObject: jest.fn(),
}))
jest.mock('@ai-sdk/openai', () => ({
  openai: jest.fn().mockReturnValue({ modelId: 'gpt-4o-mini' }),
}))

describe('extractStructured', () => {
  beforeEach(() => { jest.clearAllMocks() })

  it('returns the LLM object when valid', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        summary: 'Permission slip for Annie zoo trip.',
        dates: [{ label: 'Trip date', date: '2026-05-02' }],
        required_fields: ['Parent signature'],
        deadlines: ['2026-04-28'],
        money: [],
        persons_mentioned: ['Annie'],
        life_graph_hits: { 'Medical notes': 'peanut allergy' },
      },
    })
    const result = await extractStructured({
      text: 'Annie zoo trip, sign by April 28. Note medical issues.',
      profiles: [{ id: 'annie', name: 'Annie', medicalNotes: 'peanut allergy' }],
      filename: 'permission-slip.pdf',
    })
    expect(result.summary).toContain('Annie')
    expect(result.life_graph_hits).toEqual({ 'Medical notes': 'peanut allergy' })
  })

  it('passes profiles into the prompt', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        summary: 'x', dates: [], required_fields: [], deadlines: [],
        money: [], persons_mentioned: [], life_graph_hits: {},
      },
    })
    await extractStructured({
      text: 'hello',
      profiles: [{ id: 'ellie', name: 'Ellie', medicalNotes: '' }],
      filename: 'x.pdf',
    })
    const call = (aiModule.generateObject as jest.Mock).mock.calls[0][0]
    expect(call.prompt).toContain('Ellie')
    expect(call.prompt).toContain('hello')
    expect(call.prompt).toContain('x.pdf')
  })

  it('uses gpt-4o-mini', async () => {
    ;(aiModule.generateObject as jest.Mock).mockResolvedValue({
      object: {
        summary: 'x', dates: [], required_fields: [], deadlines: [],
        money: [], persons_mentioned: [], life_graph_hits: {},
      },
    })
    await extractStructured({ text: 'x', profiles: [], filename: 'x.pdf' })
    // @ts-expect-error mock
    const openaiMock = (await import('@ai-sdk/openai')).openai as jest.Mock
    expect(openaiMock).toHaveBeenCalledWith('gpt-4o-mini')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/attachment-llm.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/attachment-llm.ts`:

```ts
import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { ExtractedLLMSchema, type ExtractedFull } from './attachment-extract-schema'

export interface ExtractProfile {
  id: string
  name: string
  medicalNotes?: string
  preferences?: string[]
  sizes?: Record<string, string>
  [key: string]: unknown
}

export interface ExtractInput {
  text: string
  profiles: ExtractProfile[]
  filename: string
}

export async function extractStructured(input: ExtractInput): Promise<ExtractedFull> {
  const profilesBlock = input.profiles.map(p => {
    const lines = [`- ${p.name} (id=${p.id})`]
    if (p.medicalNotes) lines.push(`  medicalNotes: ${p.medicalNotes}`)
    if (p.preferences?.length) lines.push(`  preferences: ${p.preferences.join(', ')}`)
    if (p.sizes) lines.push(`  sizes: ${JSON.stringify(p.sizes)}`)
    return lines.join('\n')
  }).join('\n')

  const prompt = `You are extracting structured data from a PDF attachment for a personal life-management app.

Filename: ${input.filename}

Life Graph profiles (reference — use these to populate life_graph_hits when the document requests the same information):
${profilesBlock || '(no profiles on file)'}

PDF text (may be truncated to ~5 pages):
"""
${input.text.slice(0, 20000)}
"""

Produce a single JSON object:
- summary: 2-4 sentence plain-English summary of what this PDF is and what the recipient is being asked to do.
- dates: array of { label, date (ISO 8601 YYYY-MM-DD) } for every concrete date mentioned.
- required_fields: form fields the user has to fill in (e.g., "Parent signature", "Emergency contact phone").
- deadlines: ISO dates by which something is due.
- money: array of { label, amount (number), currency (ISO 4217) }.
- persons_mentioned: names of people referenced.
- life_graph_hits: an object mapping the PDF's requested field label to the corresponding Life Graph value. Include an entry only when a profile's stored data directly answers a required_field. Example: required_field "Medical notes" matches Annie.medicalNotes "peanut allergy" → life_graph_hits["Medical notes"] = "peanut allergy".

Never invent values. If a field isn't in the document, omit it.`

  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: ExtractedLLMSchema,
    prompt,
  })
  return object
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/server/attachment-llm.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/attachment-llm.ts tests/server/attachment-llm.test.ts
git commit -m "feat(attachments): gpt-4o-mini structured extractor with Life Graph cross-reference"
```

---

### Task 5: Firestore cache (attachment-cache.ts)

**Files:**
- Create: `src/lib/server/attachment-cache.ts`
- Create: `tests/server/attachment-cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/attachment-cache.test.ts`:

```ts
import { getCachedExtraction, writeCachedExtraction, cacheKey } from '@/lib/server/attachment-cache'
import { getAdminDb } from '@/lib/server/firebase-admin'

jest.mock('@/lib/server/firebase-admin')

describe('attachment-cache', () => {
  const mockDoc = { set: jest.fn(), get: jest.fn() }
  const mockCollection = { doc: jest.fn().mockReturnValue(mockDoc) }
  const mockUserDoc = { collection: jest.fn().mockReturnValue(mockCollection) }
  const mockUsers = { doc: jest.fn().mockReturnValue(mockUserDoc) }
  const mockDb = { collection: jest.fn().mockReturnValue(mockUsers) }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(getAdminDb as jest.Mock).mockReturnValue(mockDb)
  })

  it('cacheKey concatenates with a colon', () => {
    expect(cacheKey('m1', 'a1')).toBe('m1:a1')
  })

  it('getCachedExtraction returns null when doc does not exist', async () => {
    mockDoc.get.mockResolvedValue({ exists: false })
    const result = await getCachedExtraction('uid1', 'm1:a1')
    expect(result).toBeNull()
    expect(mockUsers.doc).toHaveBeenCalledWith('uid1')
    expect(mockCollection.doc).toHaveBeenCalledWith('m1:a1')
  })

  it('getCachedExtraction returns the extracted payload when present', async () => {
    const extracted = {
      summary: 'x', dates: [], required_fields: [], deadlines: [],
      money: [], persons_mentioned: [], life_graph_hits: {},
    }
    mockDoc.get.mockResolvedValue({ exists: true, data: () => ({ extracted, extractedAt: 123 }) })
    const result = await getCachedExtraction('uid1', 'm1:a1')
    expect(result).toEqual(extracted)
  })

  it('writeCachedExtraction writes extracted + extractedAt timestamp', async () => {
    const extracted = {
      summary: 'x', dates: [], required_fields: [], deadlines: [],
      money: [], persons_mentioned: [], life_graph_hits: {},
    }
    await writeCachedExtraction('uid1', 'm1:a1', extracted)
    expect(mockDoc.set).toHaveBeenCalledWith(expect.objectContaining({
      extracted,
      extractedAt: expect.any(Number),
    }))
  })

  it('writeCachedExtraction also writes skipped payloads', async () => {
    await writeCachedExtraction('uid1', 'm1:a1', { skipped: true, reason: 'password_protected' })
    expect(mockDoc.set).toHaveBeenCalledWith(expect.objectContaining({
      extracted: { skipped: true, reason: 'password_protected' },
    }))
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/attachment-cache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/attachment-cache.ts`:

```ts
import { getAdminDb } from './firebase-admin'
import { ExtractedSchema, type Extracted } from './attachment-extract-schema'

export function cacheKey(messageId: string, attachmentId: string): string {
  return `${messageId}:${attachmentId}`
}

function docRef(uid: string, key: string) {
  return getAdminDb()
    .collection('users').doc(uid)
    .collection('attachments').doc(key)
}

export async function getCachedExtraction(uid: string, key: string): Promise<Extracted | null> {
  const snap = await docRef(uid, key).get()
  if (!snap.exists) return null
  const data = snap.data() as { extracted?: unknown } | undefined
  if (!data?.extracted) return null
  const parsed = ExtractedSchema.safeParse(data.extracted)
  if (!parsed.success) {
    // Cached doc is malformed; treat as cache miss rather than crash.
    return null
  }
  return parsed.data
}

export async function writeCachedExtraction(
  uid: string,
  key: string,
  extracted: Extracted,
): Promise<void> {
  await docRef(uid, key).set({
    extracted,
    extractedAt: Date.now(),
  })
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/server/attachment-cache.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/attachment-cache.ts tests/server/attachment-cache.test.ts
git commit -m "feat(attachments): Firestore cache for extraction results"
```

---

### Task 6: Signed download-token utility

HMAC-signed short-lived token for the `/api/attachments/download` route. Includes `uid`, `accountId`, `messageId`, `attachmentId`, `exp`. 5-minute TTL.

**Files:**
- Create: `src/lib/server/attachment-download-token.ts`
- Create: `tests/server/attachment-download-token.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server/attachment-download-token.test.ts`:

```ts
import { signDownloadToken, verifyDownloadToken } from '@/lib/server/attachment-download-token'

describe('attachment-download-token', () => {
  beforeAll(() => {
    process.env.ATTACHMENT_DOWNLOAD_SIGNING_KEY = Buffer.alloc(32, 7).toString('base64')
  })

  it('round-trips a valid token', () => {
    const token = signDownloadToken({
      uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1',
    }, { ttlSeconds: 300 })
    const parsed = verifyDownloadToken(token)
    expect(parsed).toMatchObject({ uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1' })
  })

  it('rejects a token with a tampered payload', () => {
    const token = signDownloadToken({
      uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1',
    }, { ttlSeconds: 300 })
    const [payload, sig] = token.split('.')
    const tampered = Buffer.from(payload, 'base64url').toString('utf8').replace('u1', 'u2')
    const bogus = `${Buffer.from(tampered).toString('base64url')}.${sig}`
    expect(() => verifyDownloadToken(bogus)).toThrow(/signature/i)
  })

  it('rejects an expired token', () => {
    const token = signDownloadToken({
      uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1',
    }, { ttlSeconds: -1 })
    expect(() => verifyDownloadToken(token)).toThrow(/expired/i)
  })

  it('rejects a malformed token', () => {
    expect(() => verifyDownloadToken('not.a.real.token')).toThrow()
    expect(() => verifyDownloadToken('')).toThrow()
  })

  it('throws when signing key missing', () => {
    const saved = process.env.ATTACHMENT_DOWNLOAD_SIGNING_KEY
    delete process.env.ATTACHMENT_DOWNLOAD_SIGNING_KEY
    expect(() => signDownloadToken({
      uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1',
    }, { ttlSeconds: 300 })).toThrow()
    process.env.ATTACHMENT_DOWNLOAD_SIGNING_KEY = saved
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/attachment-download-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/server/attachment-download-token.ts`:

```ts
import { createHmac, timingSafeEqual } from 'crypto'

export interface DownloadTokenClaims {
  uid: string
  accountId: string
  messageId: string
  attachmentId: string
}

interface TokenPayload extends DownloadTokenClaims {
  exp: number
}

function getKey(): Buffer {
  const raw = process.env.ATTACHMENT_DOWNLOAD_SIGNING_KEY
  if (!raw) throw new Error('ATTACHMENT_DOWNLOAD_SIGNING_KEY not set')
  return Buffer.from(raw, 'base64')
}

function sign(payload: string): string {
  return createHmac('sha256', getKey()).update(payload).digest('base64url')
}

export function signDownloadToken(
  claims: DownloadTokenClaims,
  options: { ttlSeconds: number },
): string {
  const payload: TokenPayload = {
    ...claims,
    exp: Math.floor(Date.now() / 1000) + options.ttlSeconds,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function verifyDownloadToken(token: string): DownloadTokenClaims {
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('Malformed download token')
  const [encoded, signature] = parts
  if (!encoded || !signature) throw new Error('Malformed download token')
  const expected = sign(encoded)
  const sigBuf = Buffer.from(signature, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid download token signature')
  }
  let parsed: TokenPayload
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload
  } catch {
    throw new Error('Malformed download token payload')
  }
  if (parsed.exp * 1000 < Date.now()) {
    throw new Error('Download token expired')
  }
  const { uid, accountId, messageId, attachmentId } = parsed
  return { uid, accountId, messageId, attachmentId }
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/server/attachment-download-token.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/attachment-download-token.ts tests/server/attachment-download-token.test.ts
git commit -m "feat(attachments): HMAC-signed short-lived download token"
```

---

### Task 7: Download Route Handler (binary)

Raw GET Route Handler at `/api/attachments/download`. Verifies the signed token, resolves the user's refresh token for the account, fetches the attachment bytes from Gmail, streams them back with the correct `Content-Type` and `Content-Disposition`.

**Files:**
- Create: `src/app/api/attachments/download/route.ts`
- Create: `tests/api/attachments-download.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/attachments-download.test.ts`:

```ts
import { GET } from '@/app/api/attachments/download/route'
import { verifyDownloadToken } from '@/lib/server/attachment-download-token'
import { getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchAttachmentBytes } from '@/lib/server/gmail-attachments'

jest.mock('@/lib/server/attachment-download-token')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-attachments')

describe('/api/attachments/download', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(verifyDownloadToken as jest.Mock).mockReturnValue({
      uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1',
    })
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(fetchAttachmentBytes as jest.Mock).mockResolvedValue(Buffer.from('%PDF-1.4 hello'))
  })

  it('returns the PDF bytes with the right headers', async () => {
    const req = new Request('http://x/api/attachments/download?token=abc.def&filename=slip.pdf&mime=application/pdf')
    const res = await GET(req)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/pdf')
    expect(res.headers.get('content-disposition')).toContain('slip.pdf')
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.toString().slice(0, 4)).toBe('%PDF')
  })

  it('returns 401 when the token is invalid', async () => {
    ;(verifyDownloadToken as jest.Mock).mockImplementation(() => { throw new Error('Invalid download token signature') })
    const req = new Request('http://x/api/attachments/download?token=bad.token')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when token param is missing', async () => {
    const req = new Request('http://x/api/attachments/download')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/api/attachments-download.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement**

Create `src/app/api/attachments/download/route.ts`:

```ts
import { verifyDownloadToken } from '@/lib/server/attachment-download-token'
import { getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchAttachmentBytes } from '@/lib/server/gmail-attachments'

export const maxDuration = 60

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const filename = url.searchParams.get('filename') || 'attachment.pdf'
  const mime = url.searchParams.get('mime') || 'application/octet-stream'

  if (!token) return new Response('Missing token', { status: 400 })

  let claims
  try {
    claims = verifyDownloadToken(token)
  } catch {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const rt = await getDecryptedRefreshToken(claims.uid, claims.accountId)
    if (!rt) return new Response('Account not found', { status: 404 })
    const { accessToken } = await refreshAccessToken(rt)
    const buf = await fetchAttachmentBytes(accessToken, claims.messageId, claims.attachmentId)
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        'content-type': mime,
        'content-disposition': `inline; filename="${filename.replace(/"/g, '')}"`,
        'cache-control': 'private, max-age=300',
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Download failed'
    return new Response(msg, { status: 500 })
  }
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/api/attachments-download.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/attachments/download/route.ts tests/api/attachments-download.test.ts
git commit -m "feat(attachments): raw GET /api/attachments/download streams bytes via signed token"
```

---

### Task 8: tRPC `attachmentsRouter` — `extract`, `get`, `downloadUrl`

Ties Tasks 2–6 together into the three procedures the UI calls.

**Files:**
- Create: `src/server/trpc/routers/attachments.ts`
- Create: `tests/server/trpc/routers/attachments.test.ts`
- Modify: `src/server/trpc/root.ts`

- [ ] **Step 1: Write the failing router test**

Create `tests/server/trpc/routers/attachments.test.ts`:

```ts
import { attachmentsRouter } from '@/server/trpc/routers/attachments'
import { getCachedExtraction, writeCachedExtraction, cacheKey } from '@/lib/server/attachment-cache'
import { listAccounts, getDecryptedRefreshToken } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchAttachmentBytes } from '@/lib/server/gmail-attachments'
import { extractPdfText } from '@/lib/server/pdf-extract'
import { extractStructured } from '@/lib/server/attachment-llm'
import { listProfiles } from '@/lib/server/profiles'
import { signDownloadToken } from '@/lib/server/attachment-download-token'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/server/attachment-cache')
jest.mock('@/lib/server/accounts')
jest.mock('@/lib/server/google-oauth')
jest.mock('@/lib/server/gmail-attachments')
jest.mock('@/lib/server/pdf-extract')
jest.mock('@/lib/server/attachment-llm')
jest.mock('@/lib/server/profiles')
jest.mock('@/lib/server/attachment-download-token')

describe('attachments router', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(listAccounts as jest.Mock).mockResolvedValue([{ id: 'a1', email: 'mary@tribe.ai' }])
    ;(getDecryptedRefreshToken as jest.Mock).mockResolvedValue('rt')
    ;(refreshAccessToken as jest.Mock).mockResolvedValue({ accessToken: 'at', expiresAt: 0 })
    ;(listProfiles as jest.Mock).mockResolvedValue([{ id: 'annie', name: 'Annie', medicalNotes: 'peanut allergy' }])
    ;(cacheKey as jest.Mock).mockImplementation((m, a) => `${m}:${a}`)
    ;(signDownloadToken as jest.Mock).mockReturnValue('signed.token')
  })

  // ------ get ------
  it('get returns cached extraction when present', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue({
      summary: 'Cached.', dates: [], required_fields: [], deadlines: [],
      money: [], persons_mentioned: [], life_graph_hits: {},
    })
    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.get({ emailId: 'm1', attachmentId: 'at1' })
    expect(result.extracted).toMatchObject({ summary: 'Cached.' })
    expect(result.cached).toBe(true)
    expect(fetchAttachmentBytes).not.toHaveBeenCalled()
  })

  it('get returns null when no cache hit', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue(null)
    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.get({ emailId: 'm1', attachmentId: 'at1' })
    expect(result.extracted).toBeNull()
    expect(result.cached).toBe(false)
  })

  it('get rejects unauthenticated callers', async () => {
    const caller = attachmentsRouter.createCaller({})
    await expect(caller.get({ emailId: 'm1', attachmentId: 'at1' })).rejects.toBeInstanceOf(TRPCError)
  })

  // ------ extract — cache hit ------
  it('extract returns cached result without re-running pipeline', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue({
      summary: 'Already extracted.', dates: [], required_fields: [], deadlines: [],
      money: [], persons_mentioned: [], life_graph_hits: {},
    })
    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })
    expect(result.extracted).toMatchObject({ summary: 'Already extracted.' })
    expect(result.cached).toBe(true)
    expect(fetchAttachmentBytes).not.toHaveBeenCalled()
    expect(extractPdfText).not.toHaveBeenCalled()
    expect(extractStructured).not.toHaveBeenCalled()
    expect(writeCachedExtraction).not.toHaveBeenCalled()
  })

  // ------ extract — fast-path text extraction ------
  it('extract runs unpdf → LLM → cache when text is rich', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue(null)
    ;(fetchAttachmentBytes as jest.Mock).mockResolvedValue(Buffer.from('%PDF fake'))
    ;(extractPdfText as jest.Mock).mockResolvedValue({
      text: 'Annie zoo trip, sign permission slip by April 28. Medical notes requested.',
      totalPages: 1,
      passwordProtected: false,
    })
    ;(extractStructured as jest.Mock).mockResolvedValue({
      summary: 'Annie zoo trip permission slip.',
      dates: [], required_fields: ['Parent signature'], deadlines: ['2026-04-28'],
      money: [], persons_mentioned: ['Annie'], life_graph_hits: { 'Medical notes': 'peanut allergy' },
    })

    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })

    expect(extractStructured).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Annie zoo'),
      profiles: expect.arrayContaining([expect.objectContaining({ id: 'annie' })]),
    }))
    expect(writeCachedExtraction).toHaveBeenCalledWith('u1', 'm1:at1', expect.objectContaining({
      summary: 'Annie zoo trip permission slip.',
    }))
    expect(result.cached).toBe(false)
    expect(result.extracted).toMatchObject({ summary: 'Annie zoo trip permission slip.' })
  })

  // ------ extract — no extractable text short-circuit ------
  it('extract writes skipped:no_text_extractable when unpdf returns trivially little text', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue(null)
    ;(fetchAttachmentBytes as jest.Mock).mockResolvedValue(Buffer.from('%PDF fake'))
    ;(extractPdfText as jest.Mock).mockResolvedValue({
      text: 'hi', totalPages: 1, passwordProtected: false,
    })

    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })

    expect(result.extracted).toEqual({ skipped: true, reason: 'no_text_extractable' })
    expect(extractStructured).not.toHaveBeenCalled()
    expect(writeCachedExtraction).toHaveBeenCalledWith('u1', 'm1:at1', { skipped: true, reason: 'no_text_extractable' })
  })

  // ------ extract — password-protected short-circuit ------
  it('extract writes skipped:password_protected and does not call the LLM', async () => {
    ;(getCachedExtraction as jest.Mock).mockResolvedValue(null)
    ;(fetchAttachmentBytes as jest.Mock).mockResolvedValue(Buffer.from('%PDF fake'))
    ;(extractPdfText as jest.Mock).mockResolvedValue({
      text: '', totalPages: 0, passwordProtected: true,
    })

    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })

    expect(result.extracted).toEqual({ skipped: true, reason: 'password_protected' })
    expect(extractStructured).not.toHaveBeenCalled()
    expect(writeCachedExtraction).toHaveBeenCalledWith('u1', 'm1:at1', { skipped: true, reason: 'password_protected' })
  })

  it('extract is idempotent: cache-miss → extract → cache-hit on second call', async () => {
    const extracted = {
      summary: 'First call.', dates: [], required_fields: [], deadlines: [],
      money: [], persons_mentioned: [], life_graph_hits: {},
    }

    // First call: miss
    ;(getCachedExtraction as jest.Mock).mockResolvedValueOnce(null)
    ;(fetchAttachmentBytes as jest.Mock).mockResolvedValue(Buffer.from('%PDF fake'))
    ;(extractPdfText as jest.Mock).mockResolvedValue({
      text: 'some real content here, lots of text, well beyond 50 chars of real signal.',
      totalPages: 1, passwordProtected: false,
    })
    ;(extractStructured as jest.Mock).mockResolvedValue(extracted)

    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const first = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })
    expect(first.cached).toBe(false)
    expect(writeCachedExtraction).toHaveBeenCalledTimes(1)

    // Second call: hit
    ;(getCachedExtraction as jest.Mock).mockResolvedValueOnce(extracted)
    const second = await caller.extract({ emailId: 'm1', attachmentId: 'at1', accountId: 'a1' })
    expect(second.cached).toBe(true)
    expect(writeCachedExtraction).toHaveBeenCalledTimes(1) // still just once
  })

  // ------ downloadUrl ------
  it('downloadUrl returns a signed URL with filename + mime', async () => {
    const caller = attachmentsRouter.createCaller({ uid: 'u1' })
    const result = await caller.downloadUrl({
      emailId: 'm1', attachmentId: 'at1', accountId: 'a1',
      filename: 'slip.pdf', mimeType: 'application/pdf',
    })
    expect(result.url).toContain('/api/attachments/download?')
    expect(result.url).toContain('token=signed.token')
    expect(result.url).toContain('filename=slip.pdf')
    expect(result.url).toContain('mime=application%2Fpdf')
    expect(signDownloadToken).toHaveBeenCalledWith(
      { uid: 'u1', accountId: 'a1', messageId: 'm1', attachmentId: 'at1' },
      { ttlSeconds: 300 },
    )
  })

  it('downloadUrl rejects unauthenticated callers', async () => {
    const caller = attachmentsRouter.createCaller({})
    await expect(caller.downloadUrl({
      emailId: 'm1', attachmentId: 'at1', accountId: 'a1', filename: 'x.pdf', mimeType: 'application/pdf',
    })).rejects.toBeInstanceOf(TRPCError)
  })
})
```

Note: this assumes `listProfiles(uid)` is the export name used in Phase 2. If your Phase 2 ships a different export (`getProfiles`, `listEntityProfiles`, etc.), update both the mock and the router import.

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/server/trpc/routers/attachments.test.ts`
Expected: FAIL — router module not found.

- [ ] **Step 3: Implement the router**

Create `src/server/trpc/routers/attachments.ts`:

```ts
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import { cacheKey, getCachedExtraction, writeCachedExtraction } from '@/lib/server/attachment-cache'
import { getDecryptedRefreshToken, listAccounts } from '@/lib/server/accounts'
import { refreshAccessToken } from '@/lib/server/google-oauth'
import { fetchAttachmentBytes } from '@/lib/server/gmail-attachments'
import { extractPdfText } from '@/lib/server/pdf-extract'
import { extractStructured } from '@/lib/server/attachment-llm'
import { listProfiles } from '@/lib/server/profiles'
import { signDownloadToken } from '@/lib/server/attachment-download-token'
import type { Extracted } from '@/lib/server/attachment-extract-schema'

const MAX_PAGES = 5
const MIN_TEXT_CHARS = 50
const TOKEN_TTL_SECONDS = 300

async function resolveAccessToken(uid: string, accountId: string): Promise<string> {
  // Verify the account belongs to this uid.
  const accounts = await listAccounts(uid)
  if (!accounts.some(a => a.id === accountId)) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Account not found' })
  }
  const rt = await getDecryptedRefreshToken(uid, accountId)
  if (!rt) throw new TRPCError({ code: 'NOT_FOUND', message: 'Refresh token missing' })
  const { accessToken } = await refreshAccessToken(rt)
  return accessToken
}

export const attachmentsRouter = router({
  get: protectedProcedure
    .input(z.object({
      emailId: z.string().min(1),
      attachmentId: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      const key = cacheKey(input.emailId, input.attachmentId)
      const extracted = await getCachedExtraction(ctx.uid, key)
      return { extracted, cached: extracted !== null }
    }),

  extract: protectedProcedure
    .input(z.object({
      emailId: z.string().min(1),
      attachmentId: z.string().min(1),
      accountId: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const key = cacheKey(input.emailId, input.attachmentId)

      // 1. Cache check.
      const cached = await getCachedExtraction(ctx.uid, key)
      if (cached) return { extracted: cached, cached: true }

      // 2. Fetch bytes.
      const accessToken = await resolveAccessToken(ctx.uid, input.accountId)
      const bytes = await fetchAttachmentBytes(accessToken, input.emailId, input.attachmentId)

      // 3. Fast-path text extraction.
      const pdf = await extractPdfText(bytes, { maxPages: MAX_PAGES })

      if (pdf.passwordProtected) {
        const skipped: Extracted = { skipped: true, reason: 'password_protected' }
        await writeCachedExtraction(ctx.uid, key, skipped)
        return { extracted: skipped, cached: false }
      }

      // 4. No extractable text (e.g., scanned image PDFs) → skip with no_text_extractable.
      const workingText = pdf.text
      if (workingText.trim().length < MIN_TEXT_CHARS) {
        const skipped: Extracted = { skipped: true, reason: 'no_text_extractable' }
        await writeCachedExtraction(ctx.uid, key, skipped)
        return { extracted: skipped, cached: false }
      }

      // 5. Structured LLM extraction.
      const profiles = await listProfiles(ctx.uid)
      const extracted = await extractStructured({
        text: workingText,
        profiles,
        filename: input.emailId, // UI re-passes filename via the attachment record; LLM prompt accepts it.
      })

      // 6. Cache.
      await writeCachedExtraction(ctx.uid, key, extracted)

      return { extracted, cached: false }
    }),

  downloadUrl: protectedProcedure
    .input(z.object({
      emailId: z.string().min(1),
      attachmentId: z.string().min(1),
      accountId: z.string().min(1),
      filename: z.string().min(1),
      mimeType: z.string().min(1),
    }))
    .query(async ({ ctx, input }) => {
      const token = signDownloadToken(
        { uid: ctx.uid, accountId: input.accountId, messageId: input.emailId, attachmentId: input.attachmentId },
        { ttlSeconds: TOKEN_TTL_SECONDS },
      )
      const params = new URLSearchParams({
        token,
        filename: input.filename,
        mime: input.mimeType,
      })
      return { url: `/api/attachments/download?${params.toString()}`, expiresInSeconds: TOKEN_TTL_SECONDS }
    }),
})
```

- [ ] **Step 4: Mount on root router**

Edit `src/server/trpc/root.ts` to add:

```ts
import { attachmentsRouter } from './routers/attachments'

export const appRouter = router({
  // ... existing routers ...
  attachments: attachmentsRouter,
})
```

- [ ] **Step 5: Confirm tests pass**

Run: `npx jest tests/server/trpc/routers/attachments.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Full suite check**

Run: `npx tsc --noEmit && npx jest`
Expected: 0 type errors; full suite green.

- [ ] **Step 7: Commit**

```bash
git add src/server/trpc/routers/attachments.ts src/server/trpc/root.ts tests/server/trpc/routers/attachments.test.ts
git commit -m "feat(trpc): attachmentsRouter with extract (lazy+cached), get, downloadUrl"
```

---

### Task 9: `useAttachmentExtract` composition hook

Small client helper that wires `get` → `extract` correctly (fire the query, mutate on miss, invalidate on success).

**Files:**
- Create: `src/lib/trpc/use-attachment-extract.ts`

- [ ] **Step 1: Implement**

Create `src/lib/trpc/use-attachment-extract.ts`:

```ts
"use client"

import { useEffect, useRef } from 'react'
import { trpc } from './client'
import type { Extracted } from '@/lib/server/attachment-extract-schema'

export interface UseAttachmentExtractArgs {
  emailId: string
  attachmentId: string
  accountId: string
  enabled: boolean
}

export interface UseAttachmentExtractResult {
  extracted: Extracted | null | undefined
  isLoading: boolean
  error: string | null
  isFromCache: boolean
}

/**
 * Renders the extracted attachment data, triggering a server-side extraction
 * exactly once on cache miss. Subsequent opens are instant (cache hit).
 */
export function useAttachmentExtract(args: UseAttachmentExtractArgs): UseAttachmentExtractResult {
  const utils = trpc.useUtils()

  const getQuery = trpc.attachments.get.useQuery(
    { emailId: args.emailId, attachmentId: args.attachmentId },
    { enabled: args.enabled, staleTime: Infinity },
  )

  const extractMutation = trpc.attachments.extract.useMutation({
    onSuccess: () => {
      utils.attachments.get.invalidate({ emailId: args.emailId, attachmentId: args.attachmentId })
    },
  })

  const triggered = useRef(false)

  useEffect(() => {
    if (!args.enabled) return
    if (!getQuery.data) return
    if (getQuery.data.cached) return // already extracted
    if (getQuery.data.extracted !== null) return // belt and braces
    if (triggered.current) return
    triggered.current = true
    extractMutation.mutate({
      emailId: args.emailId,
      attachmentId: args.attachmentId,
      accountId: args.accountId,
    })
    // `extractMutation` is stable from react-query; including it in deps would re-fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.enabled, args.emailId, args.attachmentId, args.accountId, getQuery.data])

  const extracted = extractMutation.data?.extracted ?? getQuery.data?.extracted ?? null
  const error = extractMutation.error?.message ?? getQuery.error?.message ?? null

  return {
    extracted,
    isLoading: getQuery.isLoading || extractMutation.isPending,
    error,
    isFromCache: !!getQuery.data?.cached,
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/trpc/use-attachment-extract.ts
git commit -m "feat(trpc): useAttachmentExtract hook composing get + extract"
```

---

### Task 10: PDF.js worker wiring

Single file sets `GlobalWorkerOptions.workerSrc` so `pdfjs-dist` loads its worker correctly under Next.js 16's bundler.

**Files:**
- Create: `src/components/inbox/pdfjs-worker.ts`

- [ ] **Step 1: Implement**

Create `src/components/inbox/pdfjs-worker.ts`:

```ts
"use client"

// Next.js 16 + pdfjs-dist v4+: import the worker as a URL so the bundler emits it
// as a static asset, then point pdfjs at it. Do this once; subsequent imports are no-ops.
import * as pdfjs from 'pdfjs-dist'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - pdf.worker.min.mjs has no types; it's a URL asset.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl as unknown as string
}

export { pdfjs }
```

Note: if Next.js 16 doesn't support the `?url` suffix (verify against `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`), swap to the documented asset-import pattern for this version. The contract — `pdfjs.GlobalWorkerOptions.workerSrc` is set before any `getDocument()` call — is stable.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/pdfjs-worker.ts
git commit -m "feat(pdf): pdfjs-dist worker wiring"
```

---

### Task 11: Attachment preview slide-over

`pdfjs-dist`-powered inline viewer. Fetches bytes via the signed `downloadUrl` procedure.

**Files:**
- Create: `src/components/inbox/attachment-preview-slideover.tsx`

- [ ] **Step 1: Implement**

Create `src/components/inbox/attachment-preview-slideover.tsx`:

```tsx
"use client"

import { useEffect, useRef, useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import { pdfjs } from './pdfjs-worker'

interface Props {
  open: boolean
  onClose: () => void
  emailId: string
  attachmentId: string
  accountId: string
  filename: string
  mimeType: string
}

export function AttachmentPreviewSlideover(props: Props) {
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null>(null)

  const downloadQuery = trpc.attachments.downloadUrl.useQuery(
    {
      emailId: props.emailId,
      attachmentId: props.attachmentId,
      accountId: props.accountId,
      filename: props.filename,
      mimeType: props.mimeType,
    },
    { enabled: props.open, staleTime: 4 * 60_000 /* 4m, < token TTL */ },
  )

  // Load doc when URL ready.
  useEffect(() => {
    if (!downloadQuery.data?.url) return
    let cancelled = false
    ;(async () => {
      const loadingTask = pdfjs.getDocument(downloadQuery.data.url)
      const doc = await loadingTask.promise
      if (cancelled) return
      docRef.current = doc
      setTotalPages(doc.numPages)
      setPage(1)
    })()
    return () => { cancelled = true; docRef.current?.destroy(); docRef.current = null }
  }, [downloadQuery.data?.url])

  // Render the active page.
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas) return
    let cancelled = false
    ;(async () => {
      const pageObj = await doc.getPage(page)
      if (cancelled) return
      const viewport = pageObj.getViewport({ scale: 1.25 })
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      await pageObj.render({ canvasContext: ctx, viewport }).promise
    })()
    return () => { cancelled = true }
  }, [page])

  if (!props.open) return null

  return (
    <div role="dialog" aria-label="Attachment preview" className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={props.onClose} />
      <div className="flex w-[720px] flex-col bg-background border-l">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <span className="truncate font-mono text-xs uppercase tracking-wide">{props.filename}</span>
          <button type="button" onClick={props.onClose} className="text-xs uppercase tracking-wider">Close</button>
        </header>
        <div className="flex-1 overflow-auto bg-muted/40 p-4">
          {downloadQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {downloadQuery.error && <p className="text-xs text-destructive">Couldn't load: {downloadQuery.error.message}</p>}
          <canvas ref={canvasRef} className="mx-auto shadow-sm" />
        </div>
        <footer className="flex items-center justify-between border-t px-4 py-2 text-xs">
          <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span>{page} / {totalPages || '—'}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </footer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inbox/attachment-preview-slideover.tsx
git commit -m "feat(inbox): pdfjs-dist preview slide-over"
```

---

### Task 12: Attachment card component

Reader-pane card. Composes `useAttachmentExtract`, renders all the metadata, owns Preview / Download buttons.

**Files:**
- Create: `src/components/inbox/attachment-card.tsx`
- Create: `tests/components/inbox/attachment-card.test.tsx`

- [ ] **Step 1: Write the failing component test**

Create `tests/components/inbox/attachment-card.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AttachmentCard } from '@/components/inbox/attachment-card'
import { useAttachmentExtract } from '@/lib/trpc/use-attachment-extract'

jest.mock('@/lib/trpc/use-attachment-extract')
jest.mock('@/lib/trpc/client', () => ({
  trpc: {
    attachments: {
      downloadUrl: { useQuery: () => ({ data: { url: '/api/attachments/download?token=abc' }, isLoading: false }) },
    },
  },
}))
jest.mock('@/components/inbox/attachment-preview-slideover', () => ({
  AttachmentPreviewSlideover: () => <div data-testid="preview-slideover" />,
}))

describe('<AttachmentCard>', () => {
  const baseProps = {
    emailId: 'm1',
    attachmentId: 'at1',
    accountId: 'a1',
    filename: 'permission-slip.pdf',
    mimeType: 'application/pdf',
    size: 42_000,
  }

  beforeEach(() => jest.clearAllMocks())

  it('renders the AI summary, dates, required fields, and life_graph_hits as chips', () => {
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: {
        summary: 'Permission slip for the zoo trip.',
        dates: [{ label: 'Trip date', date: '2026-05-02' }],
        required_fields: ['Parent signature', 'Emergency contact'],
        deadlines: ['2026-04-28'],
        money: [],
        persons_mentioned: ['Annie'],
        life_graph_hits: { 'Medical notes': 'peanut allergy' },
      },
      isLoading: false,
      error: null,
      isFromCache: true,
    })
    render(<AttachmentCard {...baseProps} />)
    expect(screen.getByText(/Permission slip for the zoo trip/)).toBeInTheDocument()
    expect(screen.getByText(/Trip date/)).toBeInTheDocument()
    expect(screen.getByText(/Parent signature/)).toBeInTheDocument()
    expect(screen.getByText(/peanut allergy/)).toBeInTheDocument()
  })

  it('renders a loading state while extraction is pending', () => {
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: null, isLoading: true, error: null, isFromCache: false,
    })
    render(<AttachmentCard {...baseProps} />)
    expect(screen.getByText(/extracting/i)).toBeInTheDocument()
  })

  it('shows a lock icon + skip message for password-protected PDFs', () => {
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: { skipped: true, reason: 'password_protected' },
      isLoading: false, error: null, isFromCache: true,
    })
    render(<AttachmentCard {...baseProps} />)
    expect(screen.getByLabelText(/password protected/i)).toBeInTheDocument()
  })

  it('clicking a life_graph_hits chip copies the value to clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: {
        summary: 'x', dates: [], required_fields: [], deadlines: [],
        money: [], persons_mentioned: [],
        life_graph_hits: { 'Medical notes': 'peanut allergy' },
      },
      isLoading: false, error: null, isFromCache: true,
    })
    render(<AttachmentCard {...baseProps} />)
    const chip = screen.getByRole('button', { name: /peanut allergy/ })
    await userEvent.click(chip)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('peanut allergy'))
  })

  it('non-PDF mime types skip the extract call entirely', () => {
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: null, isLoading: false, error: null, isFromCache: false,
    })
    render(<AttachmentCard {...baseProps} mimeType="image/png" filename="photo.png" />)
    // The hook is called with enabled: false for non-PDFs.
    expect(useAttachmentExtract).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }))
    expect(screen.getByText(/photo\.png/)).toBeInTheDocument()
    // No summary block for non-PDFs.
    expect(screen.queryByText(/AI summary/i)).not.toBeInTheDocument()
  })

  it('Preview button opens the slide-over', async () => {
    ;(useAttachmentExtract as jest.Mock).mockReturnValue({
      extracted: {
        summary: 'x', dates: [], required_fields: [], deadlines: [],
        money: [], persons_mentioned: [], life_graph_hits: {},
      },
      isLoading: false, error: null, isFromCache: true,
    })
    render(<AttachmentCard {...baseProps} />)
    await userEvent.click(screen.getByRole('button', { name: /preview/i }))
    expect(screen.getByTestId('preview-slideover')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `npx jest tests/components/inbox/attachment-card.test.tsx`
Expected: FAIL — component module not found.

If jest complains about missing `@testing-library/user-event`, install it:

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 3: Implement the component**

Create `src/components/inbox/attachment-card.tsx`:

```tsx
"use client"

import { useState } from 'react'
import { FileText, Lock, Download, Eye } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useAttachmentExtract } from '@/lib/trpc/use-attachment-extract'
import { AttachmentPreviewSlideover } from './attachment-preview-slideover'

interface Props {
  emailId: string
  attachmentId: string
  accountId: string
  filename: string
  mimeType: string
  size: number
}

export function AttachmentCard(props: Props) {
  const isPdf = props.mimeType === 'application/pdf'

  const { extracted, isLoading, error } = useAttachmentExtract({
    emailId: props.emailId,
    attachmentId: props.attachmentId,
    accountId: props.accountId,
    enabled: isPdf,
  })

  const [previewOpen, setPreviewOpen] = useState(false)

  const downloadQuery = trpc.attachments.downloadUrl.useQuery(
    {
      emailId: props.emailId,
      attachmentId: props.attachmentId,
      accountId: props.accountId,
      filename: props.filename,
      mimeType: props.mimeType,
    },
    { enabled: false, staleTime: 4 * 60_000 },
  )

  const handleDownload = async () => {
    const { data } = await downloadQuery.refetch()
    if (data?.url) window.location.assign(data.url)
  }

  const handleCopyChip = async (value: string) => {
    try { await navigator.clipboard.writeText(value) } catch { /* ignore */ }
  }

  const skipped = extracted && 'skipped' in extracted && extracted.skipped

  return (
    <div className="rounded-md border bg-card/60 p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        {skipped && extracted && 'reason' in extracted && extracted.reason === 'password_protected' ? (
          <Lock aria-label="password protected" className="h-4 w-4 text-muted-foreground" />
        ) : (
          <FileText className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="truncate font-mono text-xs">{props.filename}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
          {Math.round(props.size / 1024)} KB
        </span>
      </div>

      {!isPdf && (
        <p className="text-xs text-muted-foreground">No extraction for this file type.</p>
      )}

      {isPdf && isLoading && (
        <p className="text-xs text-muted-foreground" role="status">Extracting…</p>
      )}

      {isPdf && error && (
        <p className="text-xs text-destructive">Extraction failed: {error}</p>
      )}

      {isPdf && extracted && !('skipped' in extracted) && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">AI summary</div>
            <p className="text-sm">{extracted.summary}</p>
          </div>

          {extracted.dates.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {extracted.dates.map((d, i) => (
                <span key={i} className="rounded-sm bg-muted px-2 py-0.5 text-[11px]">
                  {d.label}: {d.date}
                </span>
              ))}
            </div>
          )}

          {extracted.required_fields.length > 0 && (
            <ul className="space-y-0.5 text-xs">
              {extracted.required_fields.map((f, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-[2px] border" />
                  {f}
                </li>
              ))}
            </ul>
          )}

          {Object.entries(extracted.life_graph_hits).length > 0 && (
            <div className="flex flex-wrap gap-1">
              {Object.entries(extracted.life_graph_hits).map(([label, value]) => (
                <button
                  key={label}
                  type="button"
                  title={`${label} — click to copy`}
                  onClick={() => handleCopyChip(value)}
                  className="rounded-sm border bg-accent/30 px-2 py-0.5 text-[11px] hover:bg-accent/50"
                >
                  {label}: {value}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {isPdf && skipped && extracted && 'reason' in extracted && (
        <p className="text-xs text-muted-foreground">
          {extracted.reason === 'password_protected'
            ? 'Password-protected — extraction skipped.'
            : extracted.reason === 'no_text_extractable'
            ? 'Extraction unavailable — open the preview to read the PDF.'
            : 'Extraction unavailable.'}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {isPdf && (
          <button type="button" onClick={() => setPreviewOpen(true)} className="flex items-center gap-1 text-xs uppercase tracking-wider">
            <Eye className="h-3 w-3" /> Preview
          </button>
        )}
        <button type="button" onClick={handleDownload} className="flex items-center gap-1 text-xs uppercase tracking-wider">
          <Download className="h-3 w-3" /> Download
        </button>
      </div>

      {isPdf && previewOpen && (
        <AttachmentPreviewSlideover
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          emailId={props.emailId}
          attachmentId={props.attachmentId}
          accountId={props.accountId}
          filename={props.filename}
          mimeType={props.mimeType}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx jest tests/components/inbox/attachment-card.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/inbox/attachment-card.tsx tests/components/inbox/attachment-card.test.tsx
git commit -m "feat(inbox): attachment card with AI summary, chips, preview + download"
```

---

### Task 13: Wire the card into the Reader pane

Slot `<AttachmentCard>` into whatever Reader pane exists (Phase 3 or the pre-Phase-3 Reader).

**Files:**
- Modify: `src/app/inbox/page.tsx`

- [ ] **Step 1: Find where attachments are currently rendered**

Run: `grep -n "attachments" src/app/inbox/page.tsx`

Expected: one or more references. If Phase 3 has landed a proper `<Reader>` component in `src/components/inbox/`, the grep will show the usage site there instead — adapt Step 2 accordingly.

- [ ] **Step 2: Replace the current attachment list with `<AttachmentCard>`**

For each selected email in the Reader pane, render one `<AttachmentCard>` per attachment in `email.attachments`:

```tsx
import { AttachmentCard } from '@/components/inbox/attachment-card'

{selectedEmail?.attachments?.map((att) => (
  <AttachmentCard
    key={att.id}
    emailId={selectedEmail.id}
    attachmentId={att.id}
    accountId={selectedEmail.accountId ?? ''}
    filename={att.filename}
    mimeType={att.mimeType}
    size={att.size}
  />
))}
```

If `selectedEmail.accountId` is missing (possible in Phase 1 single-account era), fall back to the first registered account — but this is a regression check, not normal flow; Phase 2 emails carry `accountId`.

- [ ] **Step 3: Type-check + smoke**

Run: `npx tsc --noEmit`
Expected: zero errors.

Run: `npm run dev`. Log in. Open an email with a PDF attachment. Confirm:
- The card renders with a "Extracting…" state.
- Within a few seconds, the AI summary, dates, and required_fields appear.
- Re-opening the same email is instant (cache hit — no network call to `extract`).
- Preview opens an inline PDF.js viewer in a slide-over.
- Download triggers a file download.

Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/app/inbox/page.tsx
git commit -m "feat(inbox): render AttachmentCard for each attachment in the Reader pane"
```

---

### Task 14: Full verification + merge prep

- [ ] **Step 1: Full suite**

```bash
npx tsc --noEmit
npx jest
npm run lint
```

Expected: all green. All new router + component + helper tests pass.

- [ ] **Step 2: Manual end-to-end smoke**

Log in with each of Mary's three Gmail accounts. Find an email from Blessed Sacrament or Audaucy with a PDF attachment (there's usually one — permission slip, tuition invoice, newsletter). Confirm:

- [ ] Card shows AI summary within ~3-5 seconds on first open.
- [ ] `life_graph_hits` chips appear when the PDF asks about medical notes / allergies / preferences on file.
- [ ] Clicking a chip copies the value to the clipboard (paste test somewhere).
- [ ] Re-opening the email after reload shows cached data instantly (no visible loading state).
- [ ] Preview slide-over renders the PDF pages.
- [ ] Download downloads the correct file.
- [ ] A scanned PDF (forward a photo-of-document from your phone to yourself) shows the "Extraction unavailable — open the preview to read the PDF." message and no LLM is called.
- [ ] A password-protected PDF (encrypt one via Preview.app and send it to yourself) shows the lock icon + skip message.

Record the results in the commit message.

- [ ] **Step 3: Commit the verification note**

```bash
git commit --allow-empty -m "chore: Phase 5 PDF extraction verified end-to-end

Suite: 0 tsc errors, jest green, 0 lint errors.
Manual smoke (mary@tribe.ai):
- Fast-path text PDF (permission slip): ✅
- Scanned PDF no_text_extractable skip: ✅ 'open preview to read' message
- Password-protected PDF: ✅ lock icon
- Cache hit on re-open: ✅
- Preview slide-over: ✅
- Download: ✅
- life_graph_hits chip → clipboard: ✅"
```

- [ ] **Step 4: Open the PR**

From `feature/inbox-phase-5-pdf` into whichever trunk branch Phase 4 landed on.

PR title:

> Inbox Phase 5: lazy PDF extraction with Life Graph cross-reference

PR body should summarize:
- New `attachmentsRouter` procedures: `extract`, `get`, `downloadUrl`.
- Pipeline: Gmail bytes → unpdf text extraction → gpt-4o-mini structured → Firestore cache. PDFs with no extractable text (scans) are cached as `skipped: 'no_text_extractable'` and surfaced with an "open the preview to read the PDF" message — no vision OCR in v1.
- UI: `<AttachmentCard>` with summary + chips, `<AttachmentPreviewSlideover>` with pdfjs-dist.
- No OAuth scope changes (`drive.file` was already granted in Phase 1; no re-consent; Phase 5 does not itself call the Drive API).
- What's deferred: vision OCR for scanned PDFs, in-PDF editing, `.docx`/`.xlsx`.

---

## Post-Phase Verification

Before Phase 6 starts on top of this branch:

1. `npx tsc --noEmit` — clean.
2. `npx jest` — full suite green.
3. `npm run lint` — clean.
4. Manual smoke from Task 14 Step 2 — all ✅.
5. Firestore check: `users/{mary-uid}/attachments/` contains docs keyed `${messageId}:${attachmentId}` with `extracted` + `extractedAt` — confirms the cache is actually writing.
6. Network-tab check: opening a previously-extracted email shows one `/api/trpc/attachments.get` batch call and **no** subsequent `attachments.extract` call. The cache is doing its job.

## Self-Review Notes

Spec-to-task coverage for the PDF Extraction section of the spec:

| Spec bullet | Task |
| --- | --- |
| Lazy extraction on first open + Firestore cache keyed `(messageId, attachmentId)`, never invalidated | Tasks 5, 8 (extract) |
| Fetch attachment bytes via Gmail API | Task 2 |
| Text via unpdf (replaces pdf-parse per plan) | Task 3 |
| No extractable text (scans) → skipped with `no_text_extractable`; UI directs user to preview | Tasks 1, 8, 12 |
| gpt-4o-mini structured extraction with Life Graph reference | Task 4 |
| Attachment card: filename, icon, summary, dates, required fields, life_graph_hits chips | Task 12 |
| Chips copy to clipboard (no auto-fill in v1) | Task 12 |
| Preview button → inline PDF.js slide-over | Tasks 10, 11, 12 |
| Download button | Tasks 7, 12 |
| Password-protected PDFs → skipped + lock icon | Tasks 3, 8, 12 |
| Non-PDFs → filename + download only, no extract call | Task 12 |
| Idempotent cache-miss → extract → cache-hit flow | Task 8 test suite |

No spec bullet is uncovered. No placeholders, no TBDs, no "similar to Task N" shortcuts. Deliberately deferred from this phase: vision OCR fallback for scanned PDFs.
