import { formatInTimeZone } from 'date-fns-tz'
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

export interface BuildDigestPromptInput {
  rawEmails: PromptRawEmail[]
  profiles: EntityProfile[]
  preResolved: Record<string, PreResolvedIdentity | null>
  now: Date
  timeZone: string
}

export const ISO_LOCAL = "yyyy-MM-dd'T'HH:mm:ssxxx"

const SYSTEM = `You are a Chief of Staff AI. You classify the user's unread emails and extract committable actions.

Emit ONE classification per email from this enum:
- CALENDAR_EVENT — email implies a scheduled event (school trip, meeting, appointment)
- TODO — email implies a concrete to-do the user must act on
- NEEDS_REPLY — email requires a written reply
- WAITING_ON — user is waiting on someone else to respond or act
- FYI — informational, no action required
- NEWSLETTER — subscription content; auto-dimmed by the UI

suggestedActions — emit per the rules below.

Action types & fields:
- CALENDAR_EVENT — title, date (epoch ms), time (12-hour "h:mm AM/PM"), context
- TODO — title, date (due, epoch ms or null), context
- NEEDS_REPLY — title (subject of the reply, typically "Re: <original subject>"), context

Emission rules (dedupe by type — never more than one action of the same type per email):
1. NEWSLETTER classifications: emit zero actions.
2. Every other classification: emit the type-specific action matching the classification when applicable:
   - CALENDAR_EVENT → one CALENDAR_EVENT action with specific date/time
   - TODO → one TODO action with the specific concrete task
   - NEEDS_REPLY → one NEEDS_REPLY action
3. ALSO, for every non-NEWSLETTER email: emit a NEEDS_REPLY action unless the sender is a no-reply address (sender contains "noreply", "no-reply", "donotreply", or similar). The user should be able to reply to virtually every email.
4. ALSO, for every non-NEWSLETTER email: emit a TODO action describing what the user might plausibly do — e.g. "Follow up on X", "Review Y", "Confirm attendance". Skip ONLY when the email is purely informational with no conceivable user action (e.g. a generic system status notification).

Type-specific actions from rule 2 are high-confidence; fallback actions from rules 3 and 4 are typically "low" confidence.

Field requirements for every action:
- sourceQuote — an exact sentence from the email that motivates the action. For fallback TODO/REPLY actions from rules 3/4, use the subject line or the most relevant sentence. Never paraphrase.
- confidence — "high" | "medium" | "low".
- Never invent dates. If the email doesn't specify a date and you cannot infer one unambiguously, set date to null and use confidence "low".

Sender identity & dates:
- Match the sender to a Life Graph profile (personId) or organization (orgName) when possible. If the user has pre-resolved an identity for an email id (provided below), use it as a strong hint but override if the email content clearly points elsewhere — mark confidence accordingly.
- Dates you EMIT must be epoch milliseconds. Dates in the INPUT are rendered as ISO-8601 local-time strings with timezone offset — resolve relative references ("Thursday at 8am") against the "now" value provided and return the resulting instant as epoch milliseconds.
`

export function buildDigestPrompt(input: BuildDigestPromptInput): string {
  const { rawEmails, profiles, preResolved, now, timeZone } = input

  const profileBlock = profiles.map(p => ({
    id: p.id,
    name: p.name,
    type: p.type,
    currentContext: p.currentContext,
    medicalNotes: p.medicalNotes,
    knownDomains: p.knownDomains ?? [],
    knownSenders: p.knownSenders ?? [],
  }))

  const rawEmailsBlock = rawEmails.map(e => ({
    id: e.id,
    subject: e.subject,
    sender: e.sender,
    snippet: e.snippet ?? '',
    fullBody: e.fullBody,
    sentAt: formatInTimeZone(new Date(e.date), timeZone, ISO_LOCAL),
    accountId: e.accountId,
  }))

  const nowBlock = {
    instant: formatInTimeZone(now, timeZone, ISO_LOCAL),
    timeZone,
  }

  return [
    SYSTEM,
    '',
    'NOW (use for relative-date resolution):',
    JSON.stringify(nowBlock, null, 2),
    '',
    'LIFE GRAPH PROFILES (reference for sender identity + context):',
    JSON.stringify(profileBlock, null, 2),
    '',
    'PRE-RESOLVED SENDER IDENTITIES (strong hints, keyed by email id):',
    JSON.stringify(preResolved, null, 2),
    '',
    'EMAILS TO CLASSIFY:',
    JSON.stringify(rawEmailsBlock, null, 2),
    '',
    'Return a single JSON object matching the schema: { emails: [...] }',
  ].join('\n')
}
