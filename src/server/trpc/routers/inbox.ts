import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, protectedProcedure } from '../index'
import { rateLimit } from '@/lib/server/rate-limit'
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
import { setHubStatus, getHubStatusMap } from '@/lib/server/inbox-status'
import {
  getEmailState,
  upsertEmailState,
  updateEmailHubStatus,
  markOrphanActionsDismissedByClear,
} from '@/lib/server/emails-store'
import type { StoredEmail, StoredAction, StoredActionStatus } from '@/lib/server/emails-store'
import type { EmailActionStatus } from '@/lib/store'
import { markMessageRead } from '@/lib/server/gmail-writer'

/** Map internal StoredActionStatus → wire-safe EmailActionStatus (DISMISSED_BY_CLEAR collapses to DISMISSED). */
function toWireStatus(s: StoredActionStatus): EmailActionStatus {
  if (s === 'DISMISSED_BY_CLEAR') return 'DISMISSED'
  return s
}

const DEFAULT_TIMEZONE = process.env.HUB_DEFAULT_TIMEZONE ?? 'America/New_York'

export const inboxRouter = router({
  digest: protectedProcedure.use(rateLimit({ max: 20, windowMs: 60_000 })).query(async ({ ctx }) => {
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
      } catch (err: unknown) {
        const e = err as { message?: string }
        ctx.logger.warn({ accountId: acc.id, error: e.message ?? 'unknown' }, 'inbox.digest: per-account fetch failed')
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

    const [byId, statusMap] = [
      new Map(rawEmails.map(r => [r.id, r])),
      await getHubStatusMap(ctx.uid),
    ]
    const digested = object.emails.map(ai => {
      // TODO(phase-3+): decide — drop unmatched AI entries or log + fallback. Current fallback silently misassigns fullBody/date when the LLM hallucinates an id.
      const raw = byId.get(ai.id) ?? rawEmails[0]
      return {
        id: ai.id,
        classification: ai.classification,
        snippet: ai.snippet,
        senderIdentity: ai.senderIdentity
          ? {
              confidence: ai.senderIdentity.confidence,
              personId: ai.senderIdentity.personId ?? undefined,
              orgName: ai.senderIdentity.orgName ?? undefined,
            }
          : undefined,
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
        hubStatus: statusMap[ai.id]?.hubStatus ?? 'UNREAD',
      }
    })

    // Phase 4: seed/merge per-email Firestore state.
    // The commit procedures read the full action back from Firestore (via
    // action-resolver) without re-running the digest, so the stored shape must
    // carry type/title/date/time/context/sourceQuote — not just id+status.
    const buildStoredActions = (
      emailActions: (typeof digested)[number]['suggestedActions'],
      storedById: Map<string, StoredAction>,
    ): StoredAction[] =>
      emailActions.map((a) => {
        const s = storedById.get(a.id)
        return {
          id: a.id,
          type: a.type,
          title: a.title,
          date: a.date,
          time: a.time,
          context: a.context,
          sourceQuote: a.sourceQuote,
          confidence: a.confidence,
          status: s?.status ?? 'PROPOSED',
          ...(s?.googleId ? { googleId: s.googleId } : {}),
          ...(s?.errorMessage ? { errorMessage: s.errorMessage } : {}),
        } as StoredAction
      })

    const merged = await Promise.all(digested.map(async (email) => {
      const stored = await getEmailState(ctx.uid, email.id)
      if (!stored) {
        // First read — seed with UNREAD + full action payload at PROPOSED
        const seedDoc: StoredEmail = {
          id: email.id,
          hubStatus: 'UNREAD',
          suggestedActions: buildStoredActions(email.suggestedActions, new Map()),
        }
        await upsertEmailState(ctx.uid, seedDoc)
        return { ...email, hubStatus: 'UNREAD' as const }
      }
      // Subsequent reads — prefer stored hubStatus and per-action status/googleId
      const storedById = new Map<string, StoredAction>(
        (stored.suggestedActions ?? []).map((a) => [a.id, a]),
      )
      // Self-heal: if any stored action is missing `type` (docs seeded before this fix),
      // rewrite the full shape so commit procedures can read it.
      const needsBackfill = (stored.suggestedActions ?? []).some(
        (a) => typeof (a as { type?: unknown }).type !== 'string',
      )
      if (needsBackfill) {
        await upsertEmailState(ctx.uid, {
          id: email.id,
          hubStatus: stored.hubStatus,
          suggestedActions: buildStoredActions(email.suggestedActions, storedById),
        })
      }
      const mergedActions = email.suggestedActions.map((a) => {
        const s = storedById.get(a.id)
        if (!s) return a
        return { ...a, status: toWireStatus(s.status), ...(s.googleId ? { googleId: s.googleId } : {}) }
      })
      return { ...email, hubStatus: stored.hubStatus, suggestedActions: mergedActions }
    }))

    return { emails: merged }
  }),

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

  markUnread: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await setHubStatus(ctx.uid, input.id, 'UNREAD')
      return { ok: true }
    }),
})
