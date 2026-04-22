# Anthropic Migration — Inbox Digest

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `inbox.digest` classifier from OpenAI (`@ai-sdk/openai` + `gpt-4o-mini`) to Anthropic (`@anthropic-ai/sdk` + `claude-haiku-4-5`) with prompt caching on the stable preamble. Net result: cheaper, stronger classification per request once the user has cycled the inbox once within the cache window (the profiles block + instruction preamble are reused verbatim across digest refreshes).

**Why now:** Phase 3 ships a three-pane UI that exposes the LLM's output directly to the user (classifications drive row treatment, suggestedActions drive the action deck). Quality regressions are immediately visible. A naive `@ai-sdk/anthropic` drop-in (`d7342ec`) was reverted in `4c3a41a` because Haiku was under-generating suggestedActions against the OpenAI-tuned prompt. The correct migration needs three things the drop-in skipped: (1) restructuring the prompt into a stable system message + volatile user message so it can cache, (2) explicit `cache_control` breakpoints on the cacheable prefix, and (3) a prompt retune that matches Claude's instruction-following profile on structured outputs.

**Architecture:** The existing code builds one monolithic prompt string with `buildDigestPrompt()` and sends it via `generateObject` from the Vercel AI SDK. The new path decomposes that into:

- **`system`** — the classifier rubric (enum definitions, action-type rules, WAITING_ON/FYI/NEWSLETTER-emit-zero-actions rule, date-resolution rule). Frozen bytes, cached with `cache_control: {type: "ephemeral"}`.
- **`messages[0].content`** — tool-call context: NOW block + profiles block + pre-resolved sender identities. Also frozen for the duration of a single digest refresh burst; cached with a second breakpoint.
- **`messages[1].content`** — volatile: the email bodies to classify. No breakpoint; changes every refresh.

Output shape stays identical to today's `ClassifiedEmailsSchema` (Zod, nullable strict-mode-compatible fields). Use `client.messages.parse({ output_config: { format: zodOutputFormat(ClassifiedEmailsSchema) } })` so the SDK handles schema compilation + validation + typed `parsed_output` access, matching what `generateObject` did for us. The rest of the digest procedure (byId map, statusMap merge, suggestedActions-null-to-undefined normalization) is unchanged.

**Tech Stack:** `@anthropic-ai/sdk` (already in project `dependencies`), Zod 4 (already in use), `@anthropic-ai/sdk/helpers/zod`'s `zodOutputFormat` (ships with the SDK). Drop `@ai-sdk/openai` from this call site — `@ai-sdk/openai` + `ai` stay in `package.json` for the `brain-dump` widget and `event-notes` route (`@ai-sdk/anthropic` is there too). Target Haiku 4.5 (`claude-haiku-4-5`); keep Sonnet 4.6 (`claude-sonnet-4-6`) as a fallback model ID behind a single constant in case the quality bar isn't met.

**Spec reference:** `/Users/marymckee/.claude/plugins/cache/claude-plugins-official/superpowers/…` (the `claude-api` skill, used during implementation) for `messages.parse()` call shape + cache-control placement. Prior art in-repo: `src/app/api/calendar/event-notes/route.ts` already uses `@ai-sdk/anthropic` — **do not model the new code on it**; that file uses `generateText` (different AI SDK function) and predates the caching migration plan. Use `@anthropic-ai/sdk` directly.

**Base branch:** Off `main` after the Phase 3 PR merges. Branch `feature/inbox-digest-anthropic`. Does not block Phase 4 (Google writes); Phase 4 ships on its own branch off main, not stacked on top of this one.

---

## Before You Start — Read These

- The `claude-api` skill (invoke `Skill({skill: "claude-api"})`) — it covers model IDs, `messages.parse()` shape, `cache_control` placement, and the prefix-match invariant for caching. Do not skip; it has specifics that change between minor SDK releases.
- `shared/prompt-caching.md` (surfaced by the claude-api skill) — the silent-invalidator audit checklist. `datetime.now()`, non-deterministic JSON serialization, and any per-request flag interpolation in the system prompt will kill cache hit rate silently.
- Current `src/lib/server/digest-prompt.ts` — understand what it emits today before rewriting it. The split into system / pre-resolved-identities / emails-to-classify needs to preserve the same information content; the only change is where each piece lives in the request.
- Current `tests/server/trpc/routers/inbox.test.ts` — its `jest.mock('ai', ...)` + `jest.mock('@ai-sdk/openai', ...)` pattern won't survive the migration verbatim. Understand what it asserts before rewriting.

`AGENTS.md` says: *"Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."* Not directly applicable here (this is a server-module swap, not Next.js code), but if you touch any App Router file, the rule still stands.

---

## File Structure

### New files
- `src/lib/server/digest-client.ts` — wraps `@anthropic-ai/sdk` into a `classifyEmails({ profiles, preResolved, now, timeZone, rawEmails })` function returning `Promise<ClassifiedPayload>` (the `z.infer<typeof ClassifiedEmailsSchema>`). Owns the Anthropic client instance (singleton), cache breakpoints, model-ID constant, and error handling. Testable in isolation.
- `tests/server/digest-client.test.ts` — mocks `@anthropic-ai/sdk`; asserts (a) system prompt carries `cache_control`, (b) the profiles/now/preResolved block is the second-to-last cache breakpoint, (c) the email bodies are unbreakpointed, (d) output is passed through verbatim.

### Modified files
- `src/server/trpc/routers/inbox.ts` — replace the `generateObject` call with `await classifyEmails(...)`. Drop the `openai` + `generateObject` imports. Everything else (byId map, statusMap merge, null-to-undefined normalization) untouched.
- `src/lib/server/digest-prompt.ts` — split `buildDigestPrompt()` into `buildSystemPrompt()` (frozen bytes) + `buildProfileContextBlock()` (cached frozen-ish bytes) + `buildEmailsBlock()` (volatile). Keep the existing single-string `buildDigestPrompt` export as a deprecated helper that composes the three — old tests and any remaining caller can still call it, but the new digest path uses the three pieces separately.
- `tests/server/trpc/routers/inbox.test.ts` — swap the `@ai-sdk/openai` mock for a mock of `@/lib/server/digest-client`'s `classifyEmails`. The test should no longer mock `ai` or `@ai-sdk/openai` at all.
- `package.json` — no new dependency (`@anthropic-ai/sdk` already present); consider removing `@ai-sdk/openai` in a follow-up **only after** confirming no other file in `src/` imports from it (`grep -rn "@ai-sdk/openai" src tests` must return zero before we pull the dep).
- `.env.local` + GitHub secret `ANTHROPIC_API_KEY` — already set. Do not echo the key anywhere.

### Deleted files
- None in this plan. `@ai-sdk/openai` dep removal is a follow-up after confirming no consumers.

### Explicitly NOT touched
- `src/app/api/calendar/event-notes/route.ts` — uses `@ai-sdk/anthropic` + `generateText`; a different migration target, out of scope.
- `src/components/widgets/brain-dump.tsx` — uses `@ai-sdk/react` useChat; separate problem.
- `src/lib/server/classification-schema.ts` — schema stays as-is. The `.nullable()` shape we already landed is provider-agnostic.
- `buildDigestPrompt()` prose — preserve the classifier rubric bytes. This plan moves where it lives, not what it says. Rubric edits belong in a separate prompt-tuning task (see Task 3 below — scope to minimal Claude-specific nudges).

---

## Prerequisites (one-time)

- [ ] **P1. Confirm `ANTHROPIC_API_KEY` is set** locally (`grep -c ANTHROPIC_API_KEY .env.local` == 1) and in GitHub secrets (`gh secret list --repo marymckee-tribe/letsgo | grep -i anthropic`). If missing, set via `gh secret set ANTHROPIC_API_KEY --body '<key>'` from stdin — never via CLI argument.
- [ ] **P2. Confirm baseline is green.** On the branch tip: `npm run ci:verify` must pass (0 errors, 189 jest tests). If any regression, stop — this plan assumes Phase 3 is in a clean state.
- [ ] **P3. Branch.** `git checkout -b feature/inbox-digest-anthropic` off main.

---

## Out of Scope (explicit)

- **Migrating `event-notes` or `brain-dump`.** Those use different AI SDK surfaces and different quality bars. Revisit separately.
- **Removing `@ai-sdk/openai` from `package.json`.** Do this as a follow-up chore after this plan lands AND a grep confirms zero remaining consumers.
- **Prompt overhaul.** The rubric stays. Task 3 below allows narrowly-scoped nudges to push Haiku to commit to suggestedActions more aggressively (the specific regression that forced the revert of `d7342ec`). Anything bigger — reclassification rules, new action types, sourceQuote fidelity changes — is a separate plan.
- **Sonnet 4.6 rollout.** Keep the Sonnet model ID available as a constant + feature flag for A/B if Haiku underperforms, but default ships on Haiku. Any dual-provider A/B belongs in a follow-up.
- **Prompt-caching observability.** Logging `usage.cache_read_input_tokens` vs `usage.cache_creation_input_tokens` to Sentry/a metrics sink is a Phase-2 optimization. Task 2 checks it in dev via a one-off log; productionizing the signal is a later task.
- **Streaming.** The digest is a one-shot classification call, not a chat surface. Stick with non-streaming `messages.parse()`.

---

## Tasks

### Task 0: Confirm baseline + set up the branch

**Files:** none (prerequisite verification).

- [ ] **Step 1:** Run `npm run ci:verify` on main (or the Phase-3-merged tip). Must be 0 errors, 189 tests (the Phase-3 baseline). Record the exact counts.
- [ ] **Step 2:** Run `grep -rn "@ai-sdk/openai\|gpt-4o-mini\|gpt-" src tests` and capture the full list of consumers. Expected: only `src/server/trpc/routers/inbox.ts` and `tests/server/trpc/routers/inbox.test.ts`. If anything else shows up, STOP and update this plan's Out-of-Scope + follow-ups list.
- [ ] **Step 3:** `git checkout -b feature/inbox-digest-anthropic`.
- [ ] **Step 4:** Confirm `@anthropic-ai/sdk` is in `dependencies` and pinned to a version ≥ 0.88.0 (needed for `messages.parse()` + `zodOutputFormat`). If older, bump with `npm install @anthropic-ai/sdk@latest` and commit the lock-file update as the first commit on the branch. Commit message: `chore(deps): pin @anthropic-ai/sdk for messages.parse + zodOutputFormat`.

### Task 1: Split `digest-prompt.ts` into system / context / emails

**Files:**
- Modify: `src/lib/server/digest-prompt.ts`
- Modify: `tests/server/digest-prompt.test.ts` (if exists — audit and extend; create if missing)

**TDD:**

- [ ] **Step 1: Write failing tests** for `buildSystemPrompt()`, `buildProfileContextBlock({profiles, preResolved, now, timeZone})`, and `buildEmailsBlock(rawEmails)`. Assertions: system prompt contains the "Emit ONE classification per email" sentence verbatim; profile block contains all profile IDs and the NOW ISO string; emails block contains each email's subject + id. All three return `string`. The current `buildDigestPrompt()` export composes them in order — add a test that `buildDigestPrompt(input) === [buildSystemPrompt(), buildProfileContextBlock(input), buildEmailsBlock(input.rawEmails)].join('\n\n')` to pin the backward-compat contract.
- [ ] **Step 2:** Run the tests and watch them fail (exports don't exist yet).
- [ ] **Step 3:** Implement the three functions by lifting content out of today's `buildDigestPrompt`. System prompt is the `SYSTEM` constant as-is. Profile block is the NOW + profiles + preResolved JSON. Emails block is the rawEmailsBlock JSON. `buildDigestPrompt()` becomes a thin composer of the three.
- [ ] **Step 4:** Run tests — all green. Run `npm run ci:verify` — still 0 errors, 189 tests.
- [ ] **Step 5: Commit.** `git add src/lib/server/digest-prompt.ts tests/server/digest-prompt.test.ts && git commit -m "refactor(digest-prompt): split into system + context + emails blocks"`

### Task 2: Introduce `digest-client.ts` + migrate `inbox.ts` digest call

**Files:**
- Create: `src/lib/server/digest-client.ts`
- Create: `tests/server/digest-client.test.ts`
- Modify: `src/server/trpc/routers/inbox.ts`
- Modify: `tests/server/trpc/routers/inbox.test.ts`

**Invoke the `claude-api` skill before writing code in this task** — it has the current `messages.parse()` call shape, `cache_control` placement rules, and the list of silent cache invalidators. Do not guess the API.

**Sketch of `digest-client.ts`:**

```ts
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { buildSystemPrompt, buildProfileContextBlock, buildEmailsBlock, type BuildDigestPromptInput } from './digest-prompt'
import { ClassifiedEmailsSchema, type ClassifiedEmail } from './classification-schema'

const MODEL = 'claude-haiku-4-5' as const
// Fallback: 'claude-sonnet-4-6' — swap the constant if Haiku underperforms on evals.
const MAX_TOKENS = 16000

const client = new Anthropic()

export interface ClassifiedPayload { emails: ClassifiedEmail[] }

export async function classifyEmails(input: BuildDigestPromptInput): Promise<ClassifiedPayload> {
  const system = buildSystemPrompt()
  const contextBlock = buildProfileContextBlock(input)
  const emailsBlock = buildEmailsBlock(input.rawEmails)

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: contextBlock, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: emailsBlock },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ClassifiedEmailsSchema) },
  })

  if (!response.parsed_output) {
    throw new Error(`digest: Anthropic returned no parsed_output (stop_reason=${response.stop_reason})`)
  }
  return response.parsed_output
}
```

**TDD:**

- [ ] **Step 1: Write `digest-client.test.ts`** mocking `@anthropic-ai/sdk`. Assertions:
  1. `Anthropic.prototype.messages.parse` is called with `system[0].cache_control.type === 'ephemeral'`.
  2. `messages[0].content[0].cache_control.type === 'ephemeral'` (profile/context block).
  3. `messages[0].content[1].cache_control` is `undefined` (emails block, volatile — no breakpoint).
  4. `model === 'claude-haiku-4-5'`.
  5. Returned `parsed_output` flows through verbatim.
  6. When `parsed_output` is `null`, `classifyEmails` throws with a message that includes `stop_reason`.
- [ ] **Step 2:** Run and watch fail.
- [ ] **Step 3:** Implement per the sketch. Keep the module ~40 lines; no branching logic beyond the null-output guard.
- [ ] **Step 4:** Migrate `src/server/trpc/routers/inbox.ts`:
  - Drop `import { openai } from '@ai-sdk/openai'` and `import { generateObject } from 'ai'`.
  - Add `import { classifyEmails } from '@/lib/server/digest-client'`.
  - Replace the `generateObject({ model, schema, prompt })` call with `await classifyEmails({ rawEmails: promptRawEmails, profiles, preResolved, now: new Date(), timeZone: DEFAULT_TIMEZONE })`.
  - Preserve the destructure `const { emails } = await ...` so the existing `byId` / `statusMap` / `digested.map(...)` code is unchanged.
- [ ] **Step 5:** Update `tests/server/trpc/routers/inbox.test.ts`:
  - Remove `jest.mock('ai', ...)` and `jest.mock('@ai-sdk/openai', ...)`.
  - Remove `import * as aiModule from 'ai'` and all `aiModule.generateObject` references.
  - Add `jest.mock('@/lib/server/digest-client')` and `import { classifyEmails } from '@/lib/server/digest-client'`.
  - Rewrite `(aiModule.generateObject as jest.Mock).mockResolvedValue(...)` → `(classifyEmails as jest.Mock).mockResolvedValue({ emails: [...] })`.
  - The five existing assertions (empty-account fast path, pre-resolved identities passed through, UNREAD default stamping, statusMap merge, per-account failure isolation) all survive the mock swap — verify each.
- [ ] **Step 6:** Run `npm run ci:verify`. Expected: still 0 errors, still 189 tests.
- [ ] **Step 7: Commit.** `git add src/lib/server/digest-client.ts tests/server/digest-client.test.ts src/server/trpc/routers/inbox.ts tests/server/trpc/routers/inbox.test.ts && git commit -m "feat(digest): migrate to @anthropic-ai/sdk with prompt caching on system + context"`

### Task 3: Runtime smoke + Haiku prompt nudge (if needed)

**Goal:** confirm Haiku emits suggestedActions for CALENDAR_EVENT / TODO / NEEDS_REPLY emails at a rate comparable to gpt-4o-mini. The OpenAI-tuned prompt said "Emit ZERO or more suggestedActions" — which Haiku read more conservatively than intended, producing empty `suggestedActions: []` in too many cases (the regression that forced the `d7342ec` revert).

**Files:**
- Optionally modify: `src/lib/server/digest-prompt.ts` (Haiku-specific nudge inside `buildSystemPrompt`)

**Steps:**

- [ ] **Step 1:** Start the dev server and log into the app. Reload `/inbox`. Open DevTools → Network → click the `inbox.digest` tRPC request. In the response, count: (a) total emails, (b) emails classified as CALENDAR_EVENT / TODO / NEEDS_REPLY, (c) emails in that subset with at least one suggestedAction. Target: ≥ 80% of (b) should have at least one action. Record the numbers.
- [ ] **Step 2: If ≥ 80% hit rate**, skip to Step 4. If below, apply the minimal prompt nudge below.
- [ ] **Step 3: Prompt nudge.** Add a single sentence to `buildSystemPrompt()` after the existing WAITING_ON/FYI/NEWSLETTER rule:

  > *"For every CALENDAR_EVENT, TODO, and NEEDS_REPLY classification, emit at least one suggestedAction — the sourceQuote + confidence fields let you flag uncertainty rather than skip. Emitting zero actions on these classifications is a failure."*

  Commit separately: `fix(digest-prompt): instruct Claude to always emit at least one action for actionable classifications`. Retest Step 1. If still below 80%, STOP and escalate — the fix may need to move to prose elsewhere or a few-shot example in the context block, which is a larger change.
- [ ] **Step 4:** Inspect the server logs for the `usage` object on the response. Confirm `cache_creation_input_tokens` is populated on the first digest and `cache_read_input_tokens` is populated on the second (load `/inbox` twice within 5 minutes; the second call should show cache reads on system + context). If `cache_read_input_tokens` is zero on the second call, a silent invalidator is at work — diff the two request bodies (add `console.log(JSON.stringify(system))` + `console.log(JSON.stringify(messages[0].content[0].text))` temporarily in `digest-client.ts` to capture) and find the byte drift. Most likely culprit: `new Date()` at the call site leaks a per-request timestamp into `buildProfileContextBlock` via the NOW field — if so, the fix is to quantize `now` to the minute or push it into the volatile emails block instead of the cached context block.
- [ ] **Step 5:** Remove any temporary console.logs. Commit any Step-4 fix separately. `git commit -m "fix(digest): ..."`.

### Task 4: Merge prep

**Files:**
- Modify: `docs/superpowers/plans/2026-04-22-anthropic-migration-inbox-digest.md` (this file — tick off the checkboxes for reference)
- Add: entry in whatever "shipped" summary the repo uses (currently the "What's Next" footer in the Phase 2 plan is the convention — extend that or create a sibling)

**Steps:**

- [ ] **Step 1:** Full-suite: `npx tsc --noEmit && npx jest --ci && npm run lint`. All three must pass.
- [ ] **Step 2:** Grep confirms: `grep -rn "@ai-sdk/openai" src tests` should now return zero hits in `src/`. `tests/` may still have references in tests we don't mock against — verify only by inspection.
- [ ] **Step 3:** Empty verification commit (same convention Phase 3 used):

  ```
  chore: Anthropic migration for inbox digest verified

  - Digest LLM: gpt-4o-mini → claude-haiku-4-5
  - Prompt caching: system + context block (cache_read rate confirmed in dev)
  - Prompt tuning: [none | single action-emission nudge]
  - Suite: 0 tsc errors, 0 lint errors, N jest tests green
  - Smoke: Y/Z CALENDAR_EVENT/TODO/NEEDS_REPLY emails produced at least one suggestedAction
  ```

- [ ] **Step 4:** Open PR from `feature/inbox-digest-anthropic` into `main`. Title: `Anthropic migration for inbox digest (haiku 4.5 + prompt caching)`. Body references this plan, includes the smoke numbers, and calls out the `@ai-sdk/openai` removal as a follow-up.

---

## Post-Phase Verification

Before Phase 4 (Google writes) picks this up as a baseline:

1. `npx tsc --noEmit` — clean.
2. `npx jest` — both node and jsdom projects green, test count ≥ 189 (Task 2 added one suite but didn't change the count meaningfully).
3. `npm run lint` — clean.
4. On two back-to-back `/inbox` reloads within 5 minutes: response `usage.cache_read_input_tokens` > 0 on the second call. If not, Task 3 Step 4's audit didn't actually eliminate the silent invalidator.
5. Suggested-action emission rate on a 10-email sample: ≥ 80% of actionable-classification emails carry at least one `suggestedAction`.
6. `grep -rn "gpt-4o-mini" src` returns zero hits.

## What's Next

- **Remove `@ai-sdk/openai` dependency** — follow-up PR after confirming no consumers in `src/`. One line in `package.json`.
- **Productionize cache observability** — structured logs of `cache_creation_input_tokens` / `cache_read_input_tokens` from every digest request into Sentry's breadcrumbs or a Grafana panel, so regressions (a silent invalidator sneaking in via a prompt edit) surface without manually tailing the dev server.
- **Evaluate Sonnet 4.6 on a few-shot eval set** — if specific classification categories underperform Haiku (e.g. ambiguous WAITING_ON vs NEEDS_REPLY), swap the model-ID constant and re-smoke. Feature-flag if the quality bar is tight.
- **Migrate `event-notes` and `brain-dump`** to the direct SDK if they'd benefit from caching too. Separate plans.
