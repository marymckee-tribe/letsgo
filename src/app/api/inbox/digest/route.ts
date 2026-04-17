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
    const status = e instanceof HttpError ? e.status : (e.status ?? 500)
    return NextResponse.json({ error: e.message }, { status })
  }
}
