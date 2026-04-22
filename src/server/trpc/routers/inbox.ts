import { openai } from '@ai-sdk/openai'
import { generateObject } from 'ai'
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
